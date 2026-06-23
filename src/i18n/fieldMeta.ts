import type { ConfigField } from '../features/config/fieldCatalog';
import type { Locale } from './messages';
import { messages } from './messages';

/** Localize field label and description using `field.<path>.label` / `field.<path>.desc` keys. */
export function localizeField(field: ConfigField, locale: Locale): ConfigField {
  const labelKey = `field.${field.path}.label`;
  const descKey = `field.${field.path}.desc`;
  const label = messages[locale][labelKey] ?? messages.en[labelKey];
  const description = messages[locale][descKey] ?? messages.en[descKey];
  const options = field.options?.map((opt) => {
    const optKey = `field.${field.path}.opt.${opt.value}`;
    const optLabel = messages[locale][optKey] ?? messages.en[optKey];
    return optLabel ? { ...opt, label: optLabel } : opt;
  });
  return {
    ...field,
    label: label ?? field.label,
    description: description ?? field.description,
    options,
  };
}

/** Localize enum/bool option label for a field value. */
export function localizeOptionLabel(locale: Locale, field: ConfigField, value: string, fallback: string): string {
  if (field.path === 'axis0.requested_state') {
    return `${value} — ${axisStateLabel(locale, value)}`;
  }
  const key = `field.${field.path}.opt.${value}`;
  const text = messages[locale][key] ?? messages.en[key];
  return text ?? fallback;
}

/** Axis state code → localized label. */
export function axisStateLabel(locale: Locale, code: string): string {
  const key = `axisState${code}`;
  return messages[locale][key] ?? messages.en[key] ?? code;
}
