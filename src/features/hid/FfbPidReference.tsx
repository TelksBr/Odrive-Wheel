import type { Locale } from '../../i18n/messages';
import { translate } from '../../i18n/messages';
import { HID_EFFECT_META, reportChainLabel, type HidEffectMeta } from './hidEffectMeta';
import { EFFECT_KEYS, hzToPeriodMs, pctToCoef, pctToMagnitude, type EffectKey } from './HidFfbService';

const TITLE_KEYS: Record<EffectKey, string> = {
  cf: 'ffbEffectCfTitle',
  sp: 'ffbEffectSpTitle',
  da: 'ffbEffectDaTitle',
  fr: 'ffbEffectFrTitle',
  si: 'ffbEffectSiTitle',
  ra: 'ffbEffectRaTitle',
};

const ROLE_KEYS: Record<EffectKey, string> = {
  cf: 'ffbPidRoleCf',
  sp: 'ffbPidRoleSp',
  da: 'ffbPidRoleDa',
  fr: 'ffbPidRoleFr',
  si: 'ffbPidRoleSi',
  ra: 'ffbPidRoleRa',
};

function formatHidValue(key: EffectKey, sliderPct: number, secondary?: number): string {
  if (key === 'cf' || key === 'ra') {
    const raw = pctToMagnitude(sliderPct);
    const hex = (raw & 0xffff).toString(16).toUpperCase().padStart(4, '0');
    const sign = sliderPct > 0 ? '+' : '';
    return `${sign}${sliderPct}% → 0x${hex}`;
  }
  if (key === 'si') {
    const mag = pctToCoef(sliderPct);
    const hz = secondary ?? 15;
    const period = hzToPeriodMs(hz);
    return `${sliderPct}% / ${hz} Hz → mag ${mag}, period ${period} ms`;
  }
  const coef = pctToCoef(sliderPct);
  const hex = coef.toString(16).toUpperCase().padStart(4, '0');
  return `${sliderPct}% → ${coef} (0x${hex})`;
}

export function FfbPidReference({
  locale,
  running,
  values,
  secondaryValues,
  hidConnected,
}: {
  locale: Locale;
  running: Record<EffectKey, boolean>;
  values: Record<EffectKey, number>;
  secondaryValues?: Partial<Record<EffectKey, number>>;
  hidConnected: boolean;
}) {
  return (
    <details className="ffb-pid-reference">
      <summary>{translate(locale, 'ffbPidSummary')}</summary>
      <table className="ffb-pid-table">
        <thead>
          <tr>
            <th>{translate(locale, 'ffbPidColEffect')}</th>
            <th>{translate(locale, 'ffbPidColState')}</th>
            <th>{translate(locale, 'ffbPidColSlot')}</th>
            <th>{translate(locale, 'ffbPidColHidValue')}</th>
            <th>{translate(locale, 'ffbPidColReports')}</th>
          </tr>
        </thead>
        <tbody>
          {EFFECT_KEYS.map((key) => (
            <PidRow
              key={key}
              locale={locale}
              meta={HID_EFFECT_META[key]}
              titleKey={TITLE_KEYS[key]}
              roleKey={ROLE_KEYS[key]}
              active={running[key]}
              hidValue={formatHidValue(key, values[key], secondaryValues?.[key])}
              hidConnected={hidConnected}
            />
          ))}
        </tbody>
      </table>
      <p className="ffb-pid-footnote">{translate(locale, 'ffbPidFootnote')}</p>
    </details>
  );
}

function PidRow({
  locale,
  meta,
  titleKey,
  roleKey,
  active,
  hidValue,
  hidConnected,
}: {
  locale: Locale;
  meta: HidEffectMeta;
  titleKey: string;
  roleKey: string;
  active: boolean;
  hidValue: string;
  hidConnected: boolean;
}) {
  const stateLabel = !hidConnected
    ? translate(locale, 'ffbPidStateDisconnected')
    : active
      ? translate(locale, 'ffbPidStateOn')
      : translate(locale, 'ffbPidStateOff');

  return (
    <tr className={active ? 'active' : undefined}>
      <td>
        <strong>{translate(locale, titleKey)}</strong>
        <span>{translate(locale, roleKey)}</span>
      </td>
      <td>
        <span className={`ffb-pid-state${active ? ' on' : ''}${!hidConnected ? ' muted' : ''}`}>{stateLabel}</span>
      </td>
      <td>
        <code>{translate(locale, 'ffbPidBlockType', { block: meta.block, type: meta.pidType })}</code>
      </td>
      <td>
        <code className="ffb-pid-value">{hidValue}</code>
        {!active && hidConnected ? (
          <span className="ffb-pid-value-hint">{translate(locale, 'ffbPidValuePending')}</span>
        ) : null}
      </td>
      <td>
        <code className="ffb-pid-chain">{reportChainLabel(meta)}</code>
        {active ? <span className="ffb-pid-chain-detail">{translate(locale, 'ffbPidChainActive')}</span> : null}
      </td>
    </tr>
  );
}
