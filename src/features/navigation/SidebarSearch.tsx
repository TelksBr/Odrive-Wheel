import { useMemo, type ReactNode } from 'react';
import { useAppState } from '../../app/AppState';
import { searchApp, tabLabel, type SearchResult } from '../../app/globalSearch';
import { tabs } from '../../app/tabs';
import type { TabId } from '../../app/types';
import { translate } from '../../i18n/messages';
import { AppIcon } from '../../shared/ui/AppIcon';

interface SidebarSearchProps {
  query: string;
  onQueryChange: (value: string) => void;
}

export function SidebarSearch({ query, onQueryChange }: SidebarSearchProps) {
  const { state, dispatch } = useAppState();
  const locale = state.locale;
  const normalizedQuery = query.trim();
  const results = useMemo(
    () => searchApp(normalizedQuery, locale),
    [locale, normalizedQuery],
  );
  const isSearching = normalizedQuery.length > 0;

  function openResult(result: SearchResult) {
    dispatch({ type: 'set-tab', tab: result.tab });
    if (result.fieldPath) {
      dispatch({ type: 'focus-field', path: result.fieldPath });
    }
    onQueryChange('');
  }

  function openTab(tabId: TabId) {
    dispatch({ type: 'set-tab', tab: tabId });
    onQueryChange('');
  }

  return (
    <div className="sidebar-nav">
      <div className="nav-search">
        <AppIcon id="icon-search" size={15} className="nav-search-icon" />
        <input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={translate(locale, 'navSearch')}
          aria-label={translate(locale, 'navSearch')}
        />
      </div>

      {isSearching ? (
        <div className="nav-results">
          {results.total === 0 ? (
            <p className="nav-results-empty">{translate(locale, 'navSearchEmpty')}</p>
          ) : (
            <>
              {results.pages.length > 0 && (
                <SearchSection title={translate(locale, 'navSearchPages')}>
                  {results.pages.map((item) => (
                    <SearchResultButton key={item.id} result={item} onSelect={() => openResult(item)} />
                  ))}
                </SearchSection>
              )}
              {results.fields.length > 0 && (
                <SearchSection title={translate(locale, 'navSearchFields')}>
                  {results.fields.map((item) => (
                    <SearchResultButton key={item.id} result={item} onSelect={() => openResult(item)} />
                  ))}
                </SearchSection>
              )}
              {results.commands.length > 0 && (
                <SearchSection title={translate(locale, 'navSearchCommands')}>
                  {results.commands.map((item) => (
                    <SearchResultButton key={item.id} result={item} onSelect={() => openResult(item)} />
                  ))}
                </SearchSection>
              )}
            </>
          )}
        </div>
      ) : (
        <nav>
          {(['operate', 'tune', 'maintain'] as const).map((group) => (
            <div className="nav-group" key={group}>
              <span>{translate(locale, `group${group[0].toUpperCase()}${group.slice(1)}`)}</span>
              {tabs
                .filter((tab) => tab.group === group)
                .map((tab) => (
                  <button
                    type="button"
                    key={tab.id}
                    className={state.activeTab === tab.id ? 'active' : ''}
                    onClick={() => openTab(tab.id)}
                  >
                    <span className="nav-item-icon" aria-hidden="true">
                      <AppIcon id={tab.iconId} size={16} />
                    </span>
                    <span className="nav-item-copy">
                      <strong>{translate(locale, tab.labelKey)}</strong>
                      <small>{translate(locale, tab.descriptionKey)}</small>
                    </span>
                  </button>
                ))}
            </div>
          ))}
        </nav>
      )}
    </div>
  );
}

function SearchSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="nav-results-section">
      <span className="nav-results-label">{title}</span>
      <div className="nav-results-list">{children}</div>
    </section>
  );
}

function SearchResultButton({ result, onSelect }: { result: SearchResult; onSelect: () => void }) {
  const { state } = useAppState();
  const locale = state.locale;
  const kindLabel =
    result.kind === 'page'
      ? translate(locale, 'navSearchKindPage')
      : result.kind === 'field'
        ? translate(locale, 'navSearchKindField')
        : translate(locale, 'navSearchKindCommand');

  return (
    <button type="button" className="nav-result-item" onClick={onSelect}>
      <span className="nav-result-kind">{kindLabel}</span>
      <strong>{result.title}</strong>
      <small>{result.subtitle}</small>
      {result.kind !== 'page' && (
        <em>{tabLabel(locale, result.tab)}</em>
      )}
    </button>
  );
}
