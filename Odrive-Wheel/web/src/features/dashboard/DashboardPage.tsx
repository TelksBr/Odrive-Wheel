import { useAppState } from '../../app/AppState';
import { translate } from '../../i18n/messages';
import { Card, Pill, SectionHeader } from '../../shared/ui';
import { QuickActions } from '../board/QuickActions';

export function DashboardPage() {
  const { state } = useAppState();

  return (
    <div className="overview-page">
      <SectionHeader
        eyebrow={translate(state.locale, 'heroEyebrow')}
        title={translate(state.locale, 'heroTitle')}
        description={translate(state.locale, 'heroDescription')}
      />

      <div className="hero-status">
        <StatusTile label={translate(state.locale, 'statusBoard')} value={translate(state.locale, state.connected ? 'connected' : 'disconnected')} tone={state.connected ? 'ok' : 'neutral'} locale={state.locale} />
        <StatusTile label={translate(state.locale, 'statusSerial')} value={translate(state.locale, state.serialSupported ? 'statusAvailable' : 'statusUnavailable')} tone={state.serialSupported ? 'ok' : 'error'} locale={state.locale} />
        <StatusTile label={translate(state.locale, 'statusWebHid')} value={translate(state.locale, state.hidSupported ? 'statusAvailable' : 'statusUnavailable')} tone={state.hidSupported ? 'ok' : 'error'} locale={state.locale} />
        <StatusTile label={translate(state.locale, 'statusWebUsb')} value={translate(state.locale, state.usbSupported ? 'statusAvailable' : 'statusUnavailable')} tone={state.usbSupported ? 'ok' : 'error'} locale={state.locale} />
      </div>

      <section className="overview-grid">
        <Card title={translate(state.locale, 'flowTitle')} description={translate(state.locale, 'flowDescription')}>
          <div className="flow-list">
            <FlowItem index="1" title={translate(state.locale, 'flowSetupTitle')} text={translate(state.locale, 'flowSetupText')} />
            <FlowItem index="2" title={translate(state.locale, 'flowMotorTitle')} text={translate(state.locale, 'flowMotorText')} />
            <FlowItem index="3" title={translate(state.locale, 'flowTuneTitle')} text={translate(state.locale, 'flowTuneText')} />
            <FlowItem index="4" title={translate(state.locale, 'flowObserveTitle')} text={translate(state.locale, 'flowObserveText')} />
          </div>
        </Card>

        <Card title={translate(state.locale, 'safetyTitle')} description={translate(state.locale, 'safetyDescription')}>
          <ol className="number-list compact">
            <li>{translate(state.locale, 'safetyStep1')}</li>
            <li>{translate(state.locale, 'safetyStep2')}</li>
            <li>{translate(state.locale, 'safetyStep3')}</li>
            <li>{translate(state.locale, 'safetyStep4')}</li>
          </ol>
        </Card>
      </section>

      <Card title={translate(state.locale, 'quickActionsTitle')} description={translate(state.locale, 'quickActionsDescription')}>
        <QuickActions />
      </Card>
    </div>
  );
}

function StatusTile({ label, value, tone, locale }: { label: string; value: string; tone: 'ok' | 'error' | 'neutral'; locale: 'pt' | 'en' }) {
  return (
    <div className={`status-tile ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <Pill tone={tone}>{translate(locale, tone === 'ok' ? 'statusReady' : tone === 'error' ? 'statusBlocked' : 'statusWaiting')}</Pill>
    </div>
  );
}

function FlowItem({ index, title, text }: { index: string; title: string; text: string }) {
  return (
    <article className="flow-item">
      <span>{index}</span>
      <div>
        <strong>{title}</strong>
        <p>{text}</p>
      </div>
    </article>
  );
}
