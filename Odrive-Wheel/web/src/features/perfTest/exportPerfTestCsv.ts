import type { PerfTestResults } from './perfTestTypes';

export function exportPerfTestCsv(results: PerfTestResults): void {
  const lines: string[] = [];
  lines.push(`# Performance Test export — ${new Date().toISOString()}`);
  lines.push(`# launch_torque_Nm=${results.launchTorqueNm.toFixed(3)}`);
  lines.push(`# current_lim_A=${results.currentLimA.toFixed(2)}`);
  lines.push(`# peak_RPM=${results.peakRPM.toFixed(0)}`);
  lines.push(`# peak_accel_RPM_s=${results.peakAccel.toFixed(0)}`);
  lines.push(`# inertia_kgm2=${results.inertiaKgM2 !== null ? results.inertiaKgM2.toFixed(5) : 'NaN'}`);
  lines.push(`# iq_max_A=${results.iqMax.toFixed(2)}`);
  lines.push(`# iq_sat_ms=${results.iqSatMs.toFixed(0)}`);
  lines.push(`# breakaway_pct=${results.breakawayPct ?? 'NaN'}`);
  lines.push('');
  lines.push('# === HID samples (high-rate) ===');
  lines.push('t_ms,pos_deg,vel_dps,rpm,accel_rpm_s');
  for (const s of results.samples) {
    lines.push([
      s.t.toFixed(1),
      s.pos.toFixed(3),
      (s.dps ?? 0).toFixed(2),
      (s.rpm ?? 0).toFixed(2),
      (s.accel ?? 0).toFixed(2),
    ].join(','));
  }
  if (results.iqSamples.length) {
    lines.push('');
    lines.push('# === Iq samples (serial, ~20Hz) ===');
    lines.push('t_ms,iq_A');
    for (const s of results.iqSamples) {
      lines.push(`${s.t.toFixed(1)},${s.iq.toFixed(3)}`);
    }
  }

  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `perftest_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}
