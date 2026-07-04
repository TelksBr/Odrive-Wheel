import { useMemo, useState } from 'react';
import { useAppState } from '../../app/AppState';
import { usePageVisible } from '../../shared/usePageVisible';
import { translate } from '../../i18n/messages';
import { Card, SectionHeader } from '../../shared/ui';
import { LiveMonitorPanel } from '../live/LiveMonitorPanel';
import { useObservePolling } from '../observe/useObservePolling';
import { TimeSeriesChart } from '../telemetry/TimeSeriesChart';
import { TelemetryControlPanel } from '../telemetry/TelemetryControlPanel';
import { TelemetryOverlay } from '../telemetry/TelemetryOverlay';
import { type ChartHz, type SerialChartHz } from '../telemetry/controlOptions';
import { busSeries, localizedSeries, motionSeries } from '../telemetry/series';
import { ObserveQuickBar } from './ObserveQuickBar';
import { ObserveStatsTable } from './ObserveStatsTable';

export function ObserveWorkspace() {
  const { state } = useAppState();
  const locale = state.locale;
  const pageVisible = usePageVisible();
  const [enabled, setEnabled] = useState(true);
  const [chartHz, setChartHz] = useState<ChartHz>(30);
  const [serialChartHz, setSerialChartHz] = useState<SerialChartHz>(10);
  const [windowMs, setWindowMs] = useState(60_000);
  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  const [pipOpen, setPipOpen] = useState(false);

  const maxTorqueNm = Number(state.fieldValues['axis.maxtorque'] ?? '');
  const rangeDeg = Number(state.fieldValues['axis.range'] ?? '');
  const halfRangeDeg = Number.isFinite(rangeDeg) && rangeDeg > 0 ? rangeDeg / 2 : undefined;
  const observe = useObservePolling({
    connected: state.connected,
    enabled,
    chartHz,
    serialChartHz,
    windowMs,
    maxTorqueNm: Number.isFinite(maxTorqueNm) && maxTorqueNm > 0 ? maxTorqueNm : undefined,
    halfRangeDeg,
    holdPolling: state.busy,
    timerWindow: pipWindow,
  });

  const localizedBusSeries = useMemo(() => localizedSeries(locale, busSeries), [locale]);
  const localizedMotionSeries = useMemo(() => localizedSeries(locale, motionSeries), [locale]);

  return (
    <div className="page-stack observe-page">
      <SectionHeader
        eyebrow={translate(locale, 'observeEyebrow')}
        title={translate(locale, 'observeTitle')}
        description={translate(locale, 'observeDescription')}
      />

      <Card
        title={translate(locale, 'observePanelTitle')}
        description={translate(locale, 'observePanelDescription')}
      >
        <div className="observe-panel-body">
          <ObserveQuickBar />

          <section className="observe-section">
            <h3 className="observe-section-title">{translate(locale, 'observeSectionTelemetry')}</h3>
            <TelemetryControlPanel
              locale={locale}
              connected={state.connected}
              enabled={enabled}
              onEnabledChange={setEnabled}
              chartHz={chartHz}
              onChartHzChange={setChartHz}
              serialChartHz={serialChartHz}
              onSerialChartHzChange={setSerialChartHz}
              windowMs={windowMs}
              onWindowChange={setWindowMs}
              telemetry={observe}
            />
            <TelemetryOverlay
              connected={state.connected}
              samples={observe.displaySamples}
              brakePower={observe.brakePower}
              windowMs={windowMs}
              chartHz={chartHz}
              backgroundActive={enabled && state.connected && !pageVisible}
              onPipOpenChange={setPipOpen}
              onPipWindowChange={setPipWindow}
            />
            {pipOpen ? (
              <p className="observe-pip-active-hint muted">
                {translate(locale, 'overlayChartsInPip')}
              </p>
            ) : (
            <div className="chart-grid observe-chart-grid">
              <TimeSeriesChart
                title={translate(locale, 'observeChartDcBus')}
                samples={observe.displaySamples}
                series={localizedBusSeries}
                windowMs={windowMs}
                height={240}
                drawHz={chartHz}
              />
              <TimeSeriesChart
                title={translate(locale, 'observeChartWheel')}
                samples={observe.displaySamples}
                series={localizedMotionSeries}
                windowMs={windowMs}
                height={240}
                drawHz={chartHz}
              />
            </div>
            )}
            <ObserveStatsTable stats={observe.stats} locale={locale} />
          </section>

          <LiveMonitorPanel
            session={observe.session}
            polling={enabled && state.connected}
            onPollDiag={() => void observe.pollDiag()}
          />
        </div>
      </Card>
    </div>
  );
}
