import { useMemo } from 'react';
import { useAppState } from '../../app/AppState';
import { translate, type Locale } from '../../i18n/messages';
import { Card } from '../../shared/ui';
import {
  type CalibrationTargetEntry,
  type CalibrationTargetGroup,
  compareTarget,
  detectEncoderProfile,
  formatCurrentValue,
  formatTargetValue,
  savedCalibrationTargetList,
} from './calibrationTargets';

const groupOrder: CalibrationTargetGroup[] = ['status', 'encoder', 'motor', 'boot'];

const groupTitleKey: Record<CalibrationTargetGroup, string> = {
  status: 'calTargetGroupStatus',
  encoder: 'calTargetGroupEncoder',
  motor: 'calTargetGroupMotor',
  boot: 'calTargetGroupBoot',
};

function TargetRow({
  entry,
  current,
  locale,
}: {
  entry: CalibrationTargetEntry;
  current: string | undefined;
  locale: Locale;
}) {
  const result = compareTarget(current, entry.match);
  return (
    <tr className={`cal-target-row cal-target-${result}`}>
      <td className="cal-target-label">{translate(locale, entry.labelKey)}</td>
      <td className="cal-target-path">
        <code>{entry.path}</code>
      </td>
      <td className="cal-target-expected">{formatTargetValue(entry.match, locale)}</td>
      <td className="cal-target-current">{formatCurrentValue(entry.path, current, entry.match)}</td>
      <td className="cal-target-status">
        {result === 'ok' ? '✓' : result === 'missing' ? '—' : '≠'}
      </td>
    </tr>
  );
}

export function CalibrationTargetsPanel() {
  const { state } = useAppState();
  const locale = state.locale;
  const profile = detectEncoderProfile(state.fieldValues['axis0.encoder.config.mode']);
  const targets = savedCalibrationTargetList(profile);

  const { ok, total, grouped } = useMemo(() => {
    const byGroup = new Map<CalibrationTargetGroup, CalibrationTargetEntry[]>();
    let matchOk = 0;
    for (const entry of targets) {
      const current = state.fieldValues[entry.path];
      if (compareTarget(current, entry.match) === 'ok') {
        matchOk += 1;
      }
      const list = byGroup.get(entry.group) ?? [];
      list.push(entry);
      byGroup.set(entry.group, list);
    }
    return { ok: matchOk, total: targets.length, grouped: byGroup };
  }, [state.fieldValues, targets]);

  const profileLabel =
    profile === 'as5047'
      ? translate(locale, 'calTargetProfileAs5047')
      : profile === 'incremental'
        ? translate(locale, 'calTargetProfileIncremental')
        : translate(locale, 'calTargetProfileUnknown');

  const allOk = ok === total && total > 0;

  return (
    <Card title={translate(locale, 'calTargetsTitle')} description={translate(locale, 'calTargetsDescription')}>
      <div className="cal-targets-summary">
        <div className={`cal-targets-score ${allOk ? 'ok' : 'warn'}`}>
          <span className="cal-targets-score-val">
            {ok}/{total}
          </span>
          <span className="cal-targets-score-lbl">{translate(locale, 'calTargetsScore')}</span>
        </div>
        <div className="cal-targets-meta">
          <span>
            {translate(locale, 'calTargetsProfile')}: <strong>{profileLabel}</strong>
          </span>
          <span className="cal-targets-hint">{translate(locale, 'calTargetsHint')}</span>
        </div>
      </div>

      {profile === 'unknown' ? (
        <p className="cal-targets-warn">{translate(locale, 'calTargetProfileUnknownHint')}</p>
      ) : null}

      <div className="cal-targets-table-wrap">
        <table className="cal-targets-table">
          <thead>
            <tr>
              <th>{translate(locale, 'calTargetsColField')}</th>
              <th>{translate(locale, 'calTargetsColPath')}</th>
              <th>{translate(locale, 'calTargetsColTarget')}</th>
              <th>{translate(locale, 'calTargetsColCurrent')}</th>
              <th aria-label={translate(locale, 'calTargetsColMatch')} />
            </tr>
          </thead>
          <tbody>
            {groupOrder.flatMap((group) => {
              const entries = grouped.get(group);
              if (!entries?.length) {
                return [];
              }
              return [
                <tr key={`group-${group}`} className="cal-target-group-row">
                  <td colSpan={5}>{translate(locale, groupTitleKey[group])}</td>
                </tr>,
                ...entries.map((entry) => (
                  <TargetRow
                    key={entry.path}
                    entry={entry}
                    current={state.fieldValues[entry.path]}
                    locale={locale}
                  />
                )),
              ];
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
