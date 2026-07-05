import { useCallback, useEffect, useState } from 'react';
import type { Locale } from '../../i18n/messages';
import { translate } from '../../i18n/messages';

const HUB_HEALTH_URL = 'http://127.0.0.1:8765/health';
const HUB_OVERLAY_URL = 'http://127.0.0.1:8765/overlay/';
const HUB_LAUNCH_CMD = 'powershell -ExecutionPolicy Bypass -File scripts/Start-TelemetryHub.ps1 -GameMode -SerialPort COM6';

interface HubHealth {
  ok: boolean;
  source: string;
  chartHz: number;
  uptimeSec: number;
}

export function HubLanCard({ locale }: { locale: Locale }) {
  const [health, setHealth] = useState<HubHealth | null>(null);
  const [checking, setChecking] = useState(false);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    setChecking(true);
    try {
      const res = await fetch(HUB_HEALTH_URL, { signal: AbortSignal.timeout(2000) });
      if (!res.ok) {
        setHealth(null);
        return;
      }
      setHealth(await res.json());
    } catch {
      setHealth(null);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const copyCommand = async () => {
    try {
      await navigator.clipboard.writeText(HUB_LAUNCH_CMD);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <section className="observe-section" style={{ marginBottom: 12 }}>
      <h3 className="observe-section-title">{translate(locale, 'hubLanTitle')}</h3>
      <p className="muted" style={{ fontSize: 13, margin: '0 0 8px' }}>
        {translate(locale, 'hubLanDescription')}
      </p>
      <div className="toolbar" style={{ flexWrap: 'wrap', gap: 8 }}>
        <span className={health?.ok ? 'ok' : 'muted'} style={{ fontSize: 13 }}>
          {checking
            ? translate(locale, 'hubLanChecking')
            : health?.ok
            ? translate(locale, 'hubLanOnline', { source: health.source, hz: String(health.chartHz) })
            : translate(locale, 'hubLanOffline')}
        </span>
        <button type="button" className="compact-button" onClick={() => void refresh()}>
          {translate(locale, 'hubLanRefresh')}
        </button>
        <button type="button" className="compact-button" onClick={() => void copyCommand()}>
          {copied ? translate(locale, 'hubLanCopied') : translate(locale, 'hubLanCopyCommand')}
        </button>
        <a className="compact-button" href={HUB_OVERLAY_URL} target="_blank" rel="noreferrer">
          {translate(locale, 'hubLanOpenOverlay')}
        </a>
      </div>
    </section>
  );
}
