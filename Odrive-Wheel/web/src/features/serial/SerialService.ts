export type SerialEvent =
  | { type: 'connected' }
  | { type: 'disconnected' }
  | { type: 'rx'; line: string }
  | { type: 'tx'; line: string }
  | { type: 'error'; message: string };

type SerialListener = (event: SerialEvent) => void;

interface PendingCommand {
  command: string;
  expectReply: boolean;
  resolve: (line: string) => void;
  reject: (error: Error) => void;
  timeoutId: number;
}

export class SerialService {
  private port: SerialPort | null = null;
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

    this.port = existingPort ?? (await navigator.serial.requestPort());
    await this.port.open({ baudRate: 115200, bufferSize: 4096 });

    if (!this.port.readable || !this.port.writable) {
      throw new Error('Serial port did not expose readable/writable streams');
    }

    this.closing = false;
    this.reader = this.port.readable.getReader();
    this.writer = this.port.writable.getWriter();
    this.emit({ type: 'connected' });
    void this.readLoop();
  }

  async reconnectKnownPort(): Promise<boolean> {
    if (!navigator.serial) {
      return false;
    }
    const ports = await navigator.serial.getPorts();
    const port = ports[0];
    if (!port) {
      return false;
    }
    await this.connect(port);
    return true;
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

  async sendCommand(command: string, expectReply = true, timeoutMs = 2000): Promise<string> {
    return this.enqueue(() => this.sendCommandNow(command, expectReply, timeoutMs));
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.queue.then(operation, operation);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async sendCommandNow(command: string, expectReply = true, timeoutMs = 2000): Promise<string> {
    if (!this.writer) {
      throw new Error('Serial is not connected');
    }

    const cleanCommand = command.trim();
    if (!cleanCommand) {
      return '';
    }

    this.emit({ type: 'tx', line: cleanCommand });
    await this.writer.write(this.encoder.encode(`${cleanCommand}\n`));

    if (!expectReply) {
      return '';
    }

    return new Promise<string>((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        this.pending = this.pending.filter((item) => item.timeoutId !== timeoutId);
        reject(new Error(`Timeout waiting for reply to: ${cleanCommand}`));
      }, timeoutMs);

      this.pending.push({
        command: cleanCommand,
        expectReply,
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
      this.emit({ type: 'rx', line });
      this.resolveNext(line);
    }
  }

  private resolveNext(line: string): void {
    const next = this.pending.shift();
    if (!next) {
      return;
    }
    window.clearTimeout(next.timeoutId);
    next.resolve(line);
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending) {
      window.clearTimeout(pending.timeoutId);
      pending.reject(error);
    }
    this.pending = [];
  }

  private emit(event: SerialEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

export const serialService = new SerialService();
