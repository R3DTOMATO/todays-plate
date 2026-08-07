import fs from 'node:fs';

const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../css/app.css', import.meta.url), 'utf8');
const server = fs.readFileSync(new URL('../server/kakao-nearby-proxy.mjs', import.meta.url), 'utf8');
const report = fs.readFileSync(new URL('../server/beta-report.mjs', import.meta.url), 'utf8');
const firebase = JSON.parse(fs.readFileSync(new URL('../firebase.json', import.meta.url), 'utf8'));
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const menus = JSON.parse(fs.readFileSync(new URL('../data/menus.json', import.meta.url), 'utf8'));

const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

check(pkg.version === '4.9.0', 'package version must be 4.9.0');
check(app.includes("korea-beta-v4.9.0"), 'runtime version missing');
check(html.includes('app.js?v=4.9.0'), 'cache version missing');
check(!app.includes("status: API_BASE_URL ? 'idle'"), 'API_BASE_URL is referenced before initialization');

check(app.includes('function editMealRecord(recordId)'), 'meal record edit missing');
check(app.includes("existing ? 'meal_record_updated' : 'meal_record_created'"), 'record update analytics missing');
check(app.includes('function removePendingMealPhoto()'), 'photo remove missing');
check(app.includes('const maxSide = 1280'), '1280px photo compression missing');
check(app.includes('const targetLength = 520_000'), 'photo target size missing');
check(html.includes('id="recordPhotoRemoveBtn"'), 'photo remove button missing');

check(app.includes('function rememberExplorerSearch(value)'), 'recent search missing');
check(app.includes('function rememberViewedMenu(menuName)'), 'recent viewed missing');
check(app.includes('id="explorerHistorySection"'), 'recent search UI missing');
check(app.includes('최근 본 음식'), 'recent viewed UI missing');

check(app.includes('return [...new Set(reasons)].slice(0, 3)'), 'recommendation reasons are not limited to 3');
check(app.includes('function checkApiHealth(force = false)'), 'API health check missing');
check(app.includes('최근 오류 코드'), 'error code UI missing');
check(app.includes("recordClientError('PHOTO_PROCESS_001'"), 'photo error code missing');
check(app.includes("recordClientError('DATA_MENU_001'"), 'data error code missing');

check(server.includes("monthlyFilename('events'"), 'monthly event files missing');
check(server.includes('seenEventIds.has(eventId)'), 'event deduplication missing');
check(server.includes('seenFeedbackIds.has(id)'), 'feedback deduplication missing');
check(server.includes('DATA_RETENTION_DAYS'), 'retention setting missing');
check(server.includes('cleanupExpiredData'), 'retention cleanup missing');
check(report.includes("readAll('events')"), 'monthly report reader missing');
check(pkg.scripts.backup === 'node server/backup-data.mjs', 'backup command missing');

const ignore = firebase.hosting.ignore || [];
for (const required of ['scripts/**','server/data/**','*.patch','*.txt']) {
  check(ignore.includes(required), `firebase ignore missing: ${required}`);
}
const allHeaders = (firebase.hosting.headers || []).flatMap(rule => rule.headers || []);
for (const required of ['Content-Security-Policy','Strict-Transport-Security','X-Frame-Options']) {
  check(allHeaders.some(h => h.key === required), `security header missing: ${required}`);
}

check(html.includes('서버 데이터 삭제 요청'), 'server deletion request UI missing');
check(html.includes('원칙적으로 90일'), 'retention disclosure missing');
check(html.includes('사진은 최대 1280px로 압축'), 'photo storage disclosure missing');

// Critical recommendation data coverage.
const byName = new Map(menus.map(menu => [menu.name, menu]));
for (const name of ['김치찌개','초밥','라조기','부리또','아침 부리또','볼로네제']) {
  check(byName.has(name), `critical menu missing: ${name}`);
}
check(menus.filter(menu => menu.type === '한식').length >= 50, 'Korean menu coverage below 50');
check(app.includes('if (excluded.some(tag => tags.includes(tag))) return true;'), 'hard exclusion filter missing');
check(app.includes("if (!ans.type && preferredTypes.length && !preferredTypes.includes(m.type)) return false;"), 'strict taste type filter missing');

if (failures.length) {
  console.error('v4.9 release validation failed');
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('v4.9 release validation passed');
console.log(JSON.stringify({ menuCount: menus.length, koreanMenus: menus.filter(menu => menu.type === '한식').length }, null, 2));
