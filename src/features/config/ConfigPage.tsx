import { useMemo, useState } from 'react';
import { useAppState } from '../../app/AppState';
import { translate } from '../../i18n/messages';
import { translateGroupDescription, translateGroupTitle } from '../../i18n/bundles/configGroups';
import { localizeField } from '../../i18n/fieldMeta';
import { configGroups } from './fieldCatalog';
import { ConfigFieldRow } from './ConfigFieldRow';
import { isTorqueControlMode } from './fieldEditState';
import { Card } from '../../shared/ui';

export function ConfigPage({ filter, includeGroups }: { filter?: 'ffb' | 'odrive'; includeGroups?: string[] }) {
  const { state } = useAppState();
  const [query, setQuery] = useState('');
  const [activeGroup, setActiveGroup] = useState<string>('all');
  const normalizedQuery = query.trim().toLowerCase();
  const locale = state.locale;

  const groups = useMemo(
    () =>
      configGroups
        .map((group) => ({
          ...group,
          title: translateGroupTitle(locale, group.id, group.title),
          description: translateGroupDescription(locale, group.id, group.description),
          fields: group.fields
            .filter((field) => {
              if (field.readonly) return false;
              const protocolMatch = !filter || (filter === 'ffb' ? field.protocol === 'openffboard' : field.protocol === 'odrive');
              const allowedGroupMatch = !includeGroups || includeGroups.includes(group.id);
              const groupMatch = allowedGroupMatch && (activeGroup === 'all' || group.id === activeGroup);
              const localized = localizeField(field, locale);
              const queryMatch =
                !normalizedQuery ||
                field.path.toLowerCase().includes(normalizedQuery) ||
                localized.label.toLowerCase().includes(normalizedQuery) ||
                localized.description.toLowerCase().includes(normalizedQuery);
              return protocolMatch && groupMatch && queryMatch;
            })
            .map((field) => localizeField(field, locale)),
        }))
        .filter((group) => group.fields.length > 0),
    [activeGroup, filter, includeGroups, locale, normalizedQuery],
  );

  const candidateGroups = configGroups.filter((group) =>
    (!includeGroups || includeGroups.includes(group.id)) &&
    group.fields.some(
      (field) =>
        !field.readonly &&
        (!filter || (filter === 'ffb' ? field.protocol === 'openffboard' : field.protocol === 'odrive')),
    ),
  );
  const visibleCount = groups.reduce((count, group) => count + group.fields.length, 0);

  return (
    <div className="page-stack">
      <Card
        title={translate(locale, filter === 'ffb' ? 'configTitleFfb' : 'configTitleOdrive')}
        description={translate(locale, 'configDescription')}
      >
        <div className="config-filterbar">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={translate(locale, 'configSearchPlaceholder')}
          />
          <span>{translate(locale, 'configFieldCount', { n: visibleCount })}</span>
        </div>
        <div className="chip-row">
          <button type="button" className={activeGroup === 'all' ? 'active' : ''} onClick={() => setActiveGroup('all')}>
            {translate(locale, 'configFilterAll')}
          </button>
          {candidateGroups.map((group) => (
            <button
              type="button"
              key={group.id}
              className={activeGroup === group.id ? 'active' : ''}
              onClick={() => setActiveGroup(group.id)}
            >
              {translateGroupTitle(locale, group.id, group.title)}
            </button>
          ))}
        </div>
      </Card>
      {groups.map((group) => (
        <Card key={group.id} title={group.title} description={group.description}>
          {group.id === 'controller' &&
          isTorqueControlMode(state.fieldValues['axis0.controller.config.control_mode']) ? (
            <div className="controller-torque-banner">
              <strong>{translate(locale, 'ctrlWarnTorqueTitle')}</strong>
              <p>{translate(locale, 'ctrlWarnTorqueDesc')}</p>
            </div>
          ) : null}
          <div className="field-list">
            {group.fields.map((field) => (
              <ConfigFieldRow key={field.path} field={field} />
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
