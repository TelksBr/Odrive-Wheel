import fs from 'fs';
const src = fs.readFileSync('src/features/config/fieldCatalog.ts', 'utf8');
const re = /path: '([^']+)'[\s\S]*?label: '([^']+)'[\s\S]*?description: '((?:[^'\\]|\\.)*)'/g;
const fields = [];
let m;
while ((m = re.exec(src))) {
  fields.push({ path: m[1], label: m[2], desc: m[3] });
}
console.log(JSON.stringify(fields, null, 2));
