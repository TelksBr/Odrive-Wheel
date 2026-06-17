/** Parse torque from diag `T` (lt= + nm=) or axis.curtorque? fallback. */
export function parseTorqueReply(raw: string | undefined, maxTorqueNm?: number): number | null {
  if (!raw) {
    return null;
  }

  const nmMatch = raw.match(/nm=(-?\d+(?:\.\d+)?)/i);
  if (nmMatch) {
    const nm = Number(nmMatch[1]);
    if (!Number.isFinite(nm)) {
      return null;
    }
    if (maxTorqueNm && maxTorqueNm > 0) {
      if (Math.abs(nm) <= maxTorqueNm * 1.05) {
        return nm;
      }
      if (Math.abs(nm) <= 32767) {
        return (nm / 32767) * maxTorqueNm;
      }
    }
    return nm;
  }

  const ltMatch = raw.match(/lt=(-?\d+(?:\.\d+)?)/i);
  if (ltMatch && maxTorqueNm !== undefined && maxTorqueNm > 0) {
    const lt = Number(ltMatch[1]);
    return Number.isFinite(lt) ? (lt / 32767) * maxTorqueNm : null;
  }

  const bracket = raw.match(/\|(-?\d+(?:\.\d+)?)\]/);
  const plain = raw.match(/(-?\d+(?:\.\d+)?)/);
  const value = Number(bracket?.[1] ?? plain?.[1]);
  if (!Number.isFinite(value)) {
    return null;
  }

  if (maxTorqueNm && maxTorqueNm > 0) {
    if (Math.abs(value) <= maxTorqueNm * 1.05) {
      return value;
    }
    if (Math.abs(value) <= 32767) {
      return (value / 32767) * maxTorqueNm;
    }
  }

  return Math.abs(value) <= 32767 ? null : value;
}
