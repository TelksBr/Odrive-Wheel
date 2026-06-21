import { useEffect } from 'react';
import { useAppState } from '../../app/AppState';

export function FieldFocusEffect() {
  const { state, dispatch } = useAppState();

  useEffect(() => {
    const path = state.focusFieldPath;
    if (!path) {
      return;
    }

    const timer = window.setTimeout(() => {
      const element = document.getElementById(`config-field-${path}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element.classList.add('field-row--highlight');
        window.setTimeout(() => {
          element.classList.remove('field-row--highlight');
        }, 2200);
      }
      dispatch({ type: 'clear-focus-field' });
    }, 120);

    return () => window.clearTimeout(timer);
  }, [dispatch, state.activeTab, state.focusFieldPath]);

  return null;
}
