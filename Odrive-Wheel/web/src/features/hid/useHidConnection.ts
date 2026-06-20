import { useCallback, useEffect, useRef, useState } from 'react';
import { translate, type Locale } from '../../i18n/messages';
import { hidFfbService } from './HidFfbService';

export function useHidConnection(locale: Locale, options?: { autoRestore?: boolean }) {
  const autoRestore = options?.autoRestore ?? false;
  const [deviceName, setDeviceName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const wasConnectedRef = useRef(hidFfbService.connected);

  useEffect(() => {
    if (autoRestore) {
      void hidFfbService.restoreGrantedDevice().catch(() => undefined);
    }
    return hidFfbService.onConnectionChange((connected, name, unplugged) => {
      const wasConnected = wasConnectedRef.current;
      wasConnectedRef.current = connected;
      setDeviceName(connected ? name : '');
      if (wasConnected && !connected && unplugged) {
        setError(translate(locale, 'ffbHidUnplugged'));
      }
    });
  }, [autoRestore, locale]);

  const connected = Boolean(deviceName);

  const connect = useCallback(async () => {
    setError(null);
    await hidFfbService.connect();
  }, []);

  const disconnect = useCallback(async () => {
    setError(null);
    await hidFfbService.disconnect();
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return {
    connected,
    deviceName,
    error,
    connect,
    disconnect,
    clearError,
    setError,
  };
}
