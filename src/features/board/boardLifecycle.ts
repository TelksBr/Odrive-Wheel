import { serialService } from '../serial/SerialService';
import { rebootBoard, rebootToDfu } from './BoardProtocol';
import { sleep } from '../../shared/sleep';

export async function rebootAndDisconnect(): Promise<void> {
  await rebootBoard();
  await sleep(150);
  await serialService.disconnect().catch(() => undefined);
}

export async function rebootToDfuAndDisconnect(): Promise<void> {
  await rebootToDfu();
  await sleep(150);
  await serialService.disconnect().catch(() => undefined);
}

export async function tryReconnectAfterReboot(maxAttempts = 12, delayMs = 1000): Promise<boolean> {
  await sleep(3000);
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      if (await serialService.reconnectKnownPort()) {
        return true;
      }
    } catch {
      // board still booting
    }
    await sleep(delayMs);
  }
  return false;
}
