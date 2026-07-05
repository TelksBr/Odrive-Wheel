#!/usr/bin/env node
/** Copy overlay-lan sources into Go hub embed tree. */
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'tools/overlay-lan');
const dest = join(root, 'tools/wheelforge-hub/internal/server/public/overlay');

if (!existsSync(src)) {
  console.error('overlay-lan source missing:', src);
  process.exit(1);
}

mkdirSync(dest, { recursive: true });
for (const file of ['index.html', 'overlay.css', 'overlay.js']) {
  cpSync(join(src, file), join(dest, file));
}

console.log('Copied overlay-lan → wheelforge-hub/internal/server/public/overlay');
