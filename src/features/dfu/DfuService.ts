const STM_VENDOR_ID = 0x0483;
const STM_DFU_PRODUCT_ID = 0xdf11;
const APP_BASE_ADDRESS = 0x08000000;
const TRANSFER_SIZE = 2048;

const DfuRequest = {
  Dnload: 1,
  GetStatus: 3,
  ClearStatus: 4,
  Abort: 6,
} as const;

/** USB DFU 1.1 device states (subset used during manifest). */
const DfuState = {
  dfuIDLE: 2,
  dfuDNLOAD_IDLE: 5,
  dfuMANIFEST_SYNC: 6,
  dfuMANIFEST: 7,
  dfuMANIFEST_WAIT_RESET: 8,
} as const;

type DfuRequestCode = (typeof DfuRequest)[keyof typeof DfuRequest];

interface DfuStatus {
  status: number;
  pollTimeout: number;
  state: number;
}

interface FlashSector {
  start: number;
  size: number;
}

interface ProtectedRange {
  start: number;
  end: number;
  name: string;
}

/** STM32F405 sector layout — matches odrive-wheel.html DfuSe logic. */
const STM32F4_SECTORS: FlashSector[] = [
  { start: 0x08000000, size: 16 * 1024 }, // S0
  { start: 0x08004000, size: 16 * 1024 }, // S1 — FFB EEPROM (protected)
  { start: 0x08008000, size: 16 * 1024 }, // S2 — FFB EEPROM (protected)
  { start: 0x0800c000, size: 16 * 1024 }, // S3
  { start: 0x08010000, size: 64 * 1024 }, // S4
  { start: 0x08020000, size: 128 * 1024 }, // S5
  { start: 0x08040000, size: 128 * 1024 }, // S6
  { start: 0x08060000, size: 128 * 1024 }, // S7
  { start: 0x08080000, size: 128 * 1024 }, // S8
  { start: 0x080a0000, size: 128 * 1024 }, // S9
  // S10/S11 @ 0x080C0000 — ODrive NVM, outside typical .bin image
];

/** FFB emulated EEPROM — must not be erased or overwritten during DFU. */
const PROTECTED_RANGES: ProtectedRange[] = [
  { start: 0x08004000, end: 0x0800c000, name: 'FFB EEPROM (S1+S2)' },
];

export type DfuProgress = (message: string, progress?: number) => void;

function inProtected(addr: number): boolean {
  return PROTECTED_RANGES.some((range) => addr >= range.start && addr < range.end);
}

function sectorIndex(sector: FlashSector): number {
  return STM32F4_SECTORS.indexOf(sector);
}

export class DfuService {
  private device: USBDevice | null = null;

  async requestBootloader(): Promise<string> {
    if (!navigator.usb) {
      throw new Error('WebUSB is not available');
    }
    this.device = await navigator.usb.requestDevice({
      filters: [{ vendorId: STM_VENDOR_ID, productId: STM_DFU_PRODUCT_ID }],
    });
    await this.device.open();
    await this.device.selectConfiguration(1);
    await this.device.claimInterface(0);
    return this.device.productName || 'STM32 BOOTLOADER';
  }

  async flash(binary: ArrayBuffer, onProgress: DfuProgress): Promise<void> {
    if (!this.device) {
      await this.requestBootloader();
    }
    if (!this.device) {
      throw new Error('DFU bootloader is not connected');
    }

    onProgress('Clearing DFU status', 0);
    await this.clearStatus();
    await this.abort();

    const data = new Uint8Array(binary);
    const endAddr = APP_BASE_ADDRESS + data.byteLength;
    const sectorsAll = STM32F4_SECTORS.filter(
      (sector) => sector.start < endAddr && sector.start + sector.size > APP_BASE_ADDRESS,
    );
    const sectorsToErase = sectorsAll.filter((sector) => !inProtected(sector.start));
    const skippedSectors = sectorsAll.filter((sector) => inProtected(sector.start));

    if (skippedSectors.length > 0) {
      onProgress(
        `Skipping protected sector(s): ${skippedSectors.map((s) => `S${sectorIndex(s)}`).join(', ')} (FFB EEPROM preserved)`,
        1,
      );
    }

    onProgress(`Erasing ${sectorsToErase.length} sector(s)...`, 2);
    for (let i = 0; i < sectorsToErase.length; i += 1) {
      const sector = sectorsToErase[i];
      await this.erasePage(sector.start);
      onProgress(
        `Erased S${sectorIndex(sector)} @ 0x${sector.start.toString(16)}`,
        2 + ((i + 1) / sectorsToErase.length) * 18,
      );
    }

    const totalChunks = Math.ceil(data.byteLength / TRANSFER_SIZE);
    onProgress(`Writing ${data.byteLength} bytes (${totalChunks} chunks, skipping protected ranges)...`, 20);

    let curBaseAddr = -1;
    let curBlockOffset = 0;
    let chunksWritten = 0;
    let chunksSkipped = 0;

    for (let i = 0; i < totalChunks; i += 1) {
      const start = i * TRANSFER_SIZE;
      const end = Math.min(start + TRANSFER_SIZE, data.byteLength);
      const chunkAddr = APP_BASE_ADDRESS + start;
      const chunkEndAddr = APP_BASE_ADDRESS + end;

      const fullyProtected = PROTECTED_RANGES.some(
        (range) => chunkAddr >= range.start && chunkEndAddr <= range.end,
      );
      if (fullyProtected) {
        chunksSkipped += 1;
        curBaseAddr = -1;
        continue;
      }

      if (curBaseAddr === -1) {
        await this.setAddressAndIdle(chunkAddr);
        curBaseAddr = chunkAddr;
        curBlockOffset = 0;
      }

      const chunk = data.slice(start, end);
      const blockNum = 2 + curBlockOffset;
      await this.download(blockNum, chunk);
      curBlockOffset += 1;
      chunksWritten += 1;

      if (i % 16 === 0 || i === totalChunks - 1) {
        onProgress(
          `Wrote chunk ${i + 1}/${totalChunks} (${chunksSkipped} skipped)`,
          20 + ((i + 1) / totalChunks) * 75,
        );
      }
    }

    onProgress(`Download complete — ${chunksWritten} chunks written, ${chunksSkipped} skipped`, 96);
    await this.manifest(onProgress);
    onProgress('DFU sequence complete — board rebooting', 100);
  }

  /** Zero-length DNLOAD + manifest poll. USB may detach — that is success. */
  private async manifest(onProgress: DfuProgress): Promise<void> {
    onProgress('Manifesting firmware', 98);
    try {
      await this.controlOut(DfuRequest.Dnload, 0, new Uint8Array());
    } catch {
      await this.releaseDevice();
      onProgress('Bootloader disconnected — board rebooting', 99);
      return;
    }

    try {
      let status = await this.getStatus();
      for (let attempt = 0; attempt < 200; attempt += 1) {
        if (status.state === DfuState.dfuMANIFEST || status.state === DfuState.dfuMANIFEST_SYNC) {
          await new Promise((resolve) => window.setTimeout(resolve, Math.max(status.pollTimeout, 5)));
          status = await this.getStatus();
          continue;
        }
        if (
          status.state === DfuState.dfuMANIFEST_WAIT_RESET ||
          status.state === DfuState.dfuIDLE ||
          status.state === DfuState.dfuDNLOAD_IDLE
        ) {
          break;
        }
        await new Promise((resolve) => window.setTimeout(resolve, Math.max(status.pollTimeout, 10)));
        status = await this.getStatus();
      }
    } catch {
      // STM ROM bootloader detaches during manifest reset — expected.
      onProgress('Bootloader disconnected — board rebooting', 99);
    }

    await this.releaseDevice();
  }

  private async releaseDevice(): Promise<void> {
    if (!this.device) {
      return;
    }
    try {
      if (this.device.opened) {
        await this.device.close();
      }
    } catch {
      // device may already be gone after reset
    }
    this.device = null;
  }

  private async setAddressAndIdle(address: number): Promise<void> {
    await this.setAddress(address);
    try {
      await this.abort();
    } catch {
      // ignore — bootloader may already be idle
    }
    await this.pollIdle();
  }

  private async setAddress(address: number): Promise<void> {
    await this.specialCommand(0x21, this.addressPayload(address));
  }

  private async erasePage(address: number): Promise<void> {
    await this.specialCommand(0x41, this.addressPayload(address));
  }

  private async specialCommand(command: number, payload: Uint8Array): Promise<void> {
    const data = new Uint8Array(1 + payload.length);
    data[0] = command;
    data.set(payload, 1);
    await this.download(0, data);
  }

  private addressPayload(address: number): Uint8Array {
    return new Uint8Array([
      address & 0xff,
      (address >> 8) & 0xff,
      (address >> 16) & 0xff,
      (address >> 24) & 0xff,
    ]);
  }

  private async download(block: number, data: Uint8Array): Promise<void> {
    await this.controlOut(DfuRequest.Dnload, block, data);
    await this.pollIdle();
  }

  private async clearStatus(): Promise<void> {
    await this.controlOut(DfuRequest.ClearStatus, 0, new Uint8Array());
  }

  private async abort(): Promise<void> {
    await this.controlOut(DfuRequest.Abort, 0, new Uint8Array());
  }

  private async pollIdle(): Promise<void> {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const status = await this.getStatus();
      if (status.status !== 0) {
        throw new Error(`DFU error status ${status.status}`);
      }
      if (status.state === DfuState.dfuIDLE || status.state === DfuState.dfuDNLOAD_IDLE) {
        return;
      }
      await new Promise((resolve) => window.setTimeout(resolve, Math.max(status.pollTimeout, 10)));
    }
    throw new Error('Timed out waiting for DFU idle state');
  }

  private async getStatus(): Promise<DfuStatus> {
    const result = await this.controlIn(DfuRequest.GetStatus, 0, 6);
    const data = result.data;
    if (!data) {
      throw new Error('DFU getStatus returned no data');
    }
    return {
      status: data.getUint8(0),
      pollTimeout: data.getUint8(1) | (data.getUint8(2) << 8) | (data.getUint8(3) << 16),
      state: data.getUint8(4),
    };
  }

  private async controlOut(request: DfuRequestCode, value: number, data: Uint8Array): Promise<void> {
    if (!this.device) {
      throw new Error('DFU bootloader is not connected');
    }
    await this.device.controlTransferOut(
      {
        requestType: 'class',
        recipient: 'interface',
        request,
        value,
        index: 0,
      },
      data,
    );
  }

  private async controlIn(request: DfuRequestCode, value: number, length: number): Promise<USBInTransferResult> {
    if (!this.device) {
      throw new Error('DFU bootloader is not connected');
    }
    return this.device.controlTransferIn(
      {
        requestType: 'class',
        recipient: 'interface',
        request,
        value,
        index: 0,
      },
      length,
    );
  }
}

export const dfuService = new DfuService();
