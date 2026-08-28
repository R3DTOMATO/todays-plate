import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../css/app.css', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

function check(condition, message) {
  if (!condition) throw new Error(message);
}

check(pkg.version === '5.0.0', 'package version must be 5.0.0');
check(app.includes("korea-beta-v5.0.0"), 'runtime version must be v5.0.0');
check(html.includes('quick-decision') && html.includes('group-vote-panel'), 'Figma home/group screens missing');
check(html.includes('./assets/figma/hero-meal.svg'), 'Figma home asset missing');
check(html.includes('./assets/figma/taste-badge.svg') === false, 'taste badge should be rendered from profile JavaScript');
check(app.includes('./assets/figma/taste-badge.svg'), 'Figma taste badge missing');
check(app.includes('./assets/figma/map-art.svg'), 'Figma map art missing');
check(app.includes("key:'situation'") && app.includes("key:'preferenceBundle'"), 'three-step recommendation flow missing');
check(app.includes('회식') && app.includes('팀프로젝트'), 'group dining situations missing');
check(css.includes('--tt-bg-brand: #c93f31') && css.includes('--tt-bg-canvas: #fffaf7'), 'Figma tokens missing');
check(css.includes('.taste-fingerprint') && css.includes('.nearby-map-art'), 'Figma screen styles missing');
check(html.includes('app.js?v=5.0.0') && html.includes('app.css?v=5.0.0'), 'cache version missing');

const source = `${html}\n${app}`;
const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map(match => match[1]));
const duplicateIds = [...html.matchAll(/id="([^"]+)"/g)]
  .map(match => match[1])
  .filter((id, index, all) => all.indexOf(id) !== index);
check(duplicateIds.length === 0, `duplicate HTML ids: ${[...new Set(duplicateIds)].join(', ')}`);

const panelNames = new Set([...html.matchAll(/id="panel-([^"]+)"/g)].map(match => match[1]));
const panelTargets = [...source.matchAll(/switchPanel\(['"]([^'"]+)['"]/g)].map(match => match[1]);
const missingPanels = [...new Set(panelTargets)].filter(name => !panelNames.has(name));
check(missingPanels.length === 0, `missing panel targets: ${missingPanels.join(', ')}`);
check(ids.has('panel-group') && panelNames.has('group'), 'group vote panel id missing');

const inlineHandlers = [...source.matchAll(/\bon(?:click|change|input|submit|keydown|keyup)="([^"]*)"/g)]
  .map(match => match[1])
  .filter(value => !value.includes('${onClick}'));
const calledHandlers = [...new Set(inlineHandlers.flatMap(value =>
  [...value.matchAll(/(?<![\w$.])([A-Za-z_$][\w$]*)\s*\(/g)].map(match => match[1])
).filter(name => !['if'].includes(name)))];
const missingHandlers = calledHandlers.filter(name =>
  !new RegExp(`function\\s+${name}\\s*\\(`).test(app) &&
  !new RegExp(`(?:const|let|var)\\s+${name}\\s*=`).test(app)
);
check(missingHandlers.length === 0, `missing inline handlers: ${missingHandlers.join(', ')}`);

for (const filename of ['hero-meal.svg', 'map-art.svg', 'taste-badge.svg']) {
  const asset = fs.readFileSync(new URL(`../assets/figma/${filename}`, import.meta.url), 'utf8');
  check(asset.startsWith('<svg') && asset.includes('href="data:image/png;base64,'), `${filename} is not embedded locally`);
}

console.log('v5.0 Figma UI release validation passed');
