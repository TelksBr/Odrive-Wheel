import { EncoderToolsPanel } from './EncoderToolsPanel';
import { CalibrationActionGrid } from './CalibrationActionGrid';

export function MotorCalibrationExtras() {
  return (
    <div className="page-stack" style={{ gap: 12 }}>
      <EncoderToolsPanel />
      <CalibrationActionGrid />
    </div>
  );
}
