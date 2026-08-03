import fs from 'node:fs';

const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../css/app.css', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const checks = [
  ['package version', pkg.version === '4.8.4'],
  ['runtime version', app.includes("korea-beta-v4.8.4")],
  ['cache version', html.includes('app.js?v=4.8.4')],
  ['composition start handler', app.includes("addEventListener('compositionstart'")],
  ['composition end handler', app.includes("addEventListener('compositionend'")],
  ['input composing guard', app.includes('event.isComposing === true')],
  ['search input is not inline-rendered on each key', !app.includes('oninput="updateExplorerQuery(this.value)"')],
  ['partial result renderer', app.includes('function renderExplorerResults()')],
  ['stable results container', app.includes('id="explorerResultsSection"')],
  ['stable favorites container', app.includes('id="explorerFavoritesSection"')],
  ['Korean nearby label', app.includes('메뉴 우선 식당 검색')],
  ['light nearby card text', css.includes('.nearby-search-card .nearby-title') && css.includes('color: var(--text-primary);')],
  ['readable nearby secondary copy', css.includes('.nearby-search-card .nearby-tier small,')],
];

for (const [name, pass] of checks) {
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`);
}
if (checks.some(([, pass]) => !pass)) process.exit(1);
