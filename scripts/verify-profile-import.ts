import { readFileSync } from 'node:fs';
import { parseProfileValues } from '../src/features/board/profileFormat';
import { matchProfileImport, profileFields, profileValuesFromState } from '../src/features/board/profileUtils';

const examplePath = '.tmp-upstream/example-profile.json';
const example = parseProfileValues(readFileSync(examplePath, 'utf8'));
const { matched, unknown } = matchProfileImport(example);

console.log('Example keys:', Object.keys(example).length);
console.log('Matched:', matched.length);
console.log('Unknown:', unknown.length, unknown);

const exportPaths = new Set(Object.keys(profileValuesFromState(example)));
const examplePaths = new Set(Object.keys(example).filter((k) => k !== 'undefined'));
const missingOnExport = [...examplePaths].filter((p) => !exportPaths.has(p));
console.log('Example covered by export registry:', examplePaths.size - missingOnExport.length, '/', examplePaths.size);
if (missingOnExport.length > 0) {
  console.log('Still missing:', missingOnExport);
}

const roundTrip = serializeCheck(example);
console.log('Round-trip keys preserved:', roundTrip);

function serializeCheck(values: Record<string, string>): number {
  const { serializeProfileFlat } = require('../src/features/board/profileFormat') as typeof import('../src/features/board/profileFormat');
  const flat = serializeProfileFlat(profileValuesFromState(values));
  return Object.keys(flat).length;
}

console.log('Profile registry fields:', profileFields.length);
