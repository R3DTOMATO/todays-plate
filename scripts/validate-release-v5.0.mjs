import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../css/app.css', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

function check(condition, message) {
  if (!condition) throw new Error(message);
}

// v5.0에서 도입한 Figma UI가 이후 릴리스에서도 유지되는지 보는 스크립트다.
// 5.0.0에 고정해 두면 버전이 올라가는 순간 영영 실패하므로, 5.0.0 이상이면 통과시킨다.
const [major, minor, patch] = String(pkg.version).split('.').map(Number);
check(
  Number.isFinite(major) && Number.isFinite(minor) && Number.isFinite(patch) && major >= 5,
  `package version must be 5.0.0 or newer (got ${pkg.version})`,
);
check(app.includes(`korea-beta-v${pkg.version}`), `runtime version must match package version (${pkg.version})`);
check(html.includes('quick-decision') && html.includes('group-vote-panel'), 'Figma home/group screens missing');
// hero-meal.svg와 taste-badge.svg는 이후 홈·내입맛 화면 개편에서 쓰이지 않게 되었다.
// (파일은 assets/figma에 남아 있지만 어디서도 참조하지 않는다 — 정리 대상.)
// 지금도 실제로 쓰는 것은 map-art.svg 하나뿐이므로 그것만 검사한다.
check(app.includes('./assets/figma/map-art.svg'), 'Figma map art missing');
check(app.includes("key:'situation'") && app.includes("key:'preferenceBundle'"), 'three-step recommendation flow missing');
check(app.includes('회식') && app.includes('팀프로젝트'), 'group dining situations missing');
check(css.includes('--tt-bg-brand: #c93f31') && css.includes('--tt-bg-canvas: #fffaf7'), 'Figma tokens missing');
check(css.includes('.taste-fingerprint') && css.includes('.nearby-map-art'), 'Figma screen styles missing');
// app.js 캐시 버전은 package.json과 같아야 한다(다른 validate 스크립트와 같은 규칙).
// app.css는 별도 주기로 올라가므로 존재 여부만 본다.
check(html.includes(`app.js?v=${pkg.version}`), `app.js cache version must be ${pkg.version}`);
check(/app\.css\?v=\d+\.\d+\.\d+/.test(html), 'app.css cache version missing');

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

for (const filename of ['map-art.svg']) {
  const asset = fs.readFileSync(new URL(`../assets/figma/${filename}`, import.meta.url), 'utf8');
  check(asset.startsWith('<svg') && asset.includes('href="data:image/png;base64,'), `${filename} is not embedded locally`);
}

console.log('v5.0 Figma UI release validation passed');
