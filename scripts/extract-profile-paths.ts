import { readFileSync, writeFileSync } from 'node:fs';
import { flatFields } from '../src/features/config/fieldCatalog';

const html = readFileSync('.tmp-upstream/odrive-wheel.html', 'utf8');
const example = JSON.parse(readFileSync('.tmp-upstream/example-profile.json', 'utf8')) as Record<string, string>;
const catalogPaths = new Set(flatFields.map((f) => f.path));

const missing = Object.keys(example).filter((k) => k !== 'undefined' && !catalogPaths.has(k));

function inferProtocol(path: string): 'odrive' | 'openffboard' {
  if (path.startsWith('config.') || path.startsWith('axis0.')) {
    return 'odrive';
  }
  return 'openffboard';
}

function inferType(path: string, val: string): 'float' | 'int' | 'bool' {
  if (val === 'True' || val === 'False') {
    return 'bool';
  }
  if (
    path.includes('enable_') ||
    path.includes('pre_calibrated') ||
    path.startsWith('axis0.config.startup_') ||
    path.includes('use_index') ||
    path.includes('finish_on_') ||
    path.endsWith('.invert')
  ) {
    return 'bool';
  }
  if (
    path.includes('protocol') ||
    path.includes('_pin') ||
    path.endsWith('.mode') ||
    path.includes('pole_pairs') ||
    path.includes('.cpr') ||
    path.endsWith('.direction') ||
    path.endsWith('.index')
  ) {
    return 'int';
  }
  return 'float';
}

const supplement = missing.map((path) => ({
  path,
  protocol: inferProtocol(path),
  type: inferType(path, example[path] ?? ''),
}));

writeFileSync('.tmp-upstream/profile-supplement.json', JSON.stringify(supplement, null, 2));
console.log(`Supplement paths: ${supplement.length}`);
