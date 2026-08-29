// ─────────────────────────────────────────────────────────────
// 피드 랭킹 엔진 — 음식 취향 기반 개인화
//
// 설계 원칙 (추천 엔진과 동일)
//  1. 취향에 안 맞는다고 게시물을 숨기지 않는다. 점수로만 정렬한다.
//     숨기면 피드가 금방 마른다.
//  2. 순수 함수. DOM/네트워크를 만지지 않는다 → 테스트·RN 재사용 가능.
//  3. 차단/신고된 게시물만 하드 제외한다 (안전 요건).
// ─────────────────────────────────────────────────────────────

const WEIGHTS = {
  typeAffinity: 30,
  spicyMatch: 20,
  soupMatch: 15,
  weightMatch: 15,
  recency: 40,
  popularity: 10,
  hasPhoto: 12,
  alreadySeen: -30
};

const RECENCY_HALFLIFE_HOURS = 24;
const MIN_HISTORY_FOR_TASTE = 3;   // 이보다 적으면 취향을 신뢰하지 않음
const MAX_SAME_TYPE_STREAK = 3;    // 같은 음식 종류 연속 허용 개수
const MIN_AUTHOR_GAP = 3;          // 같은 작성자가 다시 나오기까지 최소 간격

// ─────────────────────────────────────────────
// 1. 취향 벡터 만들기
// ─────────────────────────────────────────────

/**
 * 식사 기록·찜 이력에서 사용자의 음식 취향을 집계한다.
 * @param {Array} history [{ menu: {type, spicy, soup, weight}, satisfaction }]
 * @returns {Object|null} 이력이 부족하면 null (콜드 스타트)
 */
export function buildTasteVector(history) {
  const valid = (history || []).filter(h => h && h.menu && h.menu.type);
  if (valid.length < MIN_HISTORY_FOR_TASTE) return null;

  const typeCount = {};
  let spicySum = 0, weightSum = 0, soupCount = 0;
  const weightCount = { 가벼움: 0, 중간: 0, 든든: 0 };

  for (const entry of valid) {
    const menu = entry.menu;
    // 만족도가 높은 기록에 더 큰 가중치 (1~5 → 0.5~1.5)
    const w = entry.satisfaction ? 0.5 + (entry.satisfaction / 5) : 1;

    typeCount[menu.type] = (typeCount[menu.type] || 0) + w;
    spicySum += (menu.spicy ?? 0) * w;
    if (menu.soup) soupCount += w;
    if (weightCount[menu.weight] !== undefined) weightCount[menu.weight] += w;
    weightSum += w;
  }

  const typeAffinity = {};
  for (const [type, count] of Object.entries(typeCount)) {
    typeAffinity[type] = count / weightSum;
  }

  const weightPreference = {};
  for (const [key, count] of Object.entries(weightCount)) {
    weightPreference[key] = count / weightSum;
  }

  return {
    typeAffinity,
    spicyPreference: spicySum / weightSum,
    soupPreference: soupCount / weightSum,
    weightPreference,
    sampleSize: valid.length
  };
}

// ─────────────────────────────────────────────
// 2. 게시물 점수
// ─────────────────────────────────────────────

function scorePost(post, taste, context) {
  let score = 0;

  if (taste) {
    // 음식 종류 선호도
    const affinity = taste.typeAffinity[post.menuType] || 0;
    score += WEIGHTS.typeAffinity * affinity;

    // 매운맛 근접도 — 차이가 작을수록 높은 점수
    const spicyGap = Math.abs((post.menuSpicy ?? 0) - taste.spicyPreference);
    score += WEIGHTS.spicyMatch * Math.max(0, 1 - spicyGap / 3);

    // 국물 선호
    const soupAlign = post.menuSoup ? taste.soupPreference : 1 - taste.soupPreference;
    score += WEIGHTS.soupMatch * soupAlign;

    // 무게 선호
    score += WEIGHTS.weightMatch * (taste.weightPreference[post.menuWeight] || 0);
  } else {
    // 콜드 스타트: 취향 정보가 없으면 인기·최신에 더 의존한다
    score += WEIGHTS.popularity * 0.5 * Math.log((post.likeCount || 0) + 1);
  }

  // 최신성 — 지수 감쇠
  const ageHours = (context.now - toMillis(post.createdAt)) / 3_600_000;
  score += WEIGHTS.recency * Math.exp(-Math.max(0, ageHours) / RECENCY_HALFLIFE_HOURS);

  // 인기도 — 로그로 눌러서 과열 방지
  score += WEIGHTS.popularity * Math.log((post.likeCount || 0) + 1);

  // 사진 있는 게시물이 피드 품질을 좌우한다
  if (post.photoUrl) score += WEIGHTS.hasPhoto;

  // 이미 본 게시물
  if (context.seenPostIds.has(post.id)) score += WEIGHTS.alreadySeen;

  return score;
}

function toMillis(value) {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value.toMillis === 'function') return value.toMillis();  // Firestore Timestamp
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  return new Date(value).getTime();
}

// ─────────────────────────────────────────────
// 3. 하드 제외 — 안전 요건만
// ─────────────────────────────────────────────

function isVisible(post, options) {
  if (post.status && post.status !== 'visible') return false;
  if (options.blockedUids.has(post.authorUid)) return false;
  // 신고 누적 게시물은 검토 전까지 노출하지 않는다
  if ((post.reportCount || 0) >= 3) return false;
  return true;
}

// ─────────────────────────────────────────────
// 4. 메인 진입점
// ─────────────────────────────────────────────

/**
 * @param {Array}  posts   후보 게시물
 * @param {Object} options
 *   @param {Array}  options.history      사용자 식사 기록 (취향 집계용)
 *   @param {string[]} options.blockedUids 차단한 사용자
 *   @param {string[]} options.seenPostIds 이미 본 게시물
 *   @param {number} options.now          현재 시각(ms). 테스트 위해 주입 가능
 * @param {number} limit
 * @returns {{posts: Array, tasteUsed: boolean}}
 */
export function rankFeed(posts, options = {}, limit = 20) {
  const context = {
    now: options.now ?? Date.now(),
    seenPostIds: new Set(options.seenPostIds || []),
    blockedUids: new Set(options.blockedUids || [])
  };

  const taste = buildTasteVector(options.history);

  // 1) 안전 필터
  const visible = (posts || []).filter(p => isVisible(p, context));

  // 2) 점수화
  const scored = visible.map(post => ({ post, score: scorePost(post, taste, context) }));
  scored.sort((a, b) => b.score - a.score);

  // 3) 배치 단계에서 다양성 제약을 적용한다.
  //    점수 감점만으로는 취향 점수 차이에 묻혀 도배를 못 막으므로,
  //    "고르는 순간"에 직접 제약을 건다.
  const result = [];
  const pool = scored.slice();
  const authorUsed = {};
  let streakType = null;
  let streak = 0;

  while (pool.length > 0 && result.length < limit) {
    let pickIndex = -1;

    for (let i = 0; i < pool.length; i++) {
      const candidate = pool[i];
      const uid = candidate.post.authorUid;

      // 같은 작성자가 최근 MIN_AUTHOR_GAP개 안에 있으면 건너뛴다
      const lastIndex = result.map(r => r.post.authorUid).lastIndexOf(uid);
      const tooClose = lastIndex >= 0 && (result.length - lastIndex) < MIN_AUTHOR_GAP;
      if (tooClose) continue;

      // 같은 음식 종류가 연속 한도를 넘으면 건너뛴다
      if (streak >= MAX_SAME_TYPE_STREAK && candidate.post.menuType === streakType) continue;

      pickIndex = i;
      break;
    }

    // 제약을 만족하는 후보가 없으면 제약을 풀고 최상위를 넣는다
    // (피드가 비는 것보다 낫다)
    if (pickIndex === -1) pickIndex = 0;

    const [picked] = pool.splice(pickIndex, 1);
    const uid = picked.post.authorUid;
    authorUsed[uid] = (authorUsed[uid] || 0) + 1;

    if (picked.post.menuType === streakType) {
      streak++;
    } else {
      streakType = picked.post.menuType;
      streak = 1;
    }
    result.push(picked);
  }

  return {
    posts: result.map(item => ({ ...item.post, _score: Math.round(item.score * 10) / 10 })),
    tasteUsed: taste !== null
  };
}

export const __internal = { scorePost, buildTasteVector, isVisible, WEIGHTS };
