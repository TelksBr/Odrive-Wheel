import { axisStateLabel } from '../../i18n/fieldMeta';
import { translate, type Locale } from '../../i18n/messages';
import type { LiveFieldFormat } from './liveMonitorCatalog';

export function parseLiveRaw(raw: string | undefined): string {
  if (!raw) return '';
  const bracketed = raw.match(/\|([^\]]+)\]$/);
  if (bracketed) return bracketed[1].trim();
  return raw.trim();
}

function parseNumber(raw: string | undefined): number | null {
  const token = parseLiveRaw(raw).split(/\s+/)[0];
  const value = Number(token);
  return Number.isFinite(value) ? value : null;
}

export function formatLiveValue(locale: Locale, raw: string | undefined, format: LiveFieldFormat, cmd?: string): string {
  const v = parseLiveRaw(raw);
  if (!v || v === '?') return translate(locale, 'liveEmptyValue');

  switch (format) {
    case 'bool': {
      const token = v.toLowerCase();
      if (token === 'true' || token === '1') return translate(locale, 'liveValueTrue');
      if (token === 'false' || token === '0') return translate(locale, 'liveValueFalse');
      return v;
    }
    case 'axisState': {
      const label = axisStateLabel(locale, v);
      return label !== v ? `${v} (${label})` : v;
    }
    case 'voltage': {
      const n = parseNumber(raw);
      return n !== null ? `${n.toFixed(3)} V` : v;
    }
    case 'voltageMv': {
      const n = parseNumber(raw);
      return n !== null ? `${(n / 1000).toFixed(3)} V` : v;
    }
    case 'current': {
      const n = parseNumber(raw);
      return n !== null ? `${n.toFixed(3)} A` : v;
    }
    case 'tempC': {
      const n = parseNumber(raw);
      return n !== null ? `${n.toFixed(1)} °C` : v;
    }
    case 'turns': {
      const n = parseNumber(raw);
      return n !== null ? `${n.toFixed(4)} turn` : v;
    }
    case 'turnsPerSec': {
      const n = parseNumber(raw);
      return n !== null ? `${n.toFixed(3)} turn/s` : v;
    }
    case 'radians': {
      const n = parseNumber(raw);
      return n !== null ? `${n.toFixed(4)} rad` : v;
    }
    case 'torque': {
      const n = parseNumber(raw);
      return n !== null ? `${n.toFixed(3)} Nm` : v;
    }
    case 'velocity': {
      const n = parseNumber(raw);
      return n !== null ? `${n.toFixed(3)} turn/s` : v;
    }
    case 'position': {
      const n = parseNumber(raw);
      return n !== null ? `${n.toFixed(4)} turn` : v;
    }
    case 'degrees': {
      const n = parseNumber(raw);
      return n !== null ? `${n.toFixed(2)}°` : v;
    }
    case 'degPerSec': {
      const n = parseNumber(raw);
      return n !== null ? `${n.toFixed(2)}°/s` : v;
    }
    default:
      if (cmd === 'r axis0.current_state' || cmd === 'r axis0.requested_state') {
        const label = axisStateLabel(locale, v);
        return label !== v ? `${v} (${label})` : v;
      }
      return v;
  }
}

export function liveValueTone(raw: string | undefined, format: LiveFieldFormat): 'ok' | 'warn' | 'error' | undefined {
  const v = parseLiveRaw(raw).toLowerCase();
  if (format === 'bool') {
    if (v === 'true' || v === '1') return 'ok';
    if (v === 'false' || v === '0') return 'warn';
    return undefined;
  }
  if (format === 'axisState') {
    if (v === '8') return 'ok';
    if (v === '1') return undefined;
    return undefined;
  }
  return undefined;
}

export function deviceInfoTone(id: string, value: string): 'ok' | 'warn' | undefined {
  if (id === 'ucl') {
    const token = value.toLowerCase();
    return token === 'true' || token === '1' ? 'ok' : 'warn';
  }
  return undefined;
}
