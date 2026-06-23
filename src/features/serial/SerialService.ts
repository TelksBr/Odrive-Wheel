export type SerialEvent =
  | { type: 'connected' }
  | { type: 'disconnected' }
  | { type: 'rx'; line: string; command?: string }
  | { type: 'tx'; line: string }
  | { type: 'info'; message: string }
  | { type: 'error'; message: string };

type SerialListener = (event: SerialEvent) => void;

interface PendingCommand {
  command: string;
  expectReply: boolean;
  log: boolean;
  resolve: (line: string) => void;
  reject: (error: Error) => void;
  timeoutId: number;
}

import { isOdriveErrorReply } from '../board/BoardProtocol';
import { probeControlSerialPort } from './serialPortProbe';

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

export class SerialService {
  private port: SerialPort | null = null;
  private authorizedPort: SerialPort | null = null;
  private authorizedPortInfo: SerialPortInfo | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private listeners = new Set<SerialListener>();
  private pending: PendingCommand[] = [];
  private decoder = new TextDecoder();
  private encoder = new TextEncoder();
  private readBuffer = '';
  private closing = false;
  private queue: Promise<unknown> = Promise.resolve();

  get isConnected(): boolean {
    return Boolean(this.port && this.writer);
  }

  subscribe(listener: SerialListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async connect(existingPort?: SerialPort): Promise<void> {
    if (!navigator.serial) {
      throw new Error('Web Serial is not available');
    }

    if (this.isConnected) {
      await this.disconnect();
    }

    const picked = existingPort ?? (await this.resolvePortForConnect());
    this.logInfo(existingPort ? 'connect: using provided port handle' : `connect: picked granted port (${this.describePort(picked)})`);
    this.port = picked;

    await this.port.open({ baudRate: 115200, bufferSize: 4096 });

    if (!this.port.readable || !this.port.writable) {
      throw new Error('Serial port did not expose readable/writable streams');
    }

    this.closing = false;
    this.readBuffer = '';
    this.reader = this.port.readable.getReader();
    this.writer = this.port.writable.getWriter();

    this.authorizedPort = this.port;
    this.authorizedPortInfo = this.readPortInfo(this.port);
    this.emit({ type: 'connected' });
    void this.readLoop();
  }

  /**
   * Prefer a previously used control port (no picker). With multiple COM ports,
   * probe for sys.swver before falling back to requestPort().
   */
  private async resolvePortForConnect(): Promise<SerialPort> {
    if (!navigator.serial) {
      throw new Error('Web Serial is not available');
    }
    const serial = navigator.serial;
    const ports = await serial.getPorts();
    this.logInfo(`resolvePort: ${ports.length} granted port(s) — ${this.describeGrantedPorts(ports)}`);
    const granted = await this.pickControlPortFromGranted(ports);
    if (granted) {
      this.logInfo(`resolvePort: reusing granted port (${this.describePort(granted)})`);
      return granted;
    }

    this.logInfo('resolvePort: no granted control port — opening browser picker');
    try {
      return await serial.requestPort();
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotFoundError') {
        throw new Error('serialConnectCancelled');
      }
      throw error;
    }
  }

  /** Pick ODrive control CDC from ports the user already granted — never opens the picker. */
  private async pickControlPortFromGranted(ports: SerialPort[]): Promise<SerialPort | null> {
    if (ports.length === 0) {
      return null;
    }

    if (this.authorizedPort && ports.includes(this.authorizedPort)) {
      this.logInfo('pick: matched previous port handle');
      return this.authorizedPort;
    }

    if (this.authorizedPortInfo) {
      const byInfo = ports.find((port) => this.matchesAuthorizedInfo(port));
      if (byInfo) {
        this.logInfo(`pick: matched saved USB id ${this.formatPortInfo(this.authorizedPortInfo)}`);
        return byInfo;
      }
    }

    if (ports.length === 1) {
      this.logInfo(`pick: single granted port (${this.describePort(ports[0]!)})`);
      return ports[0]!;
    }

    for (const port of ports) {
      const label = this.describePort(port);
      if (await probeControlSerialPort(port)) {
        this.logInfo(`pick: probe OK on ${label}`);
        return port;
      }
      this.logInfo(`pick: probe failed on ${label}`);
    }

    return null;
  }

  private logInfo(message: string): void {
    if (import.meta.env.DEV) {
      console.info(`[serial] ${message}`);
    }
    this.emit({ type: 'info', message });
  }

  private describeGrantedPorts(ports: SerialPort[]): string {
    if (ports.length === 0) {
      return 'none';
    }
    return ports.map((port) => this.describePort(port)).join('; ');
  }

  private describePort(port: SerialPort): string {
    return this.formatPortInfo(this.readPortInfo(port)) ?? 'unknown USB id';
  }

  private formatPortInfo(info: SerialPortInfo | null): string | null {
    if (!info || (info.usbVendorId === undefined && info.usbProductId === undefined)) {
      return null;
    }
    const vendor = info.usbVendorId !== undefined ? `0x${info.usbVendorId.toString(16)}` : '?';
    const product = info.usbProductId !== undefined ? `0x${info.usbProductId.toString(16)}` : '?';
    return `${vendor}:${product}`;
  }

  private readPortInfo(port: SerialPort): SerialPortInfo | null {
    try {
      const info = port.getInfo();
      if (!info || (info.usbVendorId === undefined && info.usbProductId === undefined)) {
        return null;
      }
      return info;
    } catch {
      return null;
    }
  }

  private matchesAuthorizedInfo(port: SerialPort): boolean {
    if (!this.authorizedPortInfo) {
      return false;
    }
    const info = this.readPortInfo(port);
    if (!info) {
      return false;
    }
    return (
      info.usbVendorId === this.authorizedPortInfo.usbVendorId &&
      info.usbProductId === this.authorizedPortInfo.usbProductId
    );
  }

  /**
   * Reconnect after reboot — retry until a granted control port opens.
   * USB re-enumeration replaces SerialPort handles; never spin only on a stale ref.
   */
  async reconnectKnownPort(maxAttempts = 12, delayMs = 1000): Promise<boolean> {
    if (!navigator.serial) {
      return false;
    }
    if (this.isConnected) {
      return true;
    }

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const ports = await navigator.serial.getPorts();
      this.logInfo(`reconnect attempt ${attempt + 1}/${maxAttempts}: ${ports.length} granted — ${this.describeGrantedPorts(ports)}`);
      const candidate = await this.pickControlPortFromGranted(ports);
      if (candidate) {
        try {
          this.logInfo(`reconnect: trying ${this.describePort(candidate)}`);
          await this.connect(candidate);
          this.logInfo('reconnect: success');
          return true;
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          this.logInfo(`reconnect: open failed — ${msg}`);
        }
      } else {
        this.logInfo('reconnect: no control candidate in granted ports');
      }
      await sleep(delayMs);
    }

    this.logInfo(`reconnect: failed after ${maxAttempts} attempts`);
    return false;
  }

  async disconnect(): Promise<void> {
    this.closing = true;
    this.rejectPending(new Error('Serial disconnected'));

    if (this.reader) {
      await this.reader.cancel().catch(() => undefined);
      this.reader.releaseLock();
      this.reader = null;
    }

    if (this.writer) {
      this.writer.releaseLock();
      this.writer = null;
    }

    if (this.port) {
      await this.port.close().catch(() => undefined);
      this.port = null;
    }

    this.emit({ type: 'disconnected' });
  }

  async sendCommand(command: string, expectReply = true, timeoutMs = 2000, log = true): Promise<string> {
    return this.enqueue(() => this.sendCommandNow(command, expectReply, timeoutMs, log));
  }

  /** Runs as one queue item — use commandNow() inside to avoid interleaved polling. */
  runAtomic<T>(operation: () => Promise<T>): Promise<T> {
    return this.enqueue(operation);
  }

  commandNow(command: string, expectReply = true, timeoutMs = 2000, log = true): Promise<string> {
    return this.sendCommandNow(command, expectReply, timeoutMs, log);
  }

  /**
   * ODrive `w` commands are silent on success; rejections arrive within ~80 ms.
   * Returns the error line when rejected, undefined when no error (HTML writeProp).
   */
  writeOdrive(command: string, log = true): Promise<string | undefined> {
    return this.enqueue(() => this.writeOdriveNow(command, log));
  }

  async writeOdriveNow(command: string, log = true): Promise<string | undefined> {
    if (!this.writer) {
      throw new Error('Serial is not connected');
    }

    const cleanCommand = command.trim();
    if (!cleanCommand) {
      return undefined;
    }

    if (log) {
      this.emit({ type: 'tx', line: cleanCommand });
    }
    await this.writer.write(this.encoder.encode(`${cleanCommand}\n`));

    return new Promise<string | undefined>((resolve, reject) => {
      const entry: PendingCommand = {
        command: cleanCommand,
        expectReply: true,
        log: false,
        resolve: (line: string) => {
          window.clearTimeout(entry.timeoutId);
          this.pending = this.pending.filter((item) => item !== entry);
          if (log) {
            this.emit({ type: 'rx', line, command: cleanCommand });
          }
          if (isOdriveErrorReply(line)) {
            reject(new Error(line.trim()));
            return;
          }
          resolve(undefined);
        },
        reject,
        timeoutId: 0,
      };

      entry.timeoutId = window.setTimeout(() => {
        this.pending = this.pending.filter((item) => item !== entry);
        resolve(undefined);
      }, 80);

      this.pending.push(entry);
    });
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.queue.then(operation, operation);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async sendCommandNow(command: string, expectReply = true, timeoutMs = 2000, log = true): Promise<string> {
    if (!this.writer) {
      throw new Error('Serial is not connected');
    }

    const cleanCommand = command.trim();
    if (!cleanCommand) {
      return '';
    }

    if (log) {
      this.emit({ type: 'tx', line: cleanCommand });
    }
    await this.writer.write(this.encoder.encode(`${cleanCommand}\n`));

    if (!expectReply) {
      return '';
    }

    return new Promise<string>((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        this.flushPendingQueue(`Timeout waiting for reply to: ${cleanCommand}`);
        reject(new Error(`Timeout waiting for reply to: ${cleanCommand}`));
      }, timeoutMs);

      this.pending.push({
        command: cleanCommand,
        expectReply,
        log,
        resolve,
        reject,
        timeoutId,
      });
    });
  }

  private async readLoop(): Promise<void> {
    while (this.reader && !this.closing) {
      try {
        const { value, done } = await this.reader.read();
        if (done) {
          break;
        }
        if (value) {
          this.consumeChunk(this.decoder.decode(value, { stream: true }));
        }
      } catch (error) {
        if (!this.closing) {
          this.emit({ type: 'error', message: error instanceof Error ? error.message : String(error) });
        }
        break;
      }
    }

    if (!this.closing) {
      await this.disconnect();
    }
  }

  private consumeChunk(chunk: string): void {
    this.readBuffer += chunk;
    const lines = this.readBuffer.split(/\r?\n/);
    this.readBuffer = lines.pop() ?? '';

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        continue;
      }
      this.resolveNext(line);
    }
  }

  private resolveNext(line: string): void {
    const next = this.pending.shift();
    if (!next) {
      this.emit({ type: 'rx', line });
      return;
    }
    window.clearTimeout(next.timeoutId);
    if (next.log) {
      this.emit({ type: 'rx', line, command: next.command });
    }
    next.resolve(line);
  }

  private rejectPending(error: Error): void {
    this.flushPendingQueue(error.message);
  }

  /** Drop stale UART lines after timeout — prevents permanent TX/RX desync (odrive-wheel.html). */
  private flushPendingQueue(reason: string): void {
    for (const pending of this.pending) {
      window.clearTimeout(pending.timeoutId);
      pending.reject(new Error(reason));
    }
    this.pending = [];
    this.readBuffer = '';
  }

  private emit(event: SerialEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

export const serialService = new SerialService();
