import { useMemo, useState } from 'react';
import { useAppState } from '../../app/AppState';
import { translate } from '../../i18n/messages';
import { computeNtcFit, odrivePolyCoefficients } from './ntcMath';
import { markDirtyPaths } from './calibrationPresets';

interface NtcCalculatorModalProps {
  onClose: () => void;
}

export function NtcCalculatorModal({ onClose }: NtcCalculatorModalProps) {
  const { state, dispatch } = useAppState();
  const locale = state.locale;
  const [beta, setBeta] = useState(3950);
  const [r25, setR25] = useState(10000);
  const [rPullup, setRPullup] = useState(10000);
  const [vref, setVref] = useState(3.3);
  const [tMin, setTMin] = useState(10);
  const [tMax, setTMax] = useState(130);

  const fit = useMemo(
    () => computeNtcFit({ beta, r25, rPullup, vref, tMin, tMax }),
    [beta, r25, rPullup, vref, tMin, tMax],
  );

  const odriveCoefs = fit ? odrivePolyCoefficients(fit.coefs) : null;

  function applyCoeffs() {
    if (!odriveCoefs) return;
    markDirtyPaths(
      [
        { path: 'axis0.motor.motor_thermistor.config.poly_coefficient_0', value: String(odriveCoefs[0]) },
        { path: 'axis0.motor.motor_thermistor.config.poly_coefficient_1', value: String(odriveCoefs[1]) },
        { path: 'axis0.motor.motor_thermistor.config.poly_coefficient_2', value: String(odriveCoefs[2]) },
        { path: 'axis0.motor.motor_thermistor.config.poly_coefficient_3', value: String(odriveCoefs[3]) },
      ],
      dispatch,
    );
    onClose();
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal-card ntc-modal" role="dialog" onClick={(e) => e.stopPropagation()}>
        <h3>{translate(locale, 'ntcTitle')}</h3>
        <p className="muted" style={{ fontSize: 12 }}>
          {translate(locale, 'ntcSubtitle')}
        </p>
        <p style={{ fontSize: 12, color: 'var(--warn)', margin: '8px 0' }}>{translate(locale, 'ntcPullupWarning')}</p>
        {fit && fit.nSaturated > 0 ? (
          <p style={{ fontSize: 12, color: 'var(--error)' }}>{translate(locale, 'ntcAdcOverflow')}</p>
        ) : null}

        <div className="ntc-form-grid">
          <label>{translate(locale, 'ntcBeta')}</label>
          <input type="number" value={beta} step="any" onChange={(e) => setBeta(Number(e.target.value))} />
          <label>{translate(locale, 'ntcR25')}</label>
          <input type="number" value={r25} step="any" onChange={(e) => setR25(Number(e.target.value))} />
          <label>{translate(locale, 'ntcRpullup')}</label>
          <input type="number" value={rPullup} step="any" onChange={(e) => setRPullup(Number(e.target.value))} />
          <label>{translate(locale, 'ntcVref')}</label>
          <input type="number" value={vref} step="any" onChange={(e) => setVref(Number(e.target.value))} />
          <label>{translate(locale, 'ntcTmin')}</label>
          <input type="number" value={tMin} step="any" onChange={(e) => setTMin(Number(e.target.value))} />
          <label>{translate(locale, 'ntcTmax')}</label>
          <input type="number" value={tMax} step="any" onChange={(e) => setTMax(Number(e.target.value))} />
        </div>

        {odriveCoefs ? (
          <>
            <h4 style={{ marginTop: 14 }}>{translate(locale, 'ntcCoefsTitle')}</h4>
            {odriveCoefs.map((c, i) => (
              <div key={i} className="coefs-row">
                <span>c{i} =</span>
                <code>{c.toExponential(6)}</code>
              </div>
            ))}
            <p className="muted small">
              {translate(locale, 'ntcFitRms')}: {fit?.rms.toFixed(3)} °C
            </p>
          </>
        ) : null}

        <div className="toolbar" style={{ marginTop: 14 }}>
          <button type="button" onClick={onClose}>
            {translate(locale, 'ntcCancel')}
          </button>
          <button type="button" className="ok" disabled={!odriveCoefs} onClick={applyCoeffs}>
            {translate(locale, 'ntcApply')}
          </button>
        </div>
      </div>
    </div>
  );
}
