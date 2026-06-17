import { useMemo, useState } from 'react';
import { configGroups } from './fieldCatalog';
import { ConfigFieldRow } from './ConfigFieldRow';
import { Card } from '../../shared/ui';

export function ConfigPage({ filter, includeGroups }: { filter?: 'ffb' | 'odrive'; includeGroups?: string[] }) {
  const [query, setQuery] = useState('');
  const [activeGroup, setActiveGroup] = useState<string>('all');
  const normalizedQuery = query.trim().toLowerCase();

  const groups = useMemo(
    () =>
      configGroups
        .map((group) => ({
          ...group,
          fields: group.fields.filter((field) => {
            const protocolMatch = !filter || (filter === 'ffb' ? field.protocol === 'openffboard' : field.protocol === 'odrive');
            const allowedGroupMatch = !includeGroups || includeGroups.includes(group.id);
            const groupMatch = allowedGroupMatch && (activeGroup === 'all' || group.id === activeGroup);
            const queryMatch =
              !normalizedQuery ||
              field.path.toLowerCase().includes(normalizedQuery) ||
              field.label.toLowerCase().includes(normalizedQuery) ||
              field.description.toLowerCase().includes(normalizedQuery);
            return protocolMatch && groupMatch && queryMatch;
          }),
        }))
        .filter((group) => group.fields.length > 0),
    [activeGroup, filter, normalizedQuery],
  );

  const candidateGroups = configGroups.filter((group) =>
    (!includeGroups || includeGroups.includes(group.id)) &&
    group.fields.some((field) => !filter || (filter === 'ffb' ? field.protocol === 'openffboard' : field.protocol === 'odrive')),
  );
  const visibleCount = groups.reduce((count, group) => count + group.fields.length, 0);

  return (
    <div className="page-stack">
      <Card title={filter === 'ffb' ? 'FFB configurator' : 'ODrive configurator'} description="Search, filter, read, and write board fields without losing protocol details.">
        <div className="config-filterbar">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by path, label, or description"
          />
          <span>{visibleCount} fields</span>
        </div>
        <div className="chip-row">
          <button type="button" className={activeGroup === 'all' ? 'active' : ''} onClick={() => setActiveGroup('all')}>
            All
          </button>
          {candidateGroups.map((group) => (
            <button
              type="button"
              key={group.id}
              className={activeGroup === group.id ? 'active' : ''}
              onClick={() => setActiveGroup(group.id)}
            >
              {group.title}
            </button>
          ))}
        </div>
      </Card>
      {groups.map((group) => (
        <Card key={group.id} title={group.title} description={group.description}>
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
