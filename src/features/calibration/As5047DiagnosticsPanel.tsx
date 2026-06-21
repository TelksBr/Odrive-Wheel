import { useCallback, useState } from 'react';
import { useAppState } from '../../app/AppState';
import { translate } from '../../i18n/messages';
import { Card, Pill } from '../../shared/ui';
import {
  agcMagnetHint,
  fetchAs5047EncRaw,
  fetchAs5047Magnet,
  type As5047EncRaw,
  type As5047Magnet,
} from './as5047Diagnostics';

export function As5047DiagnosticsPanel() {
  const { state } = useAppState();
  const locale = state.locale;
  const [encRaw, setEncRaw] = useState<As5047EncRaw | null>(null);
  const [magnet, setMagnet] = useState<As5047Magnet | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!state.connected) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [raw, mag] = await Promise.all([fetchAs5047EncRaw(), fetchAs5047Magnet()]);
      setEncRaw(raw);
      setMagnet(mag);
      if (!raw && !mag) {
        setError(translate(locale, 'as5047DiagUnavailable'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [locale, state.connected]);

  const agcHint = magnet ? agcMagnetHint(magnet.agc) : 'unknown';

  return (
    <Card title={translate(locale, 'as5047DiagTitle')} description={translate(locale, 'as5047DiagDescription')}>
      <div className="toolbar" style={{ marginBottom: 12 }}>
        <button type="button" disabled={!state.connected || state.busy || loading} onClick={() => void refresh()}>
          {loading ? translate(locale, 'as5047DiagLoading') : translate(locale, 'as5047DiagRefresh')}
        </button>
        {error ? <Pill tone="error">{error}</Pill> : null}
      </div>

      <div className="as5047-diag-grid">
        <section>
          <h4 className="input-channel-config-title">{translate(locale, 'as5047DiagEncRaw')}</h4>
          {encRaw ? (
            <dl className="as5047-diag-list">
              <DiagRow label="ok" value={String(encRaw.ok)} />
              <DiagRow label="parity" value={String(encRaw.parity)} />
              <DiagRow label="ef" value={String(encRaw.ef)} />
              <DiagRow label="xfr" value={String(encRaw.xfr)} />
              <DiagRow label="last" value={encRaw.last} />
              <DiagRow label="pos" value={String(encRaw.pos)} />
            </dl>
          ) : (
            <p className="as5047-diag-empty">{translate(locale, 'as5047DiagEmpty')}</p>
          )}
        </section>

        <section>
          <h4 className="input-channel-config-title">{translate(locale, 'as5047DiagMagnet')}</h4>
          {magnet ? (
            <>
              <div style={{ marginBottom: 8 }}>
                <Pill tone={agcHint === 'ideal' ? 'ok' : agcHint === 'unknown' ? 'neutral' : 'warn'}>
                  {translate(locale, `as5047AgcHint_${agcHint}`)}
                </Pill>
              </div>
              <dl className="as5047-diag-list">
                <DiagRow label="agc" value={String(magnet.agc)} />
                <DiagRow label="magl" value={String(magnet.magLow)} />
                <DiagRow label="magh" value={String(magnet.magHigh)} />
                <DiagRow label="cof" value={String(magnet.cof)} />
                <DiagRow label="lf" value={String(magnet.lf)} />
                <DiagRow label="updates" value={String(magnet.updates)} />
                <DiagRow label="status" value={magnet.status} />
              </dl>
            </>
          ) : (
            <p className="as5047-diag-empty">{translate(locale, 'as5047DiagEmpty')}</p>
          )}
        </section>
      </div>
    </Card>
  );
}

function DiagRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="as5047-diag-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
