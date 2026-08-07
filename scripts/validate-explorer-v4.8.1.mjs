import fs from 'node:fs';

const app = fs.readFileSync('js/app.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const css = fs.readFileSync('css/app.css', 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

const checks = [
  ['version', /^4\.(?:8\.[1-9][0-9]*|9\.[0-9]+)$/.test(pkg.version) && app.includes(`korea-beta-v${pkg.version}`) && html.includes(`app.js?v=${pkg.version}`)],
  ['static explorer shell', html.includes('explorer-loading-shell') && html.includes('favoritesContent')],
  ['explorer guarded render', app.includes('function renderExplorerError') && app.includes('try {') && app.includes("area:'explorer_render'")],
  ['favorites migration', app.includes('function normalizedFavoriteMenuNames') && app.includes("typeof item === 'string'")],
  ['multi scroller reset', app.includes('function resetPanelScroll') && app.includes("document.querySelector('.container')") && app.includes('setTimeout(() => resetPanelScroll(nextPanel), 60)')],
  ['explorer pre-render after data load', /renderToday\(\);\s*renderFavorites\(\);\s*renderAnalyticsConsentPrompt\(\);/.test(app)],
  ['active panel CSS fallback', css.includes('#panel-favorites.active') && css.includes('display: flex !important')],
];

let failed = false;
for (const [name, passed] of checks) {
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`);
  if (!passed) failed = true;
}
if (failed) process.exit(1);
