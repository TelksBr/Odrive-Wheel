import { readFileSync, writeFileSync } from 'node:fs';

const html = JSON.parse(readFileSync('.tmp-upstream/html-export.json', 'utf8')) as Record<string, string>;
const app = JSON.parse(readFileSync('.tmp-upstream/app-export.json', 'utf8')) as Record<string, string>;

const htmlKeys = new Set(Object.keys(html));
const appKeys = new Set(Object.keys(app));

const onlyHtml = [...htmlKeys].filter((k) => !appKeys.has(k)).sort();
const onlyApp = [...appKeys].filter((k) => !htmlKeys.has(k)).sort();
const both = [...htmlKeys].filter((k) => appKeys.has(k));
const valueDiff = both.filter((k) => html[k] !== app[k]).map((k) => ({ path: k, html: html[k], app: app[k] }));

console.log('HTML keys:', htmlKeys.size);
console.log('App keys:', appKeys.size);
console.log('Only HTML (' + onlyHtml.length + '):', onlyHtml.join('\n'));
console.log('Only App (' + onlyApp.length + '):', onlyApp.join('\n'));
console.log('Value diffs (' + valueDiff.length + '):', valueDiff);
