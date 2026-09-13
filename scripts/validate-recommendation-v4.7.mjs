import fs from 'node:fs';

const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const menus = JSON.parse(fs.readFileSync(new URL('../data/menus.json', import.meta.url), 'utf8'));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(/^(?:4\.(?:7|8|9)(?:\.\d+)?|[5-9]\.\d+\.\d+)$/.test(pkg.version), 'package version must be v4.7 or newer');
assert(/const APP_VERSION = 'korea-beta-(?:v4\.(?:7|8|9)(?:\.\d+)?|v[5-9]\.\d+\.\d+)'/.test(app), 'APP_VERSION is not v4.7 or newer');
assert(/app\.js\?v=(?:4\.(?:7|8|9)(?:\.\d+)?|[5-9]\.\d+\.\d+)/.test(index), 'index cache version is not v4.7 or newer');

// 여유폭은 세 구간 모두 +15%로 통일했다 (예전에는 20%/10%/10%로 제각각이었다).
assert(app.includes("10000: { label:'약 1만 원', ceiling:11500"), '1만원 flexible tier missing');
assert(app.includes("30000: { label:'약 3만 원', ceiling:34500"), '3만원 flexible tier missing');
assert(app.includes("50000: { label:'약 5만 원', ceiling:57500"), '5만원 flexible tier missing');

// 퀴즈 선택값은 반드시 BUDGET_TIERS의 키와 같아야 한다.
// 어긋나면 normalizeBudgetTarget이 서로 다른 선택을 같은 구간으로 뭉개 버린다.
const budgetQuestionBlock = app.match(/key:'budget'[\s\S]*?\]\s*\}/);
assert(budgetQuestionBlock, 'quiz budget question not found');
const quizBudgetValues = [...budgetQuestionBlock[0].matchAll(/value:\s*(\d+)/g)].map(m => Number(m[1]));
assert(quizBudgetValues.length === 3, `quiz budget options must be 3 (got ${quizBudgetValues.length})`);
for (const value of quizBudgetValues) {
  assert(
    app.includes(`${value}: { label:`),
    `quiz budget value ${value} has no matching BUDGET_TIERS entry`,
  );
}
assert(/text:'(?:약 )?1만(?: 원|원대)'/.test(app), 'quiz 1만원 option missing');
assert(/text:'(?:약 )?3만(?: 원|원대)'/.test(app), 'quiz 3만원 option missing');
assert(/text:'(?:약 )?5만(?: 원|원대)'/.test(app), 'quiz 5만원 option missing');
assert(!app.includes("text:'7천 원 이하'"), 'old 7천원 quiz option remains');
assert(!app.includes("text:'1만 5천 원 이하'"), 'old 1만5천원 quiz option remains');

assert(app.includes('function marketCuisineBonus(menu, ans = {})'), 'market cuisine bonus missing');
assert(app.includes('function applyMarketFamiliarityFilter(scored, ans = {})'), 'familiarity filter missing');
assert(app.includes('function prioritizeMarketCuisine(scored, ans = {})'), 'market cuisine prioritizer missing');
assert(app.includes('현지 일상식 2개 + 익숙한 타 문화 메뉴 1개'), '2 local + 1 alternative policy missing');
assert(app.includes('score += marketCuisineBonus(m, ans);'), 'market cuisine bonus is not applied');
assert(app.includes('scored = applyMarketFamiliarityFilter(scored, answers);'), 'market familiarity filter is not applied');
assert(app.includes('selectDiverseRecommendationSet(prioritizeMarketCuisine(scored, answers), 3, answers)'), 'market-balanced result selection is not applied');

const groupBy = (items, keyFn) => items.reduce((acc, item) => {
  const key = keyFn(item);
  (acc[key] ||= []).push(item);
  return acc;
}, {});

const byType = groupBy(menus, menu => menu.type || '기타');
const familiar = menu => menu.familiarity !== 'explore';
const koreanFamiliar = (byType['한식'] || []).filter(familiar);
assert(koreanFamiliar.length >= 40, `familiar Korean menu coverage too small: ${koreanFamiliar.length}`);

const modes = {
  집밥: menu => ['간단', '요리'].includes(menu.method),
  외식: menu => menu.method === '외식',
  배달: menu => menu.method === '외식',
};
for (const [mode, predicate] of Object.entries(modes)) {
  const count = koreanFamiliar.filter(predicate).length;
  assert(count >= 8, `${mode} familiar Korean coverage too small: ${count}`);
}

const knownWesternOrWorld = [
  '수제버거', '그릭 샐러드', '크루아상', '치즈버거', '라자냐',
  '페퍼로니 피자', '베트남 쌀국수', '바베큐 립'
];
for (const name of knownWesternOrWorld) {
  const menu = menus.find(item => item.name === name);
  assert(menu, `menu missing: ${name}`);
  assert(menu.familiarity !== 'explore', `well-known menu still marked explore: ${name}`);
}

const counts = Object.fromEntries(
  Object.entries(byType).map(([type, items]) => [type, items.length])
);
const familiarityCounts = Object.fromEntries(
  Object.entries(groupBy(menus, menu => menu.familiarity || 'unset'))
    .map(([key, items]) => [key, items.length])
);

console.log('v4.7 recommendation validation passed');
console.log(JSON.stringify({
  menuCount: menus.length,
  typeCounts: counts,
  familiarityCounts,
  familiarKoreanMenus: koreanFamiliar.length,
  budgetTiers: {
    10000: 11500,
    30000: 34500,
    50000: 57500
  }
}, null, 2));
