interface SerialPort {
  readonly readable: ReadableStream<Uint8Array> | null;
  readonly writable: WritableStream<Uint8Array> | null;
  getInfo(): SerialPortInfo;
  open(options: SerialOptions): Promise<void>;
  close(): Promise<void>;
}

interface SerialPortInfo {
  usbVendorId?: number;
  usbProductId?: number;
}

interface SerialOptions {
  baudRate: number;
  bufferSize?: number;
  dataBits?: 7 | 8;
  flowControl?: 'none' | 'hardware';
  parity?: 'none' | 'even' | 'odd';
  stopBits?: 1 | 2;
}

interface SerialRequestOptions {
  filters?: Array<{
    usbVendorId?: number;
    usbProductId?: number;
  }>;
}

interface Serial {
  requestPort(options?: SerialRequestOptions): Promise<SerialPort>;
  getPorts(): Promise<SerialPort[]>;
}

interface HIDDevice {
  readonly opened: boolean;
  readonly productName: string;
  readonly vendorId?: number;
  readonly productId?: number;
  open(): Promise<void>;
  close(): Promise<void>;
  sendReport(reportId: number, data: Uint8Array): Promise<void>;
  sendFeatureReport(reportId: number, data: Uint8Array): Promise<void>;
}

interface HID {
  requestDevice(options: {
    filters: Array<{
      vendorId?: number;
      productId?: number;
      usagePage?: number;
      usage?: number;
    }>;
  }): Promise<HIDDevice[]>;
  getDevices(): Promise<HIDDevice[]>;
}

interface USBDevice {
  readonly opened: boolean;
  readonly productName?: string;
  open(): Promise<void>;
  close(): Promise<void>;
  selectConfiguration(configurationValue: number): Promise<void>;
  claimInterface(interfaceNumber: number): Promise<void>;
  releaseInterface(interfaceNumber: number): Promise<void>;
  controlTransferOut(setup: USBControlTransferParameters, data?: Uint8Array): Promise<USBOutTransferResult>;
  controlTransferIn(setup: USBControlTransferParameters, length: number): Promise<USBInTransferResult>;
}

interface USBInTransferResult {
  readonly data?: DataView;
  readonly status: 'ok' | 'stall' | 'babble';
}

interface USBOutTransferResult {
  readonly bytesWritten: number;
  readonly status: 'ok' | 'stall';
}

interface USB {
  requestDevice(options: {
    filters: Array<{
      vendorId?: number;
      productId?: number;
    }>;
  }): Promise<USBDevice>;
}

interface Navigator {
  readonly serial?: Serial;
  readonly hid?: HID;
  readonly usb?: USB;
}

interface Window {
  readonly documentPictureInPicture?: {
    requestWindow(options?: { width?: number; height?: number }): Promise<Window>;
  };
  onbeforeinstallprompt: ((event: BeforeInstallPromptEvent) => void) | null;
}

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

declare module 'virtual:pwa-register/react' {
  type Setter<T> = (value: T | ((current: T) => T)) => void;

  export function useRegisterSW(options?: {
    immediate?: boolean;
    onRegisteredSW?: (swScriptUrl: string, registration: ServiceWorkerRegistration | undefined) => void;
    onRegisterError?: (error: unknown) => void;
  }): {
    offlineReady: [boolean, Setter<boolean>];
    needRefresh: [boolean, Setter<boolean>];
    updateServiceWorker: (reloadPage?: boolean) => Promise<void>;
  };
}
