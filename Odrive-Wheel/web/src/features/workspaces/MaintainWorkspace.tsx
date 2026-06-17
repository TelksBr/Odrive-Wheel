import { DfuPage } from '../dfu/DfuPage';
import { useAppState } from '../../app/AppState';
import { translate } from '../../i18n/messages';
import { Card } from '../../shared/ui';
import { ProfileActions } from '../board/ProfileActions';
import { QuickActions } from '../board/QuickActions';

export function MaintainWorkspace() {
  const { state } = useAppState();
  return (
    <div className="page-stack">
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
        <QuickActions categories={['system', 'diagnostics']} />
      </Card>
      <DfuPage />
    </div>
  );
}
