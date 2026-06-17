const OPENFFBOARD_VENDOR_ID = 0x1209;
const ODRIVE_WHEEL_PRODUCT_ID = 0x0d40;

export class HidFfbService {
  private device: HIDDevice | null = null;
  private stopTimer: number | undefined;

  get connected(): boolean {
    return Boolean(this.device?.opened);
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
    await device.open();
    this.device = device;
    return device.productName;
  }

  async disconnect(): Promise<void> {
    window.clearTimeout(this.stopTimer);
    this.stopTimer = undefined;
    if (this.device?.opened) {
      await this.stopAll();
      await this.device.close();
    }
    this.device = null;
  }

  async stopAll(): Promise<void> {
    window.clearTimeout(this.stopTimer);
    this.stopTimer = undefined;
    await this.sendOutputReport(0x0c, new Uint8Array([0x03]));
  }

  async playConstantForce(magnitude = 80, durationMs = 1200): Promise<void> {
    const signedMagnitude = Math.max(-127, Math.min(127, magnitude));
    window.clearTimeout(this.stopTimer);
    await this.sendOutputReport(0x05, new Uint8Array([1, signedMagnitude & 0xff]));
    await this.sendOutputReport(0x0a, new Uint8Array([1, 1, 0]));
    this.scheduleStop(durationMs);
  }

  async playSpring(strength = 80, durationMs = 1500): Promise<void> {
    const gain = Math.max(0, Math.min(255, strength));
    window.clearTimeout(this.stopTimer);
    await this.sendOutputReport(0x03, new Uint8Array([1, 0, 0, gain, 0, gain]));
    await this.sendOutputReport(0x0a, new Uint8Array([1, 1, 0]));
    this.scheduleStop(durationMs);
  }

  async playPulse(magnitude = 80, durationMs = 250): Promise<void> {
    await this.playConstantForce(magnitude, durationMs);
  }

  private scheduleStop(durationMs: number): void {
    if (durationMs <= 0) {
      return;
    }
    this.stopTimer = window.setTimeout(() => {
      void this.stopAll();
    }, durationMs);
  }

  private async sendOutputReport(reportId: number, data: Uint8Array): Promise<void> {
    if (!this.device?.opened) {
      throw new Error('HID device is not connected');
    }
    await this.device.sendReport(reportId, data);
  }
}

export const hidFfbService = new HidFfbService();
