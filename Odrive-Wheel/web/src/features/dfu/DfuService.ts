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

type DfuRequestCode = (typeof DfuRequest)[keyof typeof DfuRequest];

interface DfuStatus {
  status: number;
  pollTimeout: number;
  state: number;
}

export type DfuProgress = (message: string, progress?: number) => void;

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
    await this.setAddress(APP_BASE_ADDRESS);

    const pageSize = 16 * 1024;
    const totalErase = Math.ceil(binary.byteLength / pageSize);
    for (let page = 0; page < totalErase; page += 1) {
      await this.erasePage(APP_BASE_ADDRESS + page * pageSize);
      onProgress(`Erased page ${page + 1}/${totalErase}`, page / totalErase * 20);
    }

    const data = new Uint8Array(binary);
    let block = 2;
    for (let offset = 0; offset < data.byteLength; offset += TRANSFER_SIZE) {
      const chunk = data.slice(offset, offset + TRANSFER_SIZE);
      await this.download(block, chunk);
      block += 1;
      onProgress(`Wrote ${Math.min(offset + chunk.byteLength, data.byteLength)} / ${data.byteLength} bytes`, 20 + (offset / data.byteLength) * 75);
    }

    onProgress('Manifesting firmware', 98);
    await this.download(0, new Uint8Array());
    onProgress('DFU sequence complete', 100);
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
      if (status.state === 2 || status.state === 5) {
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
