import fs from 'node:fs';
import vm from 'node:vm';

const app = fs.readFileSync('js/app.js', 'utf8');
const css = fs.readFileSync('css/app.css', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

const checks = [];
const check = (name, condition) => {
  checks.push({ name, pass: Boolean(condition) });
  if (!condition) process.exitCode = 1;
};

check('package version is 4.8.2 or newer', /^4\.(?:8\.(?:[2-9]|[1-9][0-9]+)|9\.[0-9]+)$/.test(pkg.version));
check('cache-busting script version is current', html.includes(`app.js?v=${pkg.version}`));
check('runtime app version is current', app.includes(`korea-beta-v${pkg.version}`));
check(
  'explorer thumbnail participates in positioned shared photo wrapper',
  /\.top-pick-photo,[\s\S]*?\.explorer-menu-photo\s*\{[\s\S]*?position:\s*relative/.test(css)
);
check(
  'explorer image is constrained to its thumbnail',
  /\.explorer-menu-photo img\s*\{/.test(css) ||
  /\.top-pick-photo img,[\s\S]*?\.explorer-menu-photo img\s*\{[\s\S]*?width:\s*100%[\s\S]*?height:\s*100%/.test(css)
);
check(
  'explorer fallback is scoped inside thumbnail',
  /\.explorer-menu-photo \.menu-photo-fallback\s*\{[\s\S]*?inset:\s*0/.test(css)
);
check(
  'core menu data is loaded separately',
  /const menuData = await loadJsonFile\(DATA_PATHS\.menus\)/.test(app)
);
check(
  'supplemental data uses allSettled',
  /Promise\.allSettled/.test(app) && /loadSupplementalAppData/.test(app)
);
check(
  'explorer distinguishes loading from core error',
  /APP_DATA_STATE\.core === 'error'/.test(app)
);
check(
  'core load error provides retry UI',
  /음식 데이터를 불러오지 못했어요/.test(app) && /location\.reload\(\)/.test(app)
);

new vm.Script(app);

for (const item of checks) {
  console.log(`${item.pass ? 'PASS' : 'FAIL'} ${item.name}`);
}

if (process.exitCode) {
  console.error('v4.8.2 validation failed');
} else {
  console.log('v4.8.2 validation passed');
}
