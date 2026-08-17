import { useCallback, useEffect, useState } from 'react';
import type { Locale } from '../../i18n/messages';
import { translate } from '../../i18n/messages';
import { APP_STORAGE_PREFIX } from '../../app/brand';

const STORAGE_KEY = `${APP_STORAGE_PREFIX}-hub`;

interface HubSettings {
  host: string;
  port: string;
  serialPort: string;
}

const DEFAULT_SETTINGS: HubSettings = {
  host: '127.0.0.1',
  port: '8765',
  serialPort: 'COM6',
};

function readSettings(): HubSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return DEFAULT_SETTINGS;
    }
    const parsed = JSON.parse(raw) as Partial<HubSettings>;
    return {
      host: parsed.host?.trim() || DEFAULT_SETTINGS.host,
      port: parsed.port?.trim() || DEFAULT_SETTINGS.port,
      serialPort: parsed.serialPort?.trim() || DEFAULT_SETTINGS.serialPort,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

interface HubHealth {
  ok: boolean;
  source: string;
  chartHz: number;
  uptimeSec: number;
}

export function HubLanCard({ locale, serialConnected = false }: { locale: Locale; serialConnected?: boolean }) {
  const [settings, setSettings] = useState<HubSettings>(readSettings);
  const [health, setHealth] = useState<HubHealth | null>(null);
  const [checking, setChecking] = useState(false);
  const [copied, setCopied] = useState(false);

  const healthUrl = `http://${settings.host}:${settings.port}/health`;
  const overlayUrl = `http://${settings.host}:${settings.port}/overlay/`;
  const launchCmd = `powershell -ExecutionPolicy Bypass -File scripts/Start-TelemetryHub.ps1 -GameMode -SerialPort ${settings.serialPort}`;

  const refresh = useCallback(async () => {
    setChecking(true);
    try {
      const res = await fetch(healthUrl, { signal: AbortSignal.timeout(2000) });
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
  }, [healthUrl]);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const persist = (next: HubSettings) => {
    setSettings(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const copyCommand = async () => {
    try {
      await navigator.clipboard.writeText(launchCmd);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const showPortBusy = serialConnected && !health?.ok && !checking;

  return (
    <section className="observe-section" style={{ marginBottom: 12 }}>
      <h3 className="observe-section-title">{translate(locale, 'hubLanTitle')}</h3>
      <p className="muted" style={{ fontSize: 13, margin: '0 0 8px' }}>
        {translate(locale, 'hubLanDescription')}
      </p>
      {showPortBusy && (
        <p className="muted" style={{ fontSize: 13, margin: '0 0 8px' }}>
          {translate(locale, 'hubLanPortOccupied', { port: settings.serialPort })}
        </p>
      )}
      <div className="toolbar" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
        <label className="muted" style={{ fontSize: 12 }}>
          {translate(locale, 'hubLanHost')}
          <input
            className="compact-input"
            value={settings.host}
            onChange={(event) => persist({ ...settings, host: event.target.value })}
            style={{ marginLeft: 6, width: 120 }}
          />
        </label>
        <label className="muted" style={{ fontSize: 12 }}>
          {translate(locale, 'hubLanHttpPort')}
          <input
            className="compact-input"
            value={settings.port}
            onChange={(event) => persist({ ...settings, port: event.target.value })}
            style={{ marginLeft: 6, width: 72 }}
          />
        </label>
        <label className="muted" style={{ fontSize: 12 }}>
          {translate(locale, 'hubLanSerialPort')}
          <input
            className="compact-input"
            value={settings.serialPort}
            onChange={(event) => persist({ ...settings, serialPort: event.target.value })}
            style={{ marginLeft: 6, width: 88 }}
          />
        </label>
      </div>
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
        <a className="compact-button" href={overlayUrl} target="_blank" rel="noreferrer">
          {translate(locale, 'hubLanOpenOverlay')}
        </a>
      </div>
    </section>
  );
}
