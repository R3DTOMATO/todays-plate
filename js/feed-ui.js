// ─────────────────────────────────────────────────────────────
// 피드 화면
//
// 카드 구조
//   [음식 카테고리 / 식당 정보]
//   [사진]
//   [메뉴에 대한 이야기]
//   [좋아요 · 댓글 · 저장]
//
// 검색
//   메뉴 이름으로 검색하면 메뉴 정보가 먼저 뜨고,
//   그 아래에 그 메뉴를 먹은 사람들의 피드가 붙는다.
// ─────────────────────────────────────────────────────────────

import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getFirestore, doc, collection, getDocs, runTransaction, increment
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { FIREBASE_READY, getCurrentUser, requireAuth, onAuthChange } from './auth.js';
import {
  fetchRecentPosts, searchPostsByMenu,
  fetchComments, addComment, deleteComment, countComments,
  toggleSavePost, fetchSavedPostIds
} from './feed-posts.js';
import { rankFeed } from './feed-ranking.js';
import { submitReport, blockUser, fetchBlockedUids, REPORT_REASONS } from './feed-safety.js';

let db = null;
if (FIREBASE_READY) {
  const app = getApps().length ? getApps()[0] : initializeApp(window.FIREBASE_CONFIG);
  db = getFirestore(app);
}

// ─── 상태 ───
let feedPosts = [];
let myLikes = new Set();
let mySaves = new Set();
let blockedUids = new Set();
const commentCounts = new Map();
const openComments = new Map();    // postId → 댓글 배열 (null이면 로딩 중)
let loading = false;
let loadedOnce = false;
let searchTerm = '';
let searchMenus = [];
let searchPosts = [];
let searching = false;

function el(id) { return document.getElementById(id); }

function toast(message) {
  if (typeof window.showToast === 'function') window.showToast(message);
  else console.log(message);
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

function toMillis(value) {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  return new Date(value).getTime();
}

function timeAgo(value) {
  const ms = toMillis(value);
  if (!ms) return '';
  const diff = Date.now() - ms;
  const minute = 60_000, hour = 3_600_000, day = 86_400_000;
  if (diff < minute) return '방금';
  if (diff < hour) return `${Math.floor(diff / minute)}분 전`;
  if (diff < day) return `${Math.floor(diff / hour)}시간 전`;
  if (diff < day * 7) return `${Math.floor(diff / day)}일 전`;
  return new Date(ms).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
}

function getTasteHistory() {
  if (typeof window.getDiaryForTaste === 'function') {
    try { return window.getDiaryForTaste(); } catch (_) { return []; }
  }
  return [];
}

// ─── 데이터 로드 ───

async function loadFeed({ force = false } = {}) {
  if (!FIREBASE_READY || loading) return;
  if (loadedOnce && !force) return;

  loading = true;
  render();

  try {
    feedPosts = await fetchRecentPosts(60);
    blockedUids = await fetchBlockedUids();
    await Promise.all([
      loadMyLikes(feedPosts),
      loadMySaves(),
      loadCommentCounts(feedPosts)
    ]);
    loadedOnce = true;
  } catch (error) {
    console.error('[feed] 불러오기 실패:', error);
    feedPosts = [];
  } finally {
    loading = false;
    render();
  }
}

// 게시물마다 순차 조회하면 요청이 길게 늘어지므로 한 번에 병렬로 가져온다
async function loadMyLikes(posts) {
  const user = getCurrentUser();
  if (!user || posts.length === 0) return;
  const results = await Promise.all(posts.map(post =>
    getDocs(collection(db, 'posts', post.id, 'likes'))
      .then(snap => ({ id: post.id, uids: snap.docs.map(d => d.id) }))
      .catch(() => null)
  ));
  results.forEach(item => {
    if (item && item.uids.includes(user.uid)) myLikes.add(item.id);
  });
}

async function loadMySaves() {
  mySaves = await fetchSavedPostIds();
}

async function loadCommentCounts(posts) {
  // 보안 규칙상 댓글은 로그인 사용자만 읽을 수 있다.
  // 비로그인 상태에서 호출하면 게시물 수만큼 권한 오류가 쌓인다.
  if (!getCurrentUser() || posts.length === 0) return;
  const results = await Promise.all(posts.map(post =>
    countComments(post.id).then(n => [post.id, n]).catch(() => [post.id, 0])
  ));
  results.forEach(([id, n]) => commentCounts.set(id, n));
}

// ─── 검색 ───

async function runSearch(term) {
  searchTerm = String(term || '').trim();

  if (!searchTerm) {
    searchMenus = [];
    searchPosts = [];
    render();
    return;
  }

  searching = true;

  // 메뉴는 로컬 데이터라 즉시 나온다 — 검색 결과 상단을 먼저 채운다
  searchMenus = typeof window.searchMenusByName === 'function'
    ? window.searchMenusByName(searchTerm, 5)
    : [];
  render();

  try {
    const found = await searchPostsByMenu(searchTerm, 20);
    // 차단한 사용자의 게시물은 검색 결과에서도 빼야 한다
    searchPosts = found.filter(p => !blockedUids.has(p.authorUid));
    await Promise.all([loadMyLikes(searchPosts), loadCommentCounts(searchPosts)]);
  } catch (error) {
    console.error('[feed] 검색 실패:', error);
    searchPosts = [];
  } finally {
    searching = false;
    render();
  }
}

// ─── 좋아요 ───

async function toggleLike(postId) {
  let user;
  try {
    user = await requireAuth('좋아요를 누르려면 로그인이 필요해요');
    if (!user) return;
  } catch (error) { toast(error.message); return; }

  const liked = myLikes.has(postId);
  applyLikeLocally(postId, !liked);   // 낙관적 갱신

  try {
    const postRef = doc(db, 'posts', postId);
    const likeRef = doc(db, 'posts', postId, 'likes', user.uid);
    // 좋아요 문서와 집계값을 한 트랜잭션으로 묶는다.
    // 따로 쓰면 한쪽만 성공했을 때 숫자가 어긋난다.
    await runTransaction(db, async tx => {
      const snap = await tx.get(likeRef);
      if (snap.exists()) {
        tx.delete(likeRef);
        tx.update(postRef, { likeCount: increment(-1) });
      } else {
        // uid를 필드로도 남긴다. 문서 ID만으로는 컬렉션 그룹 쿼리로
        // "이 사용자의 좋아요 전부"를 찾을 수 없어 탈퇴 처리가 불가능해진다.
        tx.set(likeRef, { uid: user.uid, createdAt: new Date() });
        tx.update(postRef, { likeCount: increment(1) });
      }
    });
  } catch (error) {
    console.error('[feed] 좋아요 실패:', error);
    applyLikeLocally(postId, liked);   // 되돌리기
    toast('좋아요를 반영하지 못했어요.');
  }
}

function findPost(postId) {
  return feedPosts.find(p => p.id === postId) || searchPosts.find(p => p.id === postId);
}

function applyLikeLocally(postId, liked) {
  const post = findPost(postId);
  if (post) post.likeCount = Math.max(0, (post.likeCount || 0) + (liked ? 1 : -1));
  if (liked) myLikes.add(postId); else myLikes.delete(postId);
  render();
}

// ─── 저장 ───

async function toggleSave(postId) {
  const post = findPost(postId);
  if (!post) return;

  const wasSaved = mySaves.has(postId);
  if (wasSaved) mySaves.delete(postId); else mySaves.add(postId);
  render();

  const result = await toggleSavePost(post);
  if (!result.ok) {
    if (wasSaved) mySaves.add(postId); else mySaves.delete(postId);
    render();
    if (result.error) toast(result.error);
    return;
  }
  toast(result.saved ? '저장했어요.' : '저장을 취소했어요.');
}

// ─── 댓글 ───

async function toggleComments(postId) {
  if (openComments.has(postId)) {
    openComments.delete(postId);
    render();
    return;
  }
  openComments.set(postId, null);   // 로딩 표시
  render();
  await refreshComments(postId);
}

async function refreshComments(postId) {
  const list = await fetchComments(postId);
  openComments.set(postId, list);
  commentCounts.set(postId, list.length);
  render();
}

async function submitComment(postId) {
  const input = document.querySelector(`[data-comment-input="${postId}"]`);
  if (!input) return;

  const result = await addComment(postId, input.value);
  if (!result.ok) {
    if (result.error) toast(result.error);
    return;
  }
  input.value = '';
  await refreshComments(postId);
}

async function removeComment(postId, commentId) {
  const ok = await deleteComment(postId, commentId);
  if (!ok) { toast('댓글을 지우지 못했어요.'); return; }
  await refreshComments(postId);
}

// ─── 렌더링 ───

function render() {
  const container = el('feedContent');
  if (!container) return;

  if (!FIREBASE_READY) {
    container.innerHTML = emptyState('피드를 준비하고 있어요', '조금만 기다려 주세요.');
    return;
  }

  container.innerHTML = searchTerm ? searchHtml() : feedHtml();
  bindEvents(container);
}

function feedHtml() {
  if (loading && feedPosts.length === 0) return loadingHtml('피드를 불러오고 있어요');

  const ranked = rankFeed(feedPosts, {
    history: getTasteHistory(),
    blockedUids: Array.from(blockedUids),
    seenPostIds: [],
    now: Date.now()
  }, 30);

  if (ranked.posts.length === 0) {
    // 게시물 읽기에도 로그인이 필요하므로, 비로그인은 다른 안내를 보여준다.
    // 그냥 "기록이 없어요"라고 하면 고장으로 오해한다.
    if (!getCurrentUser()) {
      return emptyState(
        '로그인하면 피드를 볼 수 있어요',
        '메뉴 추천과 검색, 식사 기록은 로그인 없이도 계속 쓸 수 있어요.'
      );
    }
    return emptyState(
      '아직 올라온 기록이 없어요',
      '식사 기록에서 <strong>피드에 공개</strong>를 켜면 첫 게시물이 됩니다.'
    );
  }

  const hint = ranked.tasteUsed
    ? '내 입맛에 맞춰 정렬했어요'
    : '기록이 쌓이면 취향에 맞게 정렬해 드려요';

  return `<p class="feed-hint">${hint}</p>
    <div class="feed-list">${ranked.posts.map(cardHtml).join('')}</div>`;
}

function searchHtml() {
  const parts = [];

  // 1) 메뉴가 먼저
  if (searchMenus.length > 0) {
    parts.push(`
      <div class="feed-section">
        <h3 class="feed-section-title">메뉴</h3>
        <div class="feed-menu-results">${searchMenus.map(menuRowHtml).join('')}</div>
      </div>`);
  }

  // 2) 그다음 사람들의 기록
  if (searching) {
    parts.push(loadingHtml('관련 기록을 찾고 있어요'));
  } else if (searchPosts.length > 0) {
    parts.push(`
      <div class="feed-section">
        <h3 class="feed-section-title">사람들의 기록</h3>
        <div class="feed-list">${searchPosts.map(cardHtml).join('')}</div>
      </div>`);
  } else if (searchMenus.length > 0) {
    parts.push('<p class="feed-hint">아직 이 메뉴를 공개한 기록이 없어요.</p>');
  }

  if (parts.length === 0) {
    return emptyState('검색 결과가 없어요',
      `"${escapeHtml(searchTerm)}"와(과) 일치하는 메뉴나 기록을 찾지 못했어요.`);
  }
  return parts.join('');
}

function menuRowHtml(menu) {
  return `
    <button type="button" class="feed-menu-row" data-menu="${escapeHtml(menu.name)}">
      <span class="feed-menu-emoji" aria-hidden="true">${escapeHtml(menu.emoji || '🍽️')}</span>
      <span class="feed-menu-info">
        <strong>${escapeHtml(menu.name)}</strong>
        <small>${escapeHtml(menu.type || '')} · ${Number(menu.price || 0).toLocaleString()}원</small>
      </span>
    </button>`;
}

function cardHtml(post) {
  const liked = myLikes.has(post.id);
  const saved = mySaves.has(post.id);
  const commentN = commentCounts.get(post.id) ?? 0;
  const commentsOpen = openComments.has(post.id);

  // 상단 — 음식 카테고리 또는 식당 정보
  const place = post.placeName
    ? `<span class="feed-card-place">${escapeHtml(post.placeName)}</span>`
    : `<span class="feed-card-tag">${escapeHtml(post.diningMode || '')}</span>`;

  const photo = post.photoUrl
    ? `<div class="feed-card-photo"><img src="${escapeHtml(post.photoUrl)}"
         alt="${escapeHtml(post.menuName)} 사진" loading="lazy"></div>`
    : '';

  const stars = post.satisfaction
    ? `<div class="feed-card-stars" aria-label="만족도 ${post.satisfaction}점">${'★'.repeat(Math.min(5, post.satisfaction))}</div>`
    : '';

  const story = post.memo
    ? `<p class="feed-card-memo">${escapeHtml(post.memo)}</p>`
    : '<p class="feed-card-memo muted">남긴 이야기가 없어요.</p>';

  return `
    <article class="feed-card">
      <header class="feed-card-head">
        <div class="feed-card-topic">
          <strong>${escapeHtml(post.menuName)}</strong>
          <span class="feed-card-meta">
            <span class="feed-card-tag">${escapeHtml(post.menuType)}</span>
            ${place}
          </span>
        </div>
        <div class="feed-card-author">
          <span>${escapeHtml(post.authorName || '식탁친구')}</span>
          <small>${timeAgo(post.createdAt)}</small>
        </div>
        ${isMine(post) ? '' : `<button type="button" class="feed-more-btn"
          data-more="${escapeHtml(post.id)}" aria-label="신고 또는 차단">⋯</button>`}
      </header>

      ${photo}

      <div class="feed-card-body">
        ${stars}
        ${story}
      </div>

      <footer class="feed-card-foot">
        <button type="button" class="feed-act${liked ? ' on' : ''}"
                data-like="${escapeHtml(post.id)}" aria-pressed="${liked}">
          <span aria-hidden="true">${liked ? '♥' : '♡'}</span><span>${post.likeCount || 0}</span>
        </button>
        <button type="button" class="feed-act${commentsOpen ? ' on' : ''}"
                data-comments="${escapeHtml(post.id)}" aria-expanded="${commentsOpen}">
          <span aria-hidden="true">💬</span><span>${commentN}</span>
        </button>
        <button type="button" class="feed-act${saved ? ' on' : ''}"
                data-save="${escapeHtml(post.id)}" aria-pressed="${saved}">
          <span aria-hidden="true">${saved ? '🔖' : '📑'}</span><span>저장</span>
        </button>
      </footer>

      ${commentsOpen ? commentsHtml(post.id) : ''}
    </article>`;
}

function commentsHtml(postId) {
  const list = openComments.get(postId);
  const user = getCurrentUser();

  if (list === null) {
    return '<div class="feed-comments"><p class="feed-comment-empty">댓글을 불러오고 있어요…</p></div>';
  }

  const items = list.length === 0
    ? '<p class="feed-comment-empty">첫 댓글을 남겨 보세요.</p>'
    : list.map(c => `
        <div class="feed-comment">
          <strong>${escapeHtml(c.authorName || '식탁친구')}</strong>
          <p>${escapeHtml(c.text)}</p>
          ${user && c.authorUid === user.uid
            ? `<button type="button" class="feed-comment-del"
                 data-del-comment="${escapeHtml(postId)}|${escapeHtml(c.id)}">삭제</button>`
            : `<button type="button" class="feed-comment-del"
                 data-report-comment="${escapeHtml(postId)}|${escapeHtml(c.id)}">신고</button>`}
        </div>`).join('');

  return `
    <div class="feed-comments">
      ${items}
      <div class="feed-comment-form">
        <input type="text" maxlength="300" placeholder="댓글 남기기"
               data-comment-input="${escapeHtml(postId)}">
        <button type="button" data-comment-submit="${escapeHtml(postId)}">등록</button>
      </div>
    </div>`;
}

function loadingHtml(title) {
  return `
    <div class="explorer-loading-shell" role="status" aria-live="polite">
      <div class="explorer-loading-title">${title}</div>
      <div class="explorer-loading-bar"></div>
      <div class="explorer-loading-bar short"></div>
    </div>`;
}

function emptyState(title, body) {
  return `<div class="feed-empty">
      <div class="feed-empty-title">${title}</div>
      <p class="feed-empty-body">${body}</p>
    </div>`;
}


// ─── 신고 · 차단 ───

function isMine(post) {
  const user = getCurrentUser();
  return Boolean(user && post.authorUid === user.uid);
}

// 신고 대상: {type, id, authorUid, authorName}
let reportTarget = null;

function openMoreSheet(postId) {
  const post = findPost(postId);
  if (!post) return;
  reportTarget = {
    type: 'post', id: post.id,
    authorUid: post.authorUid, authorName: post.authorName
  };
  showSheet(post.authorName || '이 사용자');
}

function openCommentReport(postId, commentId) {
  // 상위 게시물 ID를 함께 남겨야 관리자 도구가 원문을 바로 찾을 수 있다
  reportTarget = { type: 'comment', id: commentId, parentId: postId, authorUid: null, authorName: null };
  showSheet(null, { blockable: false });
}

function showSheet(authorName, options = {}) {
  const sheet = el('feedSafetySheet');
  if (!sheet) return;

  const blockRow = el('feedBlockRow');
  if (blockRow) blockRow.hidden = options.blockable === false;

  const blockLabel = el('feedBlockLabel');
  if (blockLabel && authorName) blockLabel.textContent = `${authorName} 차단하기`;

  el('feedReasonList').innerHTML = REPORT_REASONS.map(r =>
    `<button type="button" class="feed-reason-btn" data-reason="${r.id}">${r.label}</button>`
  ).join('');

  el('feedReasonList').querySelectorAll('[data-reason]').forEach(b =>
    b.addEventListener('click', () => doReport(b.dataset.reason)));

  sheet.classList.add('show');
  sheet.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
}

function closeSheet() {
  const sheet = el('feedSafetySheet');
  if (!sheet) return;
  sheet.classList.remove('show');
  sheet.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
  reportTarget = null;
}

async function doReport(reason) {
  if (!reportTarget) return;
  const target = reportTarget;
  closeSheet();

  const result = await submitReport(target.type, target.id, reason, '', target.parentId || '');
  if (result.ok) {
    toast('신고를 접수했어요. 검토 후 조치할게요.');
  } else if (result.error) {
    toast(result.error);
  }
}

async function doBlock() {
  if (!reportTarget || !reportTarget.authorUid) return;
  const target = reportTarget;
  closeSheet();

  const result = await blockUser(target.authorUid, target.authorName || '');
  if (!result.ok) {
    if (result.error) toast(result.error);
    return;
  }
  // 차단은 즉시 반영되어야 한다. 서버 처리를 기다리지 않고 화면에서 바로 뺀다.
  blockedUids.add(target.authorUid);
  feedPosts = feedPosts.filter(p => p.authorUid !== target.authorUid);
  searchPosts = searchPosts.filter(p => p.authorUid !== target.authorUid);
  render();
  toast('차단했어요. 이 사용자의 글이 보이지 않아요.');
}

// ─── 이벤트 바인딩 ───

function bindEvents(container) {
  container.querySelectorAll('[data-like]').forEach(b =>
    b.addEventListener('click', () => toggleLike(b.dataset.like)));

  container.querySelectorAll('[data-save]').forEach(b =>
    b.addEventListener('click', () => toggleSave(b.dataset.save)));

  container.querySelectorAll('[data-comments]').forEach(b =>
    b.addEventListener('click', () => toggleComments(b.dataset.comments)));

  container.querySelectorAll('[data-comment-submit]').forEach(b =>
    b.addEventListener('click', () => submitComment(b.dataset.commentSubmit)));

  container.querySelectorAll('[data-comment-input]').forEach(input =>
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') submitComment(input.dataset.commentInput);
    }));

  container.querySelectorAll('[data-more]').forEach(b =>
    b.addEventListener('click', () => openMoreSheet(b.dataset.more)));

  container.querySelectorAll('[data-report-comment]').forEach(b =>
    b.addEventListener('click', () => {
      const [postId, commentId] = b.dataset.reportComment.split('|');
      openCommentReport(postId, commentId);
    }));

  container.querySelectorAll('[data-del-comment]').forEach(b =>
    b.addEventListener('click', () => {
      const [postId, commentId] = b.dataset.delComment.split('|');
      removeComment(postId, commentId);
    }));

  // 검색 결과의 메뉴를 누르면 기존 음식 상세로 연결한다
  container.querySelectorAll('[data-menu]').forEach(b =>
    b.addEventListener('click', () => {
      if (typeof window.openMenuDetail === 'function') window.openMenuDetail(b.dataset.menu);
      else toast(`${b.dataset.menu} — 음식 탐색에서 자세히 볼 수 있어요.`);
    }));
}

// ─── 검색창 ───

let searchTimer = null;

function bindSearchBox() {
  const input = el('feedSearchInput');
  const clear = el('feedSearchClear');
  if (!input) return;

  input.addEventListener('input', () => {
    clearTimeout(searchTimer);
    if (clear) clear.hidden = !input.value;
    // 글자마다 조회하면 요청이 과도해지므로 잠시 기다린다
    searchTimer = setTimeout(() => runSearch(input.value), 280);
  });

  clear?.addEventListener('click', () => {
    input.value = '';
    clear.hidden = true;
    runSearch('');
    input.focus();
  });
}

// ─── 초기화 ───

function watchPanel() {
  const observer = new MutationObserver(() => {
    if (document.body.dataset.panel === 'favorites') loadFeed();
  });
  observer.observe(document.body, { attributes: true, attributeFilter: ['data-panel'] });
}

function init() {
  bindSearchBox();

  el('feedSheetClose')?.addEventListener('click', closeSheet);
  el('feedBlockBtn')?.addEventListener('click', doBlock);
  el('feedSafetySheet')?.addEventListener('click', event => {
    if (event.target === el('feedSafetySheet')) closeSheet();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeSheet();
  });

  el('feedRefreshBtn')?.addEventListener('click', () => loadFeed({ force: true }));
  watchPanel();
  render();
  loadFeed();

  if (FIREBASE_READY) {
    // 로그인 상태가 바뀌면 좋아요·저장 표시가 달라지므로 다시 불러온다
    onAuthChange(() => { if (loadedOnce) loadFeed({ force: true }); });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

window.feedUI = { reload: () => loadFeed({ force: true }), search: runSearch };
