import { useCallback, useEffect } from 'react';
import { useAppState } from '../../app/AppState';
import { readField } from '../board/BoardProtocol';
import { ConfigFieldRow } from '../config/ConfigFieldRow';
import { flatFields } from '../config/fieldCatalog';
import { translate } from '../../i18n/messages';
import { Card } from '../../shared/ui';

const PROCESSOR_PATHS = ['axis.gpiofilt', 'axis.gpiofiltf', 'axis.gpioautocal'] as const;

const processorFields = PROCESSOR_PATHS.map((path) => {
  const field = flatFields.find((item) => item.path === path);
  if (!field) {
    throw new Error(`Missing processor field: ${path}`);
  }
  return field;
});

export function GpioAxisProcessorCard() {
  const { state, dispatch } = useAppState();
  const disabled = !state.connected || state.busy;

  const reload = useCallback(async () => {
    if (!state.connected) {
      return;
    }
    dispatch({ type: 'set-busy', busy: true });
    try {
      for (const field of processorFields) {
        const value = await readField(field);
        dispatch({ type: 'set-field', path: field.path, value, dirty: false });
      }
    } catch (error) {
      dispatch({
        type: 'append-log',
        direction: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      dispatch({ type: 'set-busy', busy: false });
    }
  }, [dispatch, state.connected]);

  useEffect(() => {
    if (state.connected) {
      void reload();
    }
  }, [state.connected, reload]);

  return (
    <Card
      title={translate(state.locale, 'inputsProcessorTitle')}
      description={translate(state.locale, 'inputsProcessorDescription')}
    >
      <div className="input-processor-grid">
        {processorFields.map((field) => (
          <ConfigFieldRow key={field.path} field={field} />
        ))}
      </div>
      <div className="toolbar" style={{ marginTop: 12 }}>
        <button type="button" disabled={disabled} onClick={() => void reload()}>
          {translate(state.locale, 'inputsProcessorReload')}
        </button>
      </div>
    </Card>
  );
}
