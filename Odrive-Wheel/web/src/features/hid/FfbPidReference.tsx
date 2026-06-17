import type { Locale } from '../../i18n/messages';

import { translate } from '../../i18n/messages';

import { HID_EFFECT_META, reportChainLabel, type HidEffectMeta } from './hidEffectMeta';

import { pctToCoef, pctToMagnitude, type EffectKey } from './HidFfbService';



const REFERENCE_ORDER: EffectKey[] = ['cf', 'sp', 'da', 'fr'];



const TITLE_KEYS: Record<EffectKey, string> = {

  cf: 'ffbEffectCfTitle',

  sp: 'ffbEffectSpTitle',

  da: 'ffbEffectDaTitle',

  fr: 'ffbEffectFrTitle',

};



const ROLE_KEYS: Record<EffectKey, string> = {

  cf: 'ffbPidRoleCf',

  sp: 'ffbPidRoleSp',

  da: 'ffbPidRoleDa',

  fr: 'ffbPidRoleFr',

};



function formatHidValue(key: EffectKey, sliderPct: number): string {

  if (key === 'cf') {

    const raw = pctToMagnitude(sliderPct);

    const hex = (raw & 0xffff).toString(16).toUpperCase().padStart(4, '0');

    const sign = sliderPct > 0 ? '+' : '';

    return `${sign}${sliderPct}% → 0x${hex}`;

  }

  const coef = pctToCoef(sliderPct);

  const hex = coef.toString(16).toUpperCase().padStart(4, '0');

  return `${sliderPct}% → ${coef} (0x${hex})`;

}



export function FfbPidReference({

  locale,

  running,

  values,

  hidConnected,

}: {

  locale: Locale;

  running: Record<EffectKey, boolean>;

  values: Record<EffectKey, number>;

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

          {REFERENCE_ORDER.map((key) => (

            <PidRow

              key={key}

              locale={locale}

              meta={HID_EFFECT_META[key]}

              titleKey={TITLE_KEYS[key]}

              roleKey={ROLE_KEYS[key]}

              active={running[key]}

              hidValue={formatHidValue(key, values[key])}

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

        {!active && hidConnected && (

          <span className="ffb-pid-value-hint">{translate(locale, 'ffbPidValuePending')}</span>

        )}

      </td>

      <td>

        <code className="ffb-pid-chain">{reportChainLabel(meta)}</code>

        {active && <span className="ffb-pid-chain-detail">{translate(locale, 'ffbPidChainActive')}</span>}

      </td>

    </tr>

  );

}


