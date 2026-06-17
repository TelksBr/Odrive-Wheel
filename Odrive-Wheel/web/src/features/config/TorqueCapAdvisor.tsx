/**
 * TorqueCapAdvisor — Torque budget calculator for the FFB Wheel workspace.
 *
 * Shows the full chain:
 *   current_lim × torque_constant  → physical max (what the motor can deliver)
 *   torque_lim                      → optional firmware cap
 *   axis.maxtorque                  → FFB max torque (what the game scales to 100%)
 *   axis.fxratio                    → final multiplier (scales down the output)
 *   axis.maxtorque × fxratio        → actual max torque at the wheel
 *
 * Warns when axis.maxtorque > effective ceiling (effects would saturate).
 */
import { useState } from 'react';
import { useAppState } from '../../app/AppState';
import { translate } from '../../i18n/messages';
import { serialService } from '../serial/SerialService';

/* ── Serial read helpers ────────────────────────────────────────────────── */
async function readOdrive(path: string): Promise<number> {
  const raw = await serialService.sendCommand(`r ${path}`, true, 2000, false);
  return parseFloat(raw.trim());
}

async function readOpenFFBoard(path: string): Promise<number> {
  const raw = await serialService.sendCommand(`${path}?`, true, 2000, false);
  const match = raw.match(/\|([^\]]+)\]$/);
  return parseFloat(match ? match[1].trim() : raw.trim());
}

/* ── Bar component ───────────────────────────────────────────────────────── */
function BudgetBar({
  value, ceiling, label, color, unitNm,
}: { value: number; ceiling: number; label: string; color: string; unitNm: string }) {
  const pct = Math.min(100, (value / ceiling) * 100);
  const overflow = value > ceiling;
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
        <span style={{ color: 'var(--muted)' }}>{label}</span>
        <code style={{ fontFamily: 'var(--mono)', color: overflow ? 'var(--error)' : color }}>
          {value.toFixed(2)} {unitNm}
        </code>
      </div>
      <div
        style={{
          height: 6, background: 'var(--surface-2)', borderRadius: 999,
          border: '1px solid var(--border)', overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            background: overflow ? 'var(--error)' : color,
            borderRadius: 999,
            transition: 'width 0.3s',
          }}
        />
      </div>
    </div>
  );
}

/* ── Main component ──────────────────────────────────────────────────────── */
export function TorqueCapAdvisor() {
  const { state, dispatch } = useAppState();
  const locale = state.locale;
  const unitNm = translate(locale, 'unitNm');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  /* Pull values from global field state (populated by page refresh or the
     "Ler valores" button below) */
  const fv = state.fieldValues;
  const currentLim   = parseFloat(fv['axis0.motor.config.current_lim']   ?? '');
  const torqueConst  = parseFloat(fv['axis0.motor.config.torque_constant'] ?? '');
  const torqueLim    = parseFloat(fv['axis0.motor.config.torque_lim']     ?? '');
  const maxTorque    = parseFloat(fv['axis.maxtorque']                   ?? '');
  const fxRatio      = parseFloat(fv['axis.fxratio']                     ?? '');

  const hasMotor  = isFinite(currentLim) && currentLim > 0 && isFinite(torqueConst) && torqueConst > 0;
  const hasFFB    = isFinite(maxTorque)  && maxTorque > 0;

  /* ── Calculations ─────────────────────────────────────────────────────── */
  const physicalMax   = hasMotor ? currentLim * torqueConst : NaN;
  const tLimActive    = isFinite(torqueLim) && torqueLim > 0 && isFinite(physicalMax) && torqueLim < physicalMax;
  const effectiveCeil = tLimActive ? torqueLim : physicalMax;
  const isSaturating  = hasFFB && isFinite(effectiveCeil) && maxTorque > effectiveCeil + 0.01;
  const isOk          = hasFFB && isFinite(effectiveCeil) && !isSaturating;
  const finalOutput   = hasFFB && isFinite(fxRatio) && fxRatio > 0 ? maxTorque * fxRatio : NaN;

  /* ── Read from board ─────────────────────────────────────────────────── */
  async function loadValues() {
    if (!state.connected) return;
    setLoading(true);
    setError(null);
    try {
      const [cl, kt, tl, mt, fx] = await Promise.all([
        readOdrive('axis0.motor.config.current_lim').catch(() => NaN),
        readOdrive('axis0.motor.config.torque_constant').catch(() => NaN),
        readOdrive('axis0.motor.config.torque_lim').catch(() => NaN),
        readOpenFFBoard('axis.maxtorque').catch(() => NaN),
        readOpenFFBoard('axis.fxratio').catch(() => NaN),
      ]);
      const values: Record<string, string> = {};
      if (isFinite(cl))  values['axis0.motor.config.current_lim']    = String(cl);
      if (isFinite(kt))  values['axis0.motor.config.torque_constant'] = String(kt);
      if (isFinite(tl))  values['axis0.motor.config.torque_lim']     = String(tl);
      if (isFinite(mt))  values['axis.maxtorque']                    = String(mt);
      if (isFinite(fx))  values['axis.fxratio']                      = String(fx);
      dispatch({ type: 'hydrate-fields', values, dirty: false });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  /* ── Status ───────────────────────────────────────────────────────────── */
  let statusColor = 'var(--muted)';
  let statusIcon  = '·';
  let statusText  = '';
  if (!hasMotor) {
    statusText = translate(locale, 'torqueAdvisorLoadMotorHint');
  } else if (!hasFFB) {
    statusText = translate(locale, 'torqueAdvisorLoadFfbHint');
  } else if (isSaturating) {
    statusColor = 'var(--error)';
    statusIcon  = '⚠';
    statusText  = translate(locale, 'torqueAdvisorSaturating', {
      max: maxTorque.toFixed(2),
      ceil: effectiveCeil.toFixed(2),
    });
  } else {
    statusColor = 'var(--ok)';
    statusIcon  = '✓';
    statusText  = translate(locale, 'torqueAdvisorWithinLimit');
  }

  return (
    <div
      style={{
        padding: '16px 18px',
        background: isSaturating
          ? 'color-mix(in srgb, var(--error) 5%, var(--surface-2))'
          : isOk
          ? 'color-mix(in srgb, var(--ok) 3%, var(--surface-2))'
          : 'var(--surface-2)',
        border: `1px solid ${isSaturating ? 'color-mix(in srgb, var(--error) 35%, transparent)' : isOk ? 'color-mix(in srgb, var(--ok) 25%, transparent)' : 'var(--border)'}`,
        borderRadius: 'var(--radius)',
        display: 'grid',
        gap: 14,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>{translate(locale, 'torqueAdvisorTitle')}</span>
            {(isOk || isSaturating) && (
              <span
                style={{
                  fontSize: 11, fontWeight: 700, color: statusColor,
                  padding: '1px 7px', borderRadius: 999,
                  border: `1px solid color-mix(in srgb, ${statusColor} 35%, transparent)`,
                  background: `color-mix(in srgb, ${statusColor} 8%, transparent)`,
                }}
              >
                {statusIcon} {isSaturating ? translate(locale, 'torqueAdvisorBadgeSaturation') : translate(locale, 'torqueAdvisorBadgeOk')}
              </span>
            )}
          </div>
          <p style={{ color: 'var(--muted)', fontSize: 11, margin: 0, lineHeight: 1.5 }}>
            {statusText}
          </p>
        </div>
        <button
          type="button"
          disabled={!state.connected || loading}
          onClick={() => void loadValues()}
          style={{ flexShrink: 0, fontSize: 12 }}
        >
          {loading ? '…' : translate(locale, 'torqueAdvisorLoadValues')}
        </button>
      </div>

      {error && (
        <p style={{ color: 'var(--error)', fontSize: 11, margin: 0 }}>{error}</p>
      )}

      {/* Formula breakdown */}
      {hasMotor && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: 8,
          }}
        >
          {/* Step 1 — Physical max */}
          <FormulaBlock
            label={translate(locale, 'torqueFormulaPhysicalMax')}
            formula={`${currentLim.toFixed(2)} A × ${torqueConst.toFixed(3)} ${unitNm}/A`}
            result={physicalMax}
            note={translate(locale, 'torqueFormulaPhysicalNote')}
            unitNm={unitNm}
          />

          {/* Step 2 — Firmware cap (shown only if active) */}
          {tLimActive && (
            <FormulaBlock
              label={translate(locale, 'torqueFormulaFirmwareCap')}
              formula={`torque_lim = ${torqueLim.toFixed(2)} ${unitNm}`}
              result={torqueLim}
              note={translate(locale, 'torqueFormulaFirmwareNote')}
              tone="warn"
              unitNm={unitNm}
            />
          )}

          {/* Step 3 — Effective ceiling */}
          <FormulaBlock
            label={translate(locale, 'torqueFormulaEffectiveCeil')}
            formula={tLimActive ? translate(locale, 'torqueFormulaLimitedByTorqueLim') : translate(locale, 'torqueFormulaEqualsPhysicalMax')}
            result={effectiveCeil}
            tone={isNaN(effectiveCeil) ? undefined : 'ok'}
            note={translate(locale, 'torqueFormulaCeilNote')}
            unitNm={unitNm}
          />

          {/* Step 4 — FFB configured */}
          {hasFFB && (
            <FormulaBlock
              label={translate(locale, 'torqueFormulaFfbConfigured')}
              formula="axis.maxtorque"
              result={maxTorque}
              tone={isSaturating ? 'error' : 'ok'}
              note={isSaturating
                ? translate(locale, 'torqueFormulaExceedsBy', { n: (maxTorque - effectiveCeil).toFixed(2) })
                : translate(locale, 'torqueFormulaWithinLimit')}
              unitNm={unitNm}
            />
          )}

          {/* Step 5 — Final delivered */}
          {isFinite(finalOutput) && (
            <FormulaBlock
              label={translate(locale, 'torqueFormulaDelivered')}
              formula={`${maxTorque.toFixed(2)} × ${fxRatio.toFixed(2)} (fxratio)`}
              result={finalOutput}
              note={fxRatio < 1
                ? translate(locale, 'torqueFormulaFxRatioReduce', { n: Math.round((1 - fxRatio) * 100) })
                : translate(locale, 'torqueFormulaFxRatioNoReduce')}
              unitNm={unitNm}
            />
          )}
        </div>
      )}

      {/* Budget bar — shown when we have enough data */}
      {hasMotor && hasFFB && isFinite(effectiveCeil) && (
        <div style={{ display: 'grid', gap: 8 }}>
          <span style={{ fontSize: 10, color: 'var(--muted-2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {translate(locale, 'torqueBudgetLabel', { n: effectiveCeil.toFixed(2) })}
          </span>
          <BudgetBar value={physicalMax} ceiling={effectiveCeil + (isSaturating ? maxTorque - effectiveCeil + 1 : 1)} label={translate(locale, 'torqueBudgetPhysical')} color="var(--muted)" unitNm={unitNm} />
          {tLimActive && (
            <BudgetBar value={torqueLim} ceiling={physicalMax} label="torque_lim" color="var(--warn)" unitNm={unitNm} />
          )}
          <BudgetBar value={maxTorque} ceiling={effectiveCeil + (isSaturating ? maxTorque - effectiveCeil + 1 : 1)} label="axis.maxtorque" color={isSaturating ? 'var(--error)' : 'var(--accent)'} unitNm={unitNm} />
          {isFinite(finalOutput) && (
            <BudgetBar value={finalOutput} ceiling={effectiveCeil + (isSaturating ? maxTorque - effectiveCeil + 1 : 1)} label={translate(locale, 'torqueBudgetRealOutput')} color="var(--ok)" unitNm={unitNm} />
          )}
        </div>
      )}

      {/* Source commands hint */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {[
          'r axis0.motor.config.current_lim',
          'r axis0.motor.config.torque_constant',
          'r axis0.motor.config.torque_lim',
          'axis.maxtorque?',
          'axis.fxratio?',
        ].map((cmd) => (
          <code
            key={cmd}
            style={{
              fontSize: 10, fontFamily: 'var(--mono)',
              color: 'var(--muted-2)',
              padding: '1px 5px',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 4,
            }}
          >
            {cmd}
          </code>
        ))}
      </div>
    </div>
  );
}

/* ── FormulaBlock sub-component ─────────────────────────────────────────── */
function FormulaBlock({
  label, formula, result, note, tone, unitNm,
}: {
  label: string;
  formula: string;
  result: number;
  note?: string;
  tone?: 'ok' | 'warn' | 'error';
  unitNm: string;
}) {
  const color = tone === 'ok' ? 'var(--ok)' : tone === 'warn' ? 'var(--warn)' : tone === 'error' ? 'var(--error)' : 'var(--text)';
  return (
    <div
      style={{
        padding: '10px 12px',
        background: 'var(--surface)',
        border: `1px solid ${tone ? `color-mix(in srgb, ${color} 25%, transparent)` : 'var(--border)'}`,
        borderRadius: 'var(--radius)',
        display: 'grid',
        gap: 4,
      }}
    >
      <span style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </span>
      <code style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)' }}>
        {formula}
      </code>
      <strong style={{ fontFamily: 'var(--mono)', fontSize: 20, color, lineHeight: 1 }}>
        {isNaN(result) ? '—' : `${result.toFixed(2)} ${unitNm}`}
      </strong>
      {note && (
        <span style={{ fontSize: 10, color: 'var(--muted-2)', lineHeight: 1.4 }}>{note}</span>
      )}
    </div>
  );
}
