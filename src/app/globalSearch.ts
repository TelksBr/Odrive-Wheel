import { boardCommands, type CommandCategory } from '../domain/commands/commandRegistry';
import { flatFields, type ConfigField } from '../features/config/fieldCatalog';
import { getFieldHelp } from '../features/config/fieldHelp';
import { localizeField } from '../i18n/fieldMeta';
import { localizeCommand } from '../i18n/commandMeta';
import type { Locale } from '../i18n/messages';
import { translate } from '../i18n/messages';
import { preferredTabForField } from './refreshPolicy';
import { tabs, type TabDefinition } from './tabs';
import type { TabId } from './types';

export type SearchResultKind = 'page' | 'field' | 'command';

export interface SearchResult {
  id: string;
  kind: SearchResultKind;
  title: string;
  subtitle: string;
  tab: TabId;
  fieldPath?: string;
  command?: string;
  score: number;
}

export interface GlobalSearchResults {
  pages: SearchResult[];
  fields: SearchResult[];
  commands: SearchResult[];
  total: number;
}

const MAX_PAGES = 8;
const MAX_FIELDS = 14;
const MAX_COMMANDS = 10;

const CATEGORY_KEYS: Record<CommandCategory, string> = {
  safety: 'commandCategorySafety',
  calibration: 'commandCategoryCalibration',
  ffb: 'commandCategoryFfb',
  system: 'commandCategorySystem',
  diagnostics: 'commandCategoryDiagnostics',
};

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

function tokens(query: string): string[] {
  return normalize(query)
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function scoreText(haystack: string, queryTokens: string[]): number {
  const normalized = normalize(haystack);
  if (queryTokens.length === 0) {
    return 0;
  }

  let score = 0;
  for (const token of queryTokens) {
    if (!normalized.includes(token)) {
      return 0;
    }
    if (normalized === token) {
      score += 12;
    } else if (normalized.startsWith(token)) {
      score += 8;
    } else {
      score += 4;
    }
  }
  return score;
}

function searchPages(queryTokens: string[], locale: Locale): SearchResult[] {
  const results: SearchResult[] = [];

  for (const tab of tabs) {
    const label = translate(locale, tab.labelKey);
    const description = translate(locale, tab.descriptionKey);
    const groupKey = `group${tab.group[0].toUpperCase()}${tab.group.slice(1)}`;
    const group = translate(locale, groupKey);
    const score = Math.max(
      scoreText(`${label} ${description}`, queryTokens),
      scoreText(`${tab.id} ${tab.labelKey}`, queryTokens),
      scoreText(group, queryTokens),
    );
    if (score <= 0) {
      continue;
    }
    results.push({
      id: `page:${tab.id}`,
      kind: 'page',
      title: label,
      subtitle: description,
      tab: tab.id,
      score,
    });
  }

  return results.sort((a, b) => b.score - a.score).slice(0, MAX_PAGES);
}

function fieldSearchText(field: ConfigField, locale: Locale): string {
  const localized = localizeField(field, locale);
  const help = getFieldHelp(field, locale);
  return [
    field.path,
    localized.label,
    localized.description,
    help.guidance,
    help.readCommand,
    field.groupId ?? '',
  ].join(' ');
}

function searchFields(queryTokens: string[], locale: Locale): SearchResult[] {
  const results: SearchResult[] = [];

  for (const field of flatFields) {
    const localized = localizeField(field, locale);
    const text = fieldSearchText(field, locale);
    let score = scoreText(text, queryTokens);
    if (score > 0 && normalize(field.path).includes(queryTokens[0] ?? '')) {
      score += 6;
    }
    if (score <= 0) {
      continue;
    }
    results.push({
      id: `field:${field.path}`,
      kind: 'field',
      title: localized.label,
      subtitle: field.path,
      tab: preferredTabForField(field),
      fieldPath: field.path,
      score,
    });
  }

  return results.sort((a, b) => b.score - a.score).slice(0, MAX_FIELDS);
}

function searchCommands(queryTokens: string[], locale: Locale): SearchResult[] {
  const results: SearchResult[] = [];

  for (const command of boardCommands) {
    const localized = localizeCommand(locale, command);
    const category = translate(locale, CATEGORY_KEYS[command.category]);
    const text = `${localized.label} ${localized.description} ${command.command} ${category}`;
    const score = scoreText(text, queryTokens);
    if (score <= 0) {
      continue;
    }
    results.push({
      id: `command:${command.id}`,
      kind: 'command',
      title: localized.label,
      subtitle: command.command,
      tab: 'commands',
      command: command.command,
      score,
    });
  }

  return results.sort((a, b) => b.score - a.score).slice(0, MAX_COMMANDS);
}

export function searchApp(query: string, locale: Locale): GlobalSearchResults {
  const queryTokens = tokens(query);
  if (queryTokens.length === 0) {
    return { pages: [], fields: [], commands: [], total: 0 };
  }

  const pages = searchPages(queryTokens, locale);
  const fields = searchFields(queryTokens, locale);
  const commands = searchCommands(queryTokens, locale);

  return {
    pages,
    fields,
    commands,
    total: pages.length + fields.length + commands.length,
  };
}

export function tabLabel(locale: Locale, tab: TabDefinition | TabId): string {
  const def = typeof tab === 'string' ? tabs.find((item) => item.id === tab) : tab;
  return def ? translate(locale, def.labelKey) : String(tab);
}
