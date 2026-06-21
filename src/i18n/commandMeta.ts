import type { BoardCommand } from '../domain/commands/commandRegistry';
import { translate, type Locale } from './messages';

export function localizeCommand(
  locale: Locale,
  command: BoardCommand,
): Pick<BoardCommand, 'label' | 'description'> {
  return {
    label: translate(locale, `command.${command.id}.label`),
    description: translate(locale, `command.${command.id}.desc`),
  };
}
