import { ConfigPage } from '../config/ConfigPage';
import { TorqueCapAdvisor } from '../config/TorqueCapAdvisor';
import { useAppState } from '../../app/AppState';
import { translate } from '../../i18n/messages';
import { Card } from '../../shared/ui';

export function TuneWorkspace() {
  const { state } = useAppState();
  return (
    <div className="page-stack">
      <Card
        title={translate(state.locale, 'tuneTorqueCardTitle')}
        description={translate(state.locale, 'tuneTorqueCardDescription')}
      >
        <TorqueCapAdvisor />
      </Card>
      <ConfigPage filter="ffb" includeGroups={['ffb-wheel', 'ffb-effects', 'ffb-filters']} />
    </div>
  );
}
