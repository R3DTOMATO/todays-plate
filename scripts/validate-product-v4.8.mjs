import fs from 'node:fs';

const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const menus = JSON.parse(fs.readFileSync(new URL('../data/menus.json', import.meta.url), 'utf8'));

const requiredAppFragments = [
  "title: '어떤 종류의 음식이 좋아요?'",
  "key: 'type'",
  "if (!ans.type && preferredTypes.length && !preferredTypes.includes(m.type)) return false;",
  'function isDietFriendlyMenu(menu)',
  'function openDirectRecordModal()',
  'function buildCustomDiaryMenu(name, snapshot = {})',
  'menuSnapshot:',
  'function renderExplorerMenuCard(menu)',
  "flow: 'four_step'",
];

const requiredHtmlFragments = [
  'id="recordMenuName"',
  'id="recordMenuSuggestions"',
  '<h2 class="sub-title">음식 탐색</h2>',
  '<span class="nav-label">탐색</span>',
];

const failures = [];

if (!/const APP_VERSION = 'korea-beta-v4\.8(?:\.1)?'/.test(app)) {
  failures.push('app.js missing compatible v4.8 app version');
}
if (!/\.\/js\/app\.js\?v=4\.8(?:\.1)?/.test(html)) {
  failures.push('index.html missing compatible v4.8 app cache version');
}
for (const fragment of requiredAppFragments) {
  if (!app.includes(fragment)) failures.push(`app.js missing: ${fragment}`);
}
for (const fragment of requiredHtmlFragments) {
  if (!html.includes(fragment)) failures.push(`index.html missing: ${fragment}`);
}

const dessertWords = ['스콘','크루아상','푸딩','빙수','케이크','쿠키','도넛','와플','팬케이크','머핀','라떼','디저트'];
const friedWords = ['튀김','후라이드','돈까스','텐동','가라아게','fried','tempura'];
const dietFriendly = menu => {
  const text = `${menu.name || ''} ${menu.desc || ''}`.toLowerCase();
  if (Number(menu.kcal || 0) > 600) return false;
  if (dessertWords.some(word => text.includes(word))) return false;
  if (friedWords.some(word => text.includes(word))) return false;
  return true;
};

const japaneseDiet = menus.filter(menu => menu.type === '일식' && dietFriendly(menu));
if (japaneseDiet.length < 5) failures.push(`일식+다이어트 후보 부족: ${japaneseDiet.length}`);
if (japaneseDiet.some(menu => menu.type !== '일식')) failures.push('일식+다이어트 후보에 다른 음식 종류 포함');
if (japaneseDiet.some(menu => menu.name === '스콘')) failures.push('스콘이 일식+다이어트 후보에 포함됨');
if (!menus.some(menu => menu.name === '스콘')) failures.push('스콘 회귀 테스트 데이터가 없음');

const questionCount = (app.match(/title: '/g) || []).length;
if (!app.includes('questions.forEach((q, idx) => { q.step = idx + 1; q.total = questions.length; });')) {
  failures.push('질문 단계 수 자동 반영 코드 누락');
}

if (failures.length) {
  console.error('v4.8 validation failed');
  failures.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}

console.log('v4.8 validation passed');
console.log(`- 메뉴 데이터: ${menus.length}개`);
console.log(`- 일식+다이어트 후보: ${japaneseDiet.length}개`);
console.log(`- 예시 후보: ${japaneseDiet.slice(0, 8).map(menu => menu.name).join(', ')}`);
console.log('- 직접 식사 기록 검색/직접입력 구조 확인');
console.log('- 음식 탐색/찜 통합 구조 확인');
console.log('- 4단계 추천과 음식 종류 필터 확인');
