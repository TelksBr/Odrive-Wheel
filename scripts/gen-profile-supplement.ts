import { readFileSync, writeFileSync } from 'node:fs';
import { flatFields } from '../src/features/config/fieldCatalog';

const SKIP = new Set([
  'axis0.controller.config.anticogging.index',
  'axis0.controller.config.anticogging.calib_anticogging',
]);
const catalogPaths = new Set(flatFields.map((f) => f.path));
const supplement = JSON.parse(readFileSync('.tmp-upstream/profile-supplement.json', 'utf8')) as Array<{
  path: string;
  protocol: string;
  type: string;
}>;

const filtered = supplement.filter((entry) => !catalogPaths.has(entry.path) && !SKIP.has(entry.path));

const lines = filtered
  .map(
    (entry) =>
      `  { path: ${JSON.stringify(entry.path)}, label: ${JSON.stringify(entry.path)}, type: ${JSON.stringify(entry.type)}, protocol: ${JSON.stringify(entry.protocol)}, description: '' },`,
  )
  .join('\n');

const content = `import type { ConfigField } from '../config/fieldCatalog';

/** Paths present in legacy odrive-wheel.html SCHEMA but not yet in fieldCatalog. */
export const profileSupplementFields: ConfigField[] = [
${lines}
];
`;

writeFileSync('src/features/board/profileSupplement.ts', content);
console.log(`Wrote ${filtered.length} supplement fields`);
