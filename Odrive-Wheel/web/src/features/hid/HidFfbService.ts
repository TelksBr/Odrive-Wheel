const OPENFFBOARD_VENDOR_ID  = 0x1209;
const ODRIVE_WHEEL_PRODUCT_ID = 0x0d40;

/* ── HID PID block and type assignments ─────────────────────────────────── */
// Each "block" is a slot in the firmware's effect pool.
// Types come from the USB HID PID spec (1=CF, 8=Spring, 9=Damper, 11=Friction).
export type EffectKey = 'cf' | 'sp' | 'da' | 'fr';
export const EFFECT_KEYS: EffectKey[] = ['cf', 'sp', 'da', 'fr'];

const BLOCK: Record<EffectKey, number> = { cf: 1, sp: 2, da: 3, fr: 4 };
const TYPE:  Record<EffectKey, number> = { cf: 1, sp: 8, da: 9, fr: 11 };

/* ── Low-level report builders (matching our HID descriptor) ─────────────── */

// 0x01  SET_EFFECT_REPORT — 12 bytes
function buildSetEffect(blockIdx: number, type: number, durationMs = 0xffff, gain = 255): Uint8Array {
  return new Uint8Array([
    blockIdx, type,
    durationMs & 0xff, (durationMs >> 8) & 0xff,
    0, 0,    // TriggerRepeatInterval
    0, 0,    // SamplePeriod
    0, 0,    // StartDelay
    gain,
    0,       // TriggerButton
  ]);
}

// 0x03  SET_CONDITION_REPORT — 14 bytes (Spring / Damper / Friction)
function buildCondition(blockIdx: number, posCoef: number, negCoef = posCoef): Uint8Array {
  const i16 = (v: number) => [v & 0xff, (v >> 8) & 0xff];
  return new Uint8Array([
    blockIdx,
    0x00,           // paramBlockOffset | typeSpecificBlockOffset
    ...i16(0),      // centerPointOffset
    ...i16(posCoef), ...i16(negCoef),
    ...i16(0x7fff), ...i16(0x7fff),   // posSat / negSat (max)
    ...i16(0),      // deadBand
  ]);
}

// 0x05  SET_CONSTANT_FORCE_REPORT — 3 bytes
function buildConstantForce(blockIdx: number, magnitudeS16: number): Uint8Array {
  const m = magnitudeS16 & 0xffff;
  return new Uint8Array([blockIdx, m & 0xff, (m >> 8) & 0xff]);
}

// 0x0A  EFFECT_OPERATION_REPORT — 3 bytes  (op: 1=Start, 2=StartSolo, 3=Stop)
function buildOp(blockIdx: number, op: number, loopCount = 1): Uint8Array {
  return new Uint8Array([blockIdx, op, loopCount]);
}

// pct 0..100 → HID coefficient 0..32767
export function pctToCoef(pct: number): number {
  return Math.round((Math.max(0, Math.min(100, pct)) / 100) * 0x7fff);
}

export function pctToMagnitude(pct: number): number {
  return Math.round((Math.max(-100, Math.min(100, pct)) / 100) * 0x7fff);
}

/** Wheel position in degrees from HID input report 0x01 (X axis at byte offset 8). */
export function parseWheelPositionFromReport(event: { reportId: number; data: DataView }, halfRangeDeg: number): number | null {
  if (event.reportId !== 0x01 || event.data.byteLength < 10) {
    return null;
  }
  const x = event.data.getInt16(8, true);
  return (x / 32767) * halfRangeDeg;
}

type ConnectionListener = (connected: boolean, deviceName: string, unplugged?: boolean) => void;

const EMPTY_RUNNING: Record<EffectKey, boolean> = { cf: false, sp: false, da: false, fr: false };

/* ── Service ─────────────────────────────────────────────────────────────── */
export class HidFfbService {
  private device: HIDDevice | null = null;
  private running: Record<EffectKey, boolean> = { ...EMPTY_RUNNING };
  private connectionListeners = new Set<ConnectionListener>();
  private disconnectHandler: (() => void) | null = null;

  get connected(): boolean {
    return Boolean(this.device?.opened);
  }

  onConnectionChange(listener: ConnectionListener): () => void {
    this.connectionListeners.add(listener);
    listener(this.connected, this.device?.productName ?? '');
    return () => this.connectionListeners.delete(listener);
  }

  private notifyConnection(connected: boolean, unplugged = false): void {
    const deviceName = connected ? (this.device?.productName ?? '') : '';
    for (const listener of this.connectionListeners) {
      listener(connected, deviceName, unplugged);
    }
  }

  private clearRunningState(): void {
    this.running = { ...EMPTY_RUNNING };
  }

  private bindDisconnectListener(device: HIDDevice): void {
    if (this.disconnectHandler && this.device) {
      (this.device as unknown as EventTarget).removeEventListener('disconnect', this.disconnectHandler);
    }
    this.disconnectHandler = () => {
      this.device = null;
      this.clearRunningState();
      this.notifyConnection(false, true);
    };
    if ('addEventListener' in device && typeof (device as { addEventListener?: unknown }).addEventListener === 'function') {
      (device as unknown as EventTarget).addEventListener('disconnect', this.disconnectHandler);
    }
  }

  /** Stop every firmware effect slot — ignores local running flags (firmware may still be active). */
  private async stopAllOnDevice(): Promise<void> {
    if (!this.device?.opened) {
      return;
    }
    for (const key of EFFECT_KEYS) {
      try {
        await this.sendReport(0x0a, buildOp(BLOCK[key], 3, 0));
      } catch {
        // Device may drop mid-sequence; caller still clears local state.
      }
    }
    try {
      await this.sendReport(0x0c, new Uint8Array([0x04]));
    } catch {
      // ignore
    }
  }

  async connect(): Promise<string> {
    if (!navigator.hid) {
      throw new Error('WebHID is not available');
    }
    const devices = await navigator.hid.requestDevice({
      filters: [{ vendorId: OPENFFBOARD_VENDOR_ID, productId: ODRIVE_WHEEL_PRODUCT_ID }],
    });
    const device = devices[0];
    if (!device) {
      throw new Error('No Odrive-Wheel HID device selected');
    }
    return this.attachDevice(device);
  }

  /** Re-open a device the user already approved in this browser (no picker). */
  async restoreGrantedDevice(): Promise<string | null> {
    if (!navigator.hid || this.connected) {
      return this.device?.productName ?? null;
    }
    const devices = await navigator.hid.getDevices();
    const device = devices.find(
      (entry) => entry.vendorId === OPENFFBOARD_VENDOR_ID && entry.productId === ODRIVE_WHEEL_PRODUCT_ID,
    );
    if (!device) {
      return null;
    }
    return this.attachDevice(device);
  }

  private async attachDevice(device: HIDDevice): Promise<string> {
    if (!device.opened) {
      await device.open();
    }
    this.device = device;
    await this.sendReport(0x0c, new Uint8Array([0x01]));
    await this.sendReport(0x0d, new Uint8Array([255]));
    await this.stopAllOnDevice();
    this.clearRunningState();
    this.bindDisconnectListener(device);
    this.notifyConnection(true);
    return device.productName;
  }

  async disconnect(): Promise<void> {
    const device = this.device;
    try {
      if (device?.opened) {
        await this.stopAllOnDevice();
      }
    } finally {
      if (device?.opened) {
        try {
          await device.close();
        } catch {
          // ignore
        }
      }
      this.device = null;
      this.clearRunningState();
      this.notifyConnection(false);
    }
  }

  /** Start or update a specific effect. Safe to call while already running (updates parameters). */
  async startEffect(key: EffectKey, params: { pct?: number; magnitudePct?: number }): Promise<void> {
    const blockIdx = BLOCK[key];
    const type     = TYPE[key];

    // 1. Configure the effect slot (infinite duration)
    await this.sendReport(0x01, buildSetEffect(blockIdx, type, 0xffff, 255));

    // 2. Set parameters
    if (key === 'cf') {
      const raw = params.magnitudePct ?? params.pct ?? 0;
      const clamped = Math.max(-100, Math.min(100, raw));
      const mag = Math.round((clamped / 100) * 0x7fff);
      await this.sendReport(0x05, buildConstantForce(blockIdx, mag));
    } else {
      const coef = pctToCoef(params.pct ?? 50);
      await this.sendReport(0x03, buildCondition(blockIdx, coef));
    }

    // 3. Start (loopCount=0 → infinite)
    await this.sendReport(0x0a, buildOp(blockIdx, 1, 0));
    this.running[key] = true;
  }

  async stopEffect(key: EffectKey): Promise<void> {
    if (this.device?.opened) {
      await this.sendReport(0x0a, buildOp(BLOCK[key], 3, 0));
    }
    this.running[key] = false;
  }

  async stopAll(): Promise<void> {
    await this.stopAllOnDevice();
    this.clearRunningState();
  }

  isRunning(key: EffectKey): boolean {
    return this.running[key];
  }

  get openedDevice(): HIDDevice | null {
    return this.device?.opened ? this.device : null;
  }

  onInputReport(listener: (event: { reportId: number; data: DataView }) => void): () => void {
    const device = this.device;
    if (!device) {
      return () => undefined;
    }
    const target = device as unknown as EventTarget;
    const handler = (event: Event) => listener(event as unknown as { reportId: number; data: DataView });
    target.addEventListener('inputreport', handler);
    return () => target.removeEventListener('inputreport', handler);
  }

  /* ── Legacy convenience methods (kept for backwards compat) ───────────── */
  async playConstantForce(magnitude = 80, durationMs = 1200): Promise<void> {
    const signedMagnitude = Math.max(-127, Math.min(127, magnitude));
    await this.sendReport(0x01, buildSetEffect(BLOCK.cf, TYPE.cf, durationMs, 255));
    const mag = Math.round((signedMagnitude / 127) * 0x7fff);
    await this.sendReport(0x05, buildConstantForce(BLOCK.cf, mag));
    await this.sendReport(0x0a, buildOp(BLOCK.cf, 1, 1));
    this.running.cf = true;
    if (durationMs > 0) {
      window.setTimeout(() => { this.running.cf = false; }, durationMs);
    }
  }

  async playSpring(strength = 80, durationMs = 1500): Promise<void> {
    const pct = Math.round((Math.max(0, Math.min(255, strength)) / 255) * 100);
    await this.sendReport(0x01, buildSetEffect(BLOCK.sp, TYPE.sp, durationMs, 255));
    await this.sendReport(0x03, buildCondition(BLOCK.sp, pctToCoef(pct)));
    await this.sendReport(0x0a, buildOp(BLOCK.sp, 1, 1));
    this.running.sp = true;
    if (durationMs > 0) {
      window.setTimeout(() => { this.running.sp = false; }, durationMs);
    }
  }

  async playPulse(magnitude = 80, durationMs = 250): Promise<void> {
    await this.playConstantForce(magnitude, durationMs);
  }

  /** Low-level HID output — used by Performance Test runner. */
  async sendRawReport(reportId: number, data: Uint8Array | number[]): Promise<void> {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    await this.sendReport(reportId, bytes);
  }

  private async sendReport(reportId: number, data: Uint8Array): Promise<void> {
    if (!this.device?.opened) {
      throw new Error('HID device is not connected');
    }
    await this.device.sendReport(reportId, data);
  }
}

export const hidFfbService = new HidFfbService();
