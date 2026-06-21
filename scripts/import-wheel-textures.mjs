/**
 * Copy OMP Substance Painter exports into public/models/wheel/textures/.
 *
 * Usage:
 *   node scripts/import-wheel-textures.mjs "C:\path\OMP" "C:\path\OMP4KNORMAL"
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const TARGET = resolve('public/models/wheel/textures');
const PATTERN = /^OMPDIREKSYON_Material\.\d{3}_(BaseColor|Normal|Roughness|Metallic)\.(png|jpg|jpeg)$/i;

const sources = process.argv.slice(2);
if (sources.length === 0) {
  console.error('Usage: node scripts/import-wheel-textures.mjs <folder1> [folder2 ...]');
  process.exit(1);
}

mkdirSync(TARGET, { recursive: true });

let copied = 0;
for (const sourceArg of sources) {
  const source = resolve(sourceArg);
  if (!existsSync(source)) {
    console.warn(`Skip missing folder: ${source}`);
    continue;
  }
  for (const name of readdirSync(source)) {
    if (!PATTERN.test(name)) {
      continue;
    }
    const from = join(source, name);
    const to = join(TARGET, name);
    copyFileSync(from, to);
    copied += 1;
    console.log(`Copied ${name}`);
  }
}

console.log(`Done — ${copied} texture(s) in ${TARGET}`);
