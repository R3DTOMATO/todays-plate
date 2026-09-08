// ─────────────────────────────────────────────────────────────
// 추천 엔진 v6 — 점수제
//
// 설계 원칙
//  1. 하드 필터는 "먹을 수 없는 것"에만 적용한다 (알레르기, 조리 불가, 배달 불가).
//     취향·예산은 절대 제외하지 않고 점수로만 반영한다 → 결과 0개가 나오지 않는다.
//  2. DOM을 만지지 않는 순수 함수다. 같은 입력이면 같은 출력(seed 고정 시).
//     → 웹/React Native 양쪽에서 그대로 재사용 가능, 테스트 가능.
//  3. 왜 추천됐는지 사람이 읽을 수 있는 이유(reasons)를 함께 반환한다.
// ─────────────────────────────────────────────────────────────

// ─── 배점표 ───
// 합이 아니라 상대적 크기가 중요하다. 예산 초과 감점이 취향 가점보다 크게 설계했다.
const WEIGHTS = {
  typeMatch: 30,        // 원하는 음식 종류와 일치
  typeNeighbor: 8,      // 인접 카테고리 (예: 중식 원했는데 일식)
  moodMatch: 20,        // 맛/무게 취향 1개 일치당
  budgetFit: 25,        // 예산 이내
  budgetOverSoft: -15,  // 예산 20% 이내 초과
  budgetOverHard: -40,  // 예산 20% 초과
  timeMatch: 12,        // 지금 시간대에 맞는 메뉴
  situationMatch: 15,   // 상황(혼밥/회식 등) 적합
  familiarBonus: 6,     // 익숙한 메뉴 (탐색 성향 낮을 때)
  exploreBonus: 10,     // 낯선 메뉴 (탐색 성향 높을 때)
  recentPenalty: -50,   // 최근 먹음
  sameFamilyPenalty: -30, // 최근 먹은 것과 같은 계열
  rejectedPenalty: -25  // 과거에 거절한 메뉴
};

// 인접 카테고리 — 완전 불일치보다는 낫다고 보는 관계
const TYPE_NEIGHBORS = {
  한식: ['중식','일식'],
  중식: ['한식', '일식'],
  일식: ['중식', '한식'],
  양식: ['세계음식'],
  세계음식: ['양식', '중식']
};

// 상황별 선호 — 하드 필터가 아니라 가점 조건
const SITUATION_RULES = {
  혼밥:   { maxPrice: 15000, prefer: m => m.method !== '외식' || m.price <= 12000 },
  친구:   { prefer: m => m.weight !== '가벼움' },
  데이트: { prefer: m => m.type !== '중식' && m.price >= 10000 },
  가족:   { prefer: m => m.spicy <= 1 && m.weight === '든든' },
  회식:   { prefer: m => m.weight === '든든' && m.price >= 10000 },
  야식:   { prefer: m => m.time === '저녁' && m.weight !== '든든' }
};

// ─── 하드 필터 ───
// 여기 걸리면 후보에서 완전히 빠진다. "먹을 수 없는 경우"만 넣는다.

function passesHardFilters(menu, input) {
  // 1) 알레르기·식단 제한 — 안전 문제이므로 절대 완화하지 않는다
  const avoid = input.avoidIngredients || [];
  if (avoid.length > 0) {
    const haystack = `${menu.name} ${menu.desc || ''} ${(menu.ingredients || []).join(' ')}`;
    if (avoid.some(word => word && haystack.includes(word))) return false;
  }

  // 2) 차단한 메뉴
  if ((input.bannedMenus || []).includes(menu.name)) return false;

  // 3) 식사 방식 — 물리적으로 불가능한 조합만 제외
  if (input.diningMode === '집밥') {
    // 집에서 만들 수 없는 메뉴 제외
    if (menu.homeSuitability === 'outside') return false;
  } else if (input.diningMode === '배달') {
    if (menu.delivery === 'no') return false;
  }
  // '외식'은 모든 메뉴가 가능하므로 필터 없음

  return true;
}

// ─── 점수 계산 ───

function scoreMenu(menu, input) {
  let score = 0;
  const reasons = [];

  // 음식 종류
  if (input.types && input.types.length > 0) {
    if (input.types.includes(menu.type)) {
      score += WEIGHTS.typeMatch;
      reasons.push(`${menu.type}`);
    } else if (input.types.some(t => (TYPE_NEIGHBORS[t] || []).includes(menu.type))) {
      score += WEIGHTS.typeNeighbor;
    }
  }

  // 맛/무게 취향 (복수 선택 가능)
  const moods = input.moods || [];
  if (moods.includes('매콤') && menu.spicy >= 2) {
    score += WEIGHTS.moodMatch; reasons.push('매콤함');
  }
  if (moods.includes('순함') && menu.spicy === 0) {
    score += WEIGHTS.moodMatch; reasons.push('안 매움');
  }
  if (moods.includes('국물') && menu.soup) {
    score += WEIGHTS.moodMatch; reasons.push('국물');
  }
  if (moods.includes('가벼움') && menu.weight === '가벼움') {
    score += WEIGHTS.moodMatch; reasons.push('가벼움');
  }
  if (moods.includes('든든') && menu.weight === '든든') {
    score += WEIGHTS.moodMatch; reasons.push('든든함');
  }

  // 예산 — 초과해도 제외하지 않고 감점만 한다
  if (typeof input.budget === 'number' && input.budget > 0) {
    if (menu.price <= input.budget) {
      score += WEIGHTS.budgetFit;
    } else if (menu.price <= input.budget * 1.2) {
      score += WEIGHTS.budgetOverSoft;
      reasons.push('예산 살짝 초과');
    } else {
      score += WEIGHTS.budgetOverHard;
    }
  }

  // 시간대
  if (input.mealTime && menu.time === input.mealTime) {
    score += WEIGHTS.timeMatch;
  }

  // 상황
  const rule = SITUATION_RULES[input.situation];
  if (rule) {
    if (rule.maxPrice && menu.price > rule.maxPrice) score -= 10;
    if (rule.prefer && rule.prefer(menu)) {
      score += WEIGHTS.situationMatch;
    }
  }

  // 탐색 성향
  if (input.exploreMode) {
    if (menu.familiarity === 'explore') { score += WEIGHTS.exploreBonus; reasons.push('새로운 메뉴'); }
  } else {
    if (menu.familiarity === 'familiar') score += WEIGHTS.familiarBonus;
  }

  // 최근 식사 반복 방지
  const recent = input.recentMeals || [];
  if (recent.some(r => r.name === menu.name)) {
    score += WEIGHTS.recentPenalty;
  } else if (menu.family && recent.some(r => r.family === menu.family)) {
    score += WEIGHTS.sameFamilyPenalty;
  }

  // 과거 거절 이력
  const stats = (input.menuStats || {})[menu.name];
  if (stats) {
    if (stats.rejected > 0) score += WEIGHTS.rejectedPenalty * Math.min(stats.rejected, 3);
    if (stats.chosen > 0) score += 8 * Math.min(stats.chosen, 3);
  }

  return { score, reasons };
}

// ─── 결정론적 셔플 (동점 처리용) ───
// Math.random을 쓰면 테스트가 불가능하므로 seed 기반으로 흔든다.

function seededJitter(seed, key) {
  let hash = 0;
  const str = `${seed}:${key}`;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return (Math.abs(hash) % 1000) / 1000; // 0~1
}

// ─── 메인 진입점 ───

/**
 * @param {Array}  menus  전체 메뉴 배열 (data/menus.json)
 * @param {Object} input
 *   @param {string}   input.situation        '혼밥'|'친구'|'데이트'|'가족'|'회식'|'야식'
 *   @param {string[]} input.types            ['한식','중식'] — 빈 배열이면 상관없음
 *   @param {string[]} input.moods            ['매콤','국물','가벼움','든든','순함']
 *   @param {number}   input.budget           1인 예산(원). 0/null이면 무관
 *   @param {string}   input.diningMode       '집밥'|'외식'|'배달'
 *   @param {string}   input.mealTime         '아침'|'점심'|'저녁'
 *   @param {string[]} input.avoidIngredients 알레르기·제외 재료
 *   @param {string[]} input.bannedMenus
 *   @param {Array}    input.recentMeals      [{name, family}]
 *   @param {Object}   input.menuStats        { [menuName]: {chosen, rejected} }
 *   @param {boolean}  input.exploreMode
 *   @param {string}   input.seed             동점 처리용 (같으면 같은 결과)
 * @param {number} count 추천 개수 (기본 3)
 * @returns {{results: Array, fallbackUsed: boolean, candidateCount: number}}
 */
export function recommendMenus(menus, input, count = 3) {
  const seed = input.seed || 'default';

  // 1) 하드 필터
  let candidates = menus.filter(menu => passesHardFilters(menu, input));
  let fallbackUsed = false;

  // 2) 후보가 너무 적으면 식사 방식 제약만 완화한다.
  //    알레르기·차단 메뉴는 절대 완화하지 않는다.
  if (candidates.length < count) {
    fallbackUsed = true;
    const relaxed = { ...input, diningMode: null };
    candidates = menus.filter(menu => passesHardFilters(menu, relaxed));
  }

  // 3) 점수화
  const scored = candidates.map(menu => {
    const { score, reasons } = scoreMenu(menu, input);
    return {
      menu,
      score: score + seededJitter(seed, menu.id || menu.name) * 3, // 동점 흔들기
      reasons
    };
  });

  // 4) 정렬 후 상위 N개, 단 같은 family가 중복되지 않게
  scored.sort((a, b) => b.score - a.score);

  const results = [];
  const usedFamilies = new Set();
  for (const item of scored) {
    const family = item.menu.family || item.menu.name;
    if (usedFamilies.has(family)) continue;
    usedFamilies.add(family);
    results.push(item);
    if (results.length >= count) break;
  }

  // family 중복 제거로 부족해지면 그냥 점수순으로 채운다
  if (results.length < count) {
    for (const item of scored) {
      if (results.includes(item)) continue;
      results.push(item);
      if (results.length >= count) break;
    }
  }

  return {
    results: results.map(r => ({
      ...r.menu,
      _score: Math.round(r.score),
      _reasons: r.reasons
    })),
    fallbackUsed,
    candidateCount: candidates.length
  };
}

/**
 * 추천 이유를 한 문장으로 만든다.
 * 예: "매콤하고 국물 있는 한식이에요"
 */
export function explainRecommendation(menu) {
  const reasons = menu._reasons || [];
  if (reasons.length === 0) return menu.desc || '';
  if (reasons.includes('예산 살짝 초과')) {
    const others = reasons.filter(r => r !== '예산 살짝 초과');
    return others.length
      ? `예산을 조금 넘지만 ${others.join(', ')} 조건에 잘 맞아요`
      : '예산을 조금 넘지만 지금 상황에 잘 맞아요';
  }
  return `${reasons.join(', ')} 조건에 맞아요`;
}

export const __internal = { scoreMenu, passesHardFilters, WEIGHTS };


//사람들이 음식을 결정할 때는 날씨도 중요하다!
// 날씨 api를 가져와서 날씨에 따라 점수도 하지만 이거는 나중에 추가 할일
