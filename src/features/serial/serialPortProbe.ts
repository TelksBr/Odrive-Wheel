import { isOdriveErrorReply } from './odriveErrors';
import { sleep } from '../../shared/sleep';

/** OpenFFBoard / Odrive-Wheel control CDC handshake. */
export const HANDSHAKE_COMMAND = 'sys.swver?';
export const HANDSHAKE_TIMEOUT_MS = 1500;

async function readAsciiLine(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  decoder: TextDecoder,
  timeoutMs: number,
): Promise<string> {
  let buffer = '';
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const remaining = deadline - Date.now();
    const chunk = await Promise.race([
      reader.read(),
      sleep(remaining).then(() => ({ value: undefined, done: false as const })),
    ]);
    if (chunk.done) {
      break;
    }
    if (chunk.value) {
      buffer += decoder.decode(chunk.value, { stream: true });
      const match = buffer.match(/[^\r\n]+/);
      if (match) {
        return match[0].trim();
      }
    }
  }
  return '';
}

/** Strip OpenFFBoard `[class.cmd?|value]` wrappers. */
export function unwrapControlReply(line: string): string {
  const token = line.trim();
  const match = token.match(/^\[[^|]*\|(.*)\]$/);
  return (match ? (match[1] ?? '') : token).trim();
}

/** True when the line looks like an OpenFFBoard control CDC reply. */
export function isControlPortReply(line: string): boolean {
  const token = line.trim();
  if (!token || isOdriveErrorReply(token)) {
    return false;
  }
  const value = unwrapControlReply(token);
  if (!value || isOdriveErrorReply(value)) {
    return false;
  }
  // Firmware version, hw type, or ODrive-style numeric ack — not binary HID garbage.
  return /^[\w.+\-/:() ]{2,}$/u.test(value);
}

/**
 * Open a port briefly and verify it answers OpenFFBoard commands.
 * Used to avoid auto-reconnecting to the wrong CDC (e.g. game/HID interface).
 */
export async function probeControlSerialPort(port: SerialPort): Promise<boolean> {
  try {
    await port.open({ baudRate: 115200, bufferSize: 4096 });
  } catch {
    return false;
  }

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let writer: WritableStreamDefaultWriter<Uint8Array> | null = null;

  try {
    const readable = port.readable;
    const writable = port.writable;
    if (readable === null || writable === null) {
      return false;
    }
    reader = readable.getReader();
    writer = writable.getWriter();
    await writer.write(encoder.encode(`${HANDSHAKE_COMMAND}\n`));
    const activeReader = reader;
    const line = await readAsciiLine(activeReader, decoder, HANDSHAKE_TIMEOUT_MS);
    return isControlPortReply(line);
  } catch {
    return false;
  } finally {
    try {
      await reader?.cancel();
    } catch {
      // ignore
    }
    try {
      reader?.releaseLock();
    } catch {
      // ignore
    }
    try {
      writer?.releaseLock();
    } catch {
      // ignore
    }
    try {
      await port.close();
    } catch {
      // ignore
    }
  }
}
