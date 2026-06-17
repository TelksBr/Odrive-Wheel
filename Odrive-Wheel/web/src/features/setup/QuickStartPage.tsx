import { useState } from 'react';
import { useAppState } from '../../app/AppState';
import { translate } from '../../i18n/messages';
import { Card } from '../../shared/ui';
import { serialService } from '../serial/SerialService';

interface SetupStep {
  id: string;
  title: string;
  description: string;
  actionLabel?: string;
  command?: string;
  checks: string[];
  timeoutMs?: number;
}

const steps: SetupStep[] = [
  {
    id: 'connect',
    title: 'Connect and identify',
    description: 'Confirm that the firmware responds over the shared CDC channel.',
    actionLabel: 'Probe board',
    command: 'sys.hwtype?',
    checks: ['sys.swver?', 'sys.hwtype?', 'r vbus_voltage'],
  },
  {
    id: 'safe-power',
    title: 'Verify power limits',
    description: 'Read PSU, brake resistor and voltage thresholds before calibration.',
    actionLabel: 'Read power config',
    checks: [
      'r config.brake_resistance',
      'r config.dc_bus_overvoltage_trip_level',
      'r config.dc_bus_undervoltage_trip_level',
      'r config.dc_max_negative_current',
    ],
  },
  {
    id: 'motor-cal',
    title: 'Motor calibration',
    description: 'Measure motor phase resistance and inductance. The motor should beep but not spin.',
    actionLabel: 'Run motor calibration',
    command: 'w axis0.requested_state 4',
    checks: ['r axis0.motor.is_calibrated', 'r axis0.motor.error'],
    timeoutMs: 1000,
  },
  {
    id: 'encoder-cal',
    title: 'Encoder offset calibration',
    description: 'Center the wheel mechanically first; this step can rotate the motor about one turn.',
    actionLabel: 'Run encoder calibration',
    command: 'w axis0.requested_state 7',
    checks: ['r axis0.encoder.is_ready', 'r axis0.encoder.error'],
    timeoutMs: 1000,
  },
  {
    id: 'torque-mode',
    title: 'FFB torque mode defaults',
    description: 'Set controller mode for direct FFB torque injection.',
    actionLabel: 'Apply torque mode',
    command:
      'w axis0.controller.config.control_mode 1; w axis0.controller.config.input_mode 1; w axis0.controller.config.enable_torque_mode_vel_limit 0',
    checks: ['r axis0.controller.config.control_mode', 'r axis0.controller.config.input_mode'],
  },
  {
    id: 'closed-loop',
    title: 'Closed loop smoke test',
    description: 'Arm the axis after calibration and verify no motor or encoder error appears.',
    actionLabel: 'Enter closed loop',
    command: 'w axis0.requested_state 8',
    checks: ['r axis0.current_state', 'r axis0.error', 'r axis0.motor.error', 'r axis0.encoder.error'],
  },
  {
    id: 'save',
    title: 'Persist configuration',
    description: 'Save FFB EEPROM and ODrive NVM once the board is stable.',
    actionLabel: 'Save both stores',
    command: 'sys.save!; w axis0.requested_state 1; ss',
    checks: ['sys.savestat?', 'sys.eedump?'],
    timeoutMs: 8000,
  },
];

export function QuickStartPage() {
  const { state, dispatch } = useAppState();
  const [activeStep, setActiveStep] = useState(steps[0].id);
  const [results, setResults] = useState<Record<string, Record<string, string>>>({});

  async function runStep(step: SetupStep) {
    dispatch({ type: 'set-busy', busy: true });
    try {
      if (step.command) {
        for (const command of step.command.split(';').map((item) => item.trim()).filter(Boolean)) {
          await serialService.sendCommand(command, true, step.timeoutMs ?? 2500);
        }
      }

      const nextResults: Record<string, string> = {};
      for (const check of step.checks) {
        nextResults[check] = await serialService.sendCommand(check, true, 2500);
      }
      setResults((current) => ({ ...current, [step.id]: nextResults }));
    } catch (error) {
      dispatch({ type: 'append-log', direction: 'error', message: error instanceof Error ? error.message : String(error) });
    } finally {
      dispatch({ type: 'set-busy', busy: false });
    }
  }

  return (
    <Card title={translate(state.locale, 'quickStart')} description={translate(state.locale, 'setupHint')}>
      <div className="setup-flow">
        <div className="setup-step-list">
          {steps.map((step, index) => (
            <button
              type="button"
              key={step.id}
              className={activeStep === step.id ? 'active' : ''}
              onClick={() => setActiveStep(step.id)}
            >
              <span>{index + 1}</span>
              <strong>{step.title}</strong>
            </button>
          ))}
        </div>
        <div className="setup-step-detail">
          {steps
            .filter((step) => step.id === activeStep)
            .map((step) => (
              <article key={step.id}>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
                <div className="toolbar">
                  <button type="button" disabled={!state.connected || state.busy} onClick={() => void runStep(step)}>
                    {step.actionLabel ?? 'Run checks'}
                  </button>
                </div>
                <div className="debug-grid">
                  {step.checks.map((check) => (
                    <div className="debug-cell" key={check}>
                      <code>{check}</code>
                      <pre>{results[step.id]?.[check] ?? 'Not checked yet'}</pre>
                    </div>
                  ))}
                </div>
              </article>
            ))}
        </div>
      </div>
    </Card>
  );
}
