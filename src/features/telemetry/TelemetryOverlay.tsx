import { useCallback, useState } from 'react';
import { useAppState } from '../../app/AppState';
import { translate } from '../../i18n/messages';
import { useObserveTelemetry } from '../observe/ObserveTelemetryContext';

interface TelemetryOverlayProps {
  backgroundActive?: boolean;
}

export function TelemetryOverlay({ backgroundActive = false }: TelemetryOverlayProps) {
  const { state } = useAppState();
  const locale = state.locale;
  const { pipOpen, windowMs, setWindowMs, requestOpenPip } = useObserveTelemetry();
  const [overlayError, setOverlayError] = useState<string | null>(null);

  const connectedState = state.connected;

  const openOverlay = useCallback(() => {
    setOverlayError(null);
    if (!window.documentPictureInPicture) {
      setOverlayError(translate(locale, 'overlayPipError'));
      return;
    }
    if (!connectedState) {
      setOverlayError(translate(locale, 'overlayConnectFirst'));
      return;
    }
    requestOpenPip();
  }, [connectedState, locale, requestOpenPip]);

  const pipAvailable = Boolean(window.documentPictureInPicture);

  return (
    <div className="toolbar" style={{ flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
      <button
        type="button"
        disabled={!connectedState || !pipAvailable}
        onClick={openOverlay}
      >
        {pipOpen ? translate(locale, 'overlayFocus') : translate(locale, 'overlayOpen')}
      </button>

      {pipOpen && (
        <>
          <span className="eyebrow" style={{ alignSelf: 'center' }}>{translate(locale, 'overlayWindowLabel')}</span>
          {[
            { key: 'observeWindow10s', ms: 10_000 },
            { key: 'observeWindow30s', ms: 30_000 },
            { key: 'observeWindow1m', ms: 60_000 },
            { key: 'observeWindow2m', ms: 120_000 },
          ].map((opt) => (
            <button
              key={opt.ms}
              type="button"
              className={`compact-button${windowMs === opt.ms ? ' active' : ''}`}
              onClick={() => setWindowMs(opt.ms)}
            >
              {translate(locale, opt.key)}
            </button>
          ))}
        </>
      )}

      <span className="muted" style={{ fontSize: 12 }}>
        {pipAvailable
          ? translate(locale, 'overlayPipAvailable')
          : translate(locale, 'overlayPipUnavailable')}
      </span>

      {backgroundActive && (
        <span className="muted" style={{ fontSize: 12, width: '100%' }} title={translate(locale, 'observeBackgroundHint')}>
          {translate(locale, 'observeBackgroundRecording')}
        </span>
      )}

      {overlayError && (
        <span style={{ fontSize: 12, color: 'var(--error)', width: '100%' }}>{overlayError}</span>
      )}
    </div>
  );
}
