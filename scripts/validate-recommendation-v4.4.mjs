import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const menus = JSON.parse(fs.readFileSync(path.join(root, 'data', 'menus.json'), 'utf8'));

const breakfastOnly = new Set([
  '아보카도 토스트','오트밀 볼','스크램블 에그','바나나 팬케이크','그래놀라 요거트',
  '프렌치 토스트','베이글 샌드위치','야채 스무디 보울','에그 베네딕트','고구마 라떼',
  '키쉬','아사이볼','에그 샌드위치','아침 머핀','그릴드 치즈','오믈렛','아침 부리또','샥슈카'
]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function score(menu, answers) {
  let value = 62;
  if (answers.contextTime && menu.time === answers.contextTime) value += 10;
  else if (answers.contextTime && menu.time && menu.time !== answers.contextTime) value -= 5;

  if (answers.mode === '집밥') {
    value += 7;
    if (menu.homeSuitability === 'common') value += 11;
    else if (menu.homeSuitability === 'possible') value += 1;
    else if (menu.homeSuitability === 'special') value -= 12;

    const cook = Number(menu.cook || 0);
    if (cook <= 15) value += 6;
    else if (cook <= 30) value += 3;
    else if (cook >= 60) value -= 12;
    else if (cook >= 45) value -= 8;
    else if (cook >= 35) value -= 3;

    if (menu.familiarity === 'common') value += 5;
    else if (menu.familiarity === 'explore') value -= 4;

    if (!answers.type) {
      if (menu.type === '한식') value += 10;
      else if (['일식', '중식'].includes(menu.type)) value += 4;
      else if (menu.type === '세계음식') value -= 4;
    }
  }

  if (answers.need === 'light' && menu.weight === '가벼움') value += 14;
  if (answers.need === 'full' && menu.weight === '든든') value += 14;
  if (answers.need === 'hangover' && menu.soup && menu.spicy <= 1) value += 9;
  if (answers.need === 'spicy' && menu.spicy >= 1) value += 14;
  if (Number.isFinite(Number(answers.budget)) && menu.price <= Number(answers.budget)) value += 5;
  return value;
}

function eligible(menu, answers, excludedFamilies = new Set()) {
  if (!['간단', '요리'].includes(menu.method)) return false;
  if (excludedFamilies.has(menu.family)) return false;
  if (!answers.time && answers.contextTime && answers.contextTime !== '아침' && breakfastOnly.has(menu.name)) return false;
  if (Number.isFinite(Number(answers.budget)) && menu.price > Number(answers.budget)) return false;
  return true;
}

function diverseTop(scored, limit = 3) {
  if (!scored.length) return [];
  const selected = [scored[0]];
  const families = new Set([scored[0].menu.family]);
  const types = new Set([scored[0].menu.type]);
  const topScore = scored[0].score;
  const crossCuisine = scored.slice(1).find(item => !families.has(item.menu.family) && !types.has(item.menu.type) && topScore - item.score <= 8);
  if (crossCuisine) {
    selected.push(crossCuisine);
    families.add(crossCuisine.menu.family);
    types.add(crossCuisine.menu.type);
  }
  for (const item of scored.slice(1)) {
    if (selected.length >= limit) break;
    if (selected.includes(item) || families.has(item.menu.family)) continue;
    selected.push(item);
    families.add(item.menu.family);
  }
  return selected;
}

assert(menus.length >= 190, `메뉴 수가 비정상적으로 적습니다: ${menus.length}`);
for (const menu of menus) {
  assert(menu.family, `${menu.name}: family 누락`);
  assert(['common', 'possible', 'special', 'outside'].includes(menu.homeSuitability), `${menu.name}: homeSuitability 오류`);
  assert(['common', 'familiar', 'explore'].includes(menu.familiarity), `${menu.name}: familiarity 오류`);
}

const byName = new Map(menus.map(menu => [menu.name, menu]));
assert(byName.get('부리또')?.family === byName.get('아침 부리또')?.family, '부리또 계열이 분리되어 있습니다.');
assert(byName.get('볼로네제')?.family === byName.get('라구 파스타')?.family, '라구 파스타 계열이 분리되어 있습니다.');
assert(byName.get('볼로네제')?.homeSuitability === 'special', '볼로네제가 일반 집밥 후보로 분류되었습니다.');
assert(byName.get('라구 파스타')?.homeSuitability === 'special', '라구 파스타가 일반 집밥 후보로 분류되었습니다.');

const scenarios = [];
for (const contextTime of ['아침', '점심', '저녁', '야식']) {
  for (const need of ['light', 'full', 'hangover', 'spicy']) {
    const answers = { contextTime, mode: '집밥', need, budget: 15000 };
    const scored = menus
      .filter(menu => eligible(menu, answers))
      .map(menu => ({ menu, score: score(menu, answers) }))
      .sort((a, b) => b.score - a.score || a.menu.name.localeCompare(b.menu.name, 'ko'));
    const top = diverseTop(scored);
    assert(top.length === 3, `${contextTime}/${need}: 추천 후보 3개 미만`);
    assert(new Set(top.map(item => item.menu.family)).size === top.length, `${contextTime}/${need}: 같은 메뉴 계열 중복`);
    if (contextTime !== '아침') {
      assert(top.every(item => !breakfastOnly.has(item.menu.name)), `${contextTime}/${need}: 아침 전용 메뉴 노출`);
    }
    assert(top[0].menu.type === '한식', `${contextTime}/${need}: 대표 집밥이 한식 우선이 아님 (${top[0].menu.name})`);
    if (need === 'spicy') assert(top[0].menu.spicy >= 1, `${contextTime}/${need}: 매콤한 대표 메뉴가 아님`);
    if (need === 'hangover') assert(top[0].menu.soup, `${contextTime}/${need}: 국물 대표 메뉴가 아님`);
    if (need === 'full') assert(top[0].menu.weight === '든든', `${contextTime}/${need}: 든든한 대표 메뉴가 아님`);
    if (need === 'light') assert(top[0].menu.weight === '가벼움', `${contextTime}/${need}: 가벼운 대표 메뉴가 아님`);
    scenarios.push({ contextTime, need, top: top.map(item => item.menu.name) });
  }
}

const dinner = { contextTime: '저녁', mode: '집밥', need: 'full', budget: 15000 };
const excludedBurrito = new Set([byName.get('부리또').family]);
const afterBurritoReject = menus.filter(menu => eligible(menu, dinner, excludedBurrito));
assert(afterBurritoReject.every(menu => !['부리또', '아침 부리또'].includes(menu.name)), '부리또 리롤 후 같은 계열이 남아 있습니다.');

console.log(JSON.stringify({
  ok: true,
  menuCount: menus.length,
  familyCount: new Set(menus.map(menu => menu.family)).size,
  homeCommonCount: menus.filter(menu => menu.homeSuitability === 'common').length,
  scenarios
}, null, 2));
