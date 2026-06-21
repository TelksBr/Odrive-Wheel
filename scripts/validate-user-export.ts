import { readFileSync } from 'node:fs';
import { parseProfileValues, serializeProfileFlat } from '../src/features/board/profileFormat';
import { matchProfileImport, profileValuesFromState } from '../src/features/board/profileUtils';

const raw = readFileSync('.tmp-upstream/user-export-sample.json', 'utf8');
const parsed = parseProfileValues(raw);
const sanitized = serializeProfileFlat(profileValuesFromState(parsed));
const { matched, skipped, unknown } = matchProfileImport(parsed);

const notFound = Object.entries(parsed).filter(([, v]) => v === 'NOT_FOUND').map(([k]) => k);
const runtime = Object.keys(parsed).filter(
  (k) =>
    k.includes('current_state') ||
    k.includes('Iq_measured') ||
    k.includes('is_calibrated') ||
    k.includes('is_ready') ||
    k.includes('input_torque') ||
    k.endsWith('.cur') ||
    k.endsWith('.filt'),
);

console.log('Total keys (raw export):', Object.keys(parsed).length);
console.log('After sanitize:', Object.keys(sanitized).length);
console.log('Import match:', matched.length, 'skipped:', skipped.length, 'unknown:', unknown.length);
console.log('NOT_FOUND paths:', notFound);
console.log('Runtime in raw:', runtime.length, runtime);
