import type { ReactNode } from 'react';
import { useAppState } from '../../app/AppState';
import { translate } from '../../i18n/messages';

interface SetupStepCardProps {
  num: number;
  titleKey: string;
  descKey: string;
  optional?: boolean;
  skipped?: boolean;
  done?: boolean;
  collapsed?: boolean;
  onSkip?: () => void;
  onUnskip?: () => void;
  children?: ReactNode;
  actions: ReactNode;
}

export function SetupStepCard({
  num,
  titleKey,
  descKey,
  optional = false,
  skipped = false,
  done = false,
  collapsed = false,
  onSkip,
  onUnskip,
  children,
  actions,
}: SetupStepCardProps) {
  const { state } = useAppState();
  const locale = state.locale;

  return (
    <article
      className={`setup-step-card${skipped ? ' skipped' : ''}${done ? ' done' : ''}${collapsed ? ' collapsed' : ''}`}
    >
      <div className="setup-step-head">
        <h3>
          <span className="num">{done ? '✓' : num}</span>
          {translate(locale, titleKey)}
          {optional ? <span className="setup-optional-pill">{translate(locale, 'setupStepOptional')}</span> : null}
          {skipped ? <span className="setup-skipped-pill">{translate(locale, 'setupStepSkipped')}</span> : null}
        </h3>
        <div className="setup-step-head-actions">
          {optional && !skipped && onSkip ? (
            <button type="button" className="ghost setup-skip-btn" onClick={onSkip}>
              {translate(locale, 'setupStepSkip')}
            </button>
          ) : null}
          {skipped && onUnskip ? (
            <button type="button" className="ghost setup-skip-btn" onClick={onUnskip}>
              {translate(locale, 'setupStepRestore')}
            </button>
          ) : null}
        </div>
      </div>
      {!collapsed ? (
        <>
          <p>{translate(locale, descKey)}</p>
          {children}
          <div className="toolbar">{actions}</div>
        </>
      ) : null}
    </article>
  );
}
