import { DfuPage } from '../dfu/DfuPage';
import { Card } from '../../shared/ui';
import { ProfileActions } from '../board/ProfileActions';
import { QuickActions } from '../board/QuickActions';

export function MaintainWorkspace() {
  return (
    <div className="page-stack">
      <Card title="Persistence and profiles" description="Save board state, export profiles, reboot, or clear configuration.">
        <ProfileActions />
      </Card>
      <Card title="System commands" description="Maintenance operations that are not tied to a specific form.">
        <QuickActions categories={['system', 'diagnostics']} />
      </Card>
      <DfuPage />
    </div>
  );
}
