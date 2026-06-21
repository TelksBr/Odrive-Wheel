import { executeOpenFFBoard } from '../board/BoardProtocol';

export interface As5047EncRaw {
  ok: number;
  parity: number;
  ef: number;
  xfr: number;
  last: string;
  pos: number;
}

export interface As5047Magnet {
  agc: number;
  magLow: number;
  magHigh: number;
  cof: number;
  lf: number;
  updates: number;
  status: string;
}

function parseKeyValues(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of raw.split(/\s+/)) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    out[part.slice(0, eq).toLowerCase()] = part.slice(eq + 1);
  }
  return out;
}

export async function fetchAs5047EncRaw(): Promise<As5047EncRaw | null> {
  const raw = await executeOpenFFBoard('sys.encraw');
  const kv = parseKeyValues(raw);
  if (!kv.ok) return null;
  return {
    ok: Number(kv.ok) || 0,
    parity: Number(kv.pty) || 0,
    ef: Number(kv.ef) || 0,
    xfr: Number(kv.xfr) || 0,
    last: kv.last ?? '—',
    pos: Number(kv.pos) || 0,
  };
}

export async function fetchAs5047Magnet(): Promise<As5047Magnet | null> {
  const raw = await executeOpenFFBoard('sys.magnet');
  const kv = parseKeyValues(raw);
  if (!kv.agc) return null;
  return {
    agc: Number(kv.agc) || 0,
    magLow: Number(kv.magl) || 0,
    magHigh: Number(kv.magh) || 0,
    cof: Number(kv.cof) || 0,
    lf: Number(kv.lf) || 0,
    updates: Number(kv.updates) || 0,
    status: kv.status ?? '—',
  };
}

/** AGC ~128 is ideal; <30 too close, >220 too far (AS5047 datasheet guidance). */
export function agcMagnetHint(agc: number): 'ideal' | 'close' | 'far' | 'unknown' {
  if (!Number.isFinite(agc) || agc <= 0) return 'unknown';
  if (agc >= 100 && agc <= 160) return 'ideal';
  if (agc < 30) return 'close';
  if (agc > 220) return 'far';
  return 'unknown';
}
