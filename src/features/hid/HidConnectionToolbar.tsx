import { translate, type Locale } from '../../i18n/messages';
import { Pill } from '../../shared/ui';

interface HidConnectionToolbarProps {
  locale: Locale;
  hidSupported: boolean;
  connected: boolean;
  deviceName: string;
  error: string | null;
  onConnect: () => void;
  onDisconnect: () => void;
  showStopAll?: boolean;
  onStopAll?: () => void;
  stopAllDisabled?: boolean;
}

export function HidConnectionToolbar({
  locale,
  hidSupported,
  connected,
  deviceName,
  error,
  onConnect,
  onDisconnect,
  showStopAll = false,
  onStopAll,
  stopAllDisabled = false,
}: HidConnectionToolbarProps) {
  const statusTone = !hidSupported ? 'error' : connected ? 'ok' : 'neutral';
  const statusLabel = !hidSupported
    ? translate(locale, 'ffbHidUnsupported')
    : connected
      ? translate(locale, 'ffbHidStatusConnected', { device: deviceName })
      : translate(locale, 'ffbHidStatusDisconnected');

  return (
    <div className="toolbar" style={{ flexWrap: 'wrap', gap: 8 }}>
      {!connected ? (
        <button type="button" disabled={!hidSupported} onClick={() => void onConnect()}>
          {translate(locale, 'ffbConnectHidBtn')}
        </button>
      ) : (
        <button type="button" onClick={() => void onDisconnect()}>
          {translate(locale, 'ffbDisconnectHidBtn')}
        </button>
      )}
      {showStopAll && (
        <button type="button" className="danger" disabled={stopAllDisabled} onClick={() => void onStopAll?.()}>
          {translate(locale, 'ffbStopAll')}
        </button>
      )}
      <Pill tone={statusTone}>{statusLabel}</Pill>
      {error && <Pill tone="error">{error}</Pill>}
    </div>
  );
}
