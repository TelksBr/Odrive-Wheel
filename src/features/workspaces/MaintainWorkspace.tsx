import { DfuPage } from '../dfu/DfuPage';
import { useAppState } from '../../app/AppState';
import { translate } from '../../i18n/messages';
import { Card, SectionHeader } from '../../shared/ui';
import { ProfileActions } from '../board/ProfileActions';
import { QuickActions } from '../board/QuickActions';

const SYSTEM_COMMAND_IDS = [
  'save-ffb',
  'save-odrive',
  'reboot',
  'reboot-dfu',
] as const;

const DIAGNOSTIC_COMMAND_IDS = [
  'ffb-diag',
  'ffb-diag-detail',
  'torque-diag',
  'save-stat',
  'eeprom-dump',
  'enc-raw',
  'magnet-diag',
] as const;

export function MaintainWorkspace() {
  const { state } = useAppState();

  return (
    <div className="page-stack maintain-page">
      <SectionHeader
        eyebrow={translate(state.locale, 'tabMaintain')}
        title={translate(state.locale, 'maintainHeroTitle')}
        description={translate(state.locale, 'maintainHeroDescription')}
      />

      {!state.serialSupported && (
        <p className="warning">{translate(state.locale, 'noSerial')}</p>
      )}

      <Card
        title={translate(state.locale, 'maintainPersistenceTitle')}
        description={translate(state.locale, 'maintainPersistenceDescription')}
      >
        <ProfileActions />
      </Card>

      <Card
        title={translate(state.locale, 'maintainSystemTitle')}
        description={translate(state.locale, 'maintainSystemDescription')}
      >
        <QuickActions ids={[...SYSTEM_COMMAND_IDS]} />
      </Card>

      <Card
        title={translate(state.locale, 'maintainDiagnosticsTitle')}
        description={translate(state.locale, 'maintainDiagnosticsDescription')}
      >
        <QuickActions ids={[...DIAGNOSTIC_COMMAND_IDS]} />
      </Card>

      <DfuPage />
    </div>
  );
}
