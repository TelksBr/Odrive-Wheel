import { lazy, Suspense } from 'react';
import { useAppState } from '../../app/AppState';
import { translate } from '../../i18n/messages';
import { SectionHeader } from '../../shared/ui';
import { QuickActions } from '../board/QuickActions';
import { zeroWheel } from '../calibration/calibrationPresets';
import { useDashboardLivePoll } from './useDashboardLivePoll';
import { DashboardLiveMetrics } from './DashboardLiveMetrics';
import { DashboardAnalogAxes } from './DashboardAnalogAxes';

// Lazy-load the heavy Three.js bundle into a separate chunk
const WheelViewer = lazy(() =>
  import('./WheelViewer').then((m) => {
    m.preloadWheelModel();
    return { default: m.WheelViewer };
  }),
);

export function DashboardPage() {
  const { state, dispatch } = useAppState();
  const live = useDashboardLivePoll(state.connected, state.fieldValues, state.busy);

  async function centerWheel() {
    dispatch({ type: 'set-busy', busy: true });
    try {
      const ok = await zeroWheel(dispatch);
      dispatch({
        type: 'append-log',
        direction: ok ? 'info' : 'error',
        message: translate(
          state.locale,
          ok ? 'dashboardWheelCenteredSaved' : 'dashboardWheelCenteredEepromFail',
        ),
      });
    } catch (error) {
      dispatch({
        type: 'append-log',
        direction: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      dispatch({ type: 'set-busy', busy: false });
    }
  }

  return (
    <div className="dashboard-main">
      <SectionHeader
        eyebrow={translate(state.locale, 'heroEyebrow')}
        title={translate(state.locale, 'heroTitle')}
        description={translate(state.locale, 'heroDescription')}
      />

      <div className="dashboard-body">
        {/* ── Left — 3D viewer ──────────────────────────────────────── */}
        <div className="wheel-panel">
          <Suspense
            fallback={
              <div className="wheel-viewer wheel-viewer--loading-shell" style={{ height: 340 }}>
                <div className="wheel-viewer-loading" aria-busy="true">
                  <div className="wheel-viewer-spinner" />
                  <span className="wheel-viewer-loading-label">
                    {translate(state.locale, 'wheelModelLoading')}
                  </span>
                </div>
              </div>
            }
          >
            <WheelViewer positionDegRef={live.positionDegRef} connected={state.connected} height={340} />
          </Suspense>

          <DashboardAnalogAxes
            connected={state.connected}
            positionDeg={live.positionDeg}
            torqueNm={live.torqueNm}
            maxTorqueNm={live.maxTorqueNm}
            gpioInputs={live.gpioInputs}
            polling={live.polling}
          />

          <div className="wheel-readout">
            <div className="wheel-actions">
              <button
                type="button"
                disabled={!state.connected || state.busy}
                onClick={() => void centerWheel()}
                title={translate(state.locale, 'centerWheelTitle')}
              >
                ⊙ {translate(state.locale, 'centerWheel')}
              </button>
            </div>
          </div>
        </div>

        {/* ── Right — status + metrics + actions ──────────────────── */}
        <div className="dashboard-side">
          {/* Connection status */}
          <div className="dashboard-connection">
            <span className="eyebrow">{translate(state.locale, 'statusBoard')}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: state.connected ? 'var(--ok)' : 'var(--muted-2)',
                  flexShrink: 0,
                }}
              />
              <strong style={{ fontSize: 14 }}>
                {translate(state.locale, state.connected ? 'connected' : 'disconnected')}
              </strong>
              {state.reconnecting && (
                <span style={{ color: 'var(--warn)', fontSize: 12 }}>{translate(state.locale, 'reconnectingEllipsis')}</span>
              )}
            </div>
          </div>

          {/* Live metrics */}
          <div className="dashboard-section">
            <span className="eyebrow">{translate(state.locale, 'dashboardLiveMetrics')}</span>
            <DashboardLiveMetrics connected={state.connected} metrics={live.metrics} />
          </div>

          {/* Quick actions */}
          <div className="dashboard-section">
            <span className="eyebrow">{translate(state.locale, 'dashboardQuickActions')}</span>
            <QuickActions categories={['safety', 'ffb']} />
          </div>
        </div>
      </div>
    </div>
  );
}
