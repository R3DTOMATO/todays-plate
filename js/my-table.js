// ─────────────────────────────────────────────────────────────
// 내 식탁 (Figma 200:7)
//
// 기록 탭의 두 번째 모드. 내가 피드에 공개한 게시물을 카드로 보여주고
// 공개 취소·삭제를 할 수 있게 한다.
//
// 왜 필요한가
//  게시물을 올릴 수는 있었지만 "내가 뭘 공개했는지" 볼 화면이 없었다.
//  개인정보 관점에서도 자기 공개물을 한눈에 보고 내릴 수 있어야 한다.
// ─────────────────────────────────────────────────────────────

import { FIREBASE_READY, getCurrentUser, requireAuth, onAuthChange } from './auth.js';
import { fetchMyPosts, setPostVisibility, updatePostMemo, deletePost } from './feed-posts.js';

let myPosts = [];
let loading = false;
let loadedOnce = false;
let currentMode = 'all';

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

function dayLabel(value) {
  const ms = toMillis(value);
  if (!ms) return '';
  const date = new Date(ms);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  if (sameDay) return '오늘';

  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return '어제';

  return date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
}

// ─── 모드 전환 ───

function setMode(mode) {
  currentMode = mode;

  const diary = el('diaryContent');
  const mine = el('myTableContent');
  if (diary) diary.hidden = mode !== 'all';
  if (mine) mine.hidden = mode !== 'mine';

  document.querySelectorAll('[data-record-mode]').forEach(button => {
    const active = button.dataset.recordMode === mode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });

  if (mode === 'mine') loadMyTable();
}

// ─── 로드 ───

async function loadMyTable({ force = false } = {}) {
  const host = el('myTableContent');
  if (!host) return;

  if (!FIREBASE_READY) {
    host.innerHTML = emptyState('피드 기능을 준비하고 있어요', '조금만 기다려 주세요.');
    return;
  }
  if (!getCurrentUser()) {
    host.innerHTML = emptyState(
      '로그인하면 내 식탁을 볼 수 있어요',
      '피드에 공개한 기록을 여기서 관리할 수 있어요.'
    );
    return;
  }
  if (loading || (loadedOnce && !force)) { render(); return; }

  loading = true;
  host.innerHTML = '<div class="mt-loading" role="status">불러오는 중…</div>';

  try {
    myPosts = await fetchMyPosts(30);
    loadedOnce = true;
  } catch (error) {
    console.error('[myTable] 조회 실패:', error);
    myPosts = [];
  } finally {
    loading = false;
    render();
  }
}

// ─── 렌더 ───

function render() {
  const host = el('myTableContent');
  if (!host || currentMode !== 'mine') return;

  if (myPosts.length === 0) {
    host.innerHTML = emptyState(
      '아직 공개한 기록이 없어요',
      '식사 기록에서 <strong>피드에 공개</strong>를 켜면 여기에 모여요.'
    );
    return;
  }

  host.innerHTML = myPosts.map(cardHtml).join('');
  bindEvents(host);
}

function cardHtml(post) {
  const place = post.placeName || post.diningMode || '';
  const meta = [dayLabel(post.createdAt), place].filter(Boolean).join(' · ');
  const isPublic = post.status === 'visible';
  // 운영자가 신고 처리로 내린 글은 작성자가 되돌릴 수 없다
  const isBlocked = ['hidden', 'deleting'].includes(post.status);

  // 게시물 사진이 없으면 메뉴 사진으로 채운다.
  // app.js의 getMenuImage()를 쓰면 전용 사진과 종류별 사진이 모두 처리된다.
  const menuPhoto = typeof window.getMenuImageByName === 'function'
    ? window.getMenuImageByName(post.menuName)
    : '';
  const photoSrc = post.photoUrl || menuPhoto;

  const visual = photoSrc
    ? `<img class="mt-photo" src="${escapeHtml(photoSrc)}"
         alt="${escapeHtml(post.menuName)} 사진" loading="lazy"
         onerror="this.closest('.mt-visual')?.classList.add('no-photo')">`
    : `<span class="mt-illust" aria-hidden="true">
         <img class="mt-plate" src="./assets/figma/menu-detail/decision-plate.svg" alt="">
         <img class="mt-bowl" src="./assets/figma/menu-detail/bowl.svg" alt="">
         <img class="mt-visual-badge" src="./assets/figma/menu-detail/taste-badge-spicy-korean.svg" alt="">
       </span>`;

  return `
    <article class="mt-card" data-post="${escapeHtml(post.id)}">
      <header class="mt-author">
        <span class="mt-badge-slot">
          <img src="./assets/figma/menu-detail/taste-badge-spicy-korean.svg" alt="" aria-hidden="true">
        </span>
        <span class="mt-author-copy">
          <strong>내 식탁</strong>
          <small>${escapeHtml(meta)}</small>
        </span>
        <button class="mt-more" type="button" data-more="${escapeHtml(post.id)}" aria-label="게시물 메뉴">•••</button>
      </header>

      <div class="mt-visual${isPublic ? '' : ' is-off'}">
        ${visual}
        <span class="mt-visibility${isPublic ? '' : ' off'}">${
          post.status === 'deleting' ? '삭제 재시도 필요' : isBlocked ? '운영자 비공개' : (isPublic ? '공개 중' : '공개 중지')
        }</span>
      </div>

      <div class="mt-copy">
        <strong class="mt-menu">${escapeHtml(post.menuName)}</strong>
        ${post.memo ? `<p class="mt-memo">${escapeHtml(post.memo)}</p>` : ''}
        <small class="mt-place">${escapeHtml([post.placeName, post.menuType].filter(Boolean).join(' · '))}</small>
      </div>

      <footer class="mt-actions">
        <span class="mt-stat">♡ ${post.likeCount || 0}</span>
        <span class="mt-stat muted">댓글 ${post.commentCount || 0}</span>
        <button class="mt-manage" type="button" data-manage="${escapeHtml(post.id)}">게시물 관리</button>
      </footer>
    </article>`;
}

function emptyState(title, body) {
  return `<div class="mt-empty">
      <div class="mt-empty-title">${title}</div>
      <p class="mt-empty-body">${body}</p>
    </div>`;
}

// ─── 게시물 관리 ───

function bindEvents(host) {
  host.querySelectorAll('[data-manage]').forEach(button =>
    button.addEventListener('click', () => openManageSheet(button.dataset.manage)));
  host.querySelectorAll('[data-more]').forEach(button =>
    button.addEventListener('click', () => openManageSheet(button.dataset.more)));
}

let managingPostId = null;

function currentPost() {
  return myPosts.find(p => p.id === managingPostId) || null;
}

function openManageSheet(postId) {
  managingPostId = postId;
  const post = currentPost();
  const sheet = el('mtManageSheet');
  if (!sheet || !post) return;

  const title = el('mtManageTitle');
  if (title) title.textContent = post.menuName;

  const isPublic = post.status === 'visible';
  const isBlocked = ['hidden', 'deleting'].includes(post.status);

  const sub = el('mtManageSub');
  if (sub) {
    sub.textContent = post.status === 'deleting' ? '일부 데이터 정리가 남아 있어요. 삭제를 다시 시도해 주세요.' : isBlocked
      ? '신고 검토로 비공개 처리된 게시물이라 직접 다시 공개할 수 없어요.'
      : '공개를 중지해도 기기 안 식사 기록과 좋아요·댓글은 그대로 남아요.';
  }

  const toggle = el('mtToggleVisibility');
  if (toggle) {
    toggle.textContent = isPublic ? '공개 중지하기' : '다시 공개하기';
    toggle.hidden = isBlocked;
  }

  // 수정 영역은 기본으로 접어 둔다
  const editBox = el('mtEditBox');
  if (editBox) editBox.hidden = true;
  const memoInput = el('mtEditMemo');
  if (memoInput) memoInput.value = post.memo || '';

  sheet.classList.add('show');
  sheet.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
}

function closeManageSheet() {
  const sheet = el('mtManageSheet');
  if (!sheet) return;
  sheet.classList.remove('show');
  sheet.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
  managingPostId = null;
}

// ─── 공개/중지 전환 ───

async function toggleVisibility() {
  const post = currentPost();
  if (!post) return;
  const goPublic = post.status !== 'visible';
  closeManageSheet();

  const result = await setPostVisibility(post.id, goPublic);
  if (!result.ok) {
    if (result.error) toast(result.error);
    return;
  }
  post.status = result.status;
  render();
  syncPublishedIds();
  toast(goPublic ? '다시 공개했어요.' : '공개를 중지했어요. 언제든 다시 공개할 수 있어요.');
}

// ─── 본문 수정 ───

function openEditBox() {
  const box = el('mtEditBox');
  const toggle = el('mtToggleVisibility');
  if (!box) return;
  box.hidden = false;
  if (toggle) toggle.hidden = true;
  setTimeout(() => el('mtEditMemo')?.focus(), 60);
}

async function saveEdit() {
  const post = currentPost();
  const input = el('mtEditMemo');
  if (!post || !input) return;

  const memo = input.value;
  closeManageSheet();

  const result = await updatePostMemo(post.id, memo);
  if (!result.ok) {
    if (result.error) toast(result.error);
    return;
  }
  post.memo = String(memo || '').slice(0, 300);
  render();
  toast('내용을 수정했어요.');
}

// ─── 삭제 ───

async function removeCurrent() {
  const post = currentPost();
  if (!post) return;

  // 삭제는 되돌릴 수 없고 좋아요·댓글도 함께 사라진다. 반드시 확인을 받는다.
  const ok = window.confirm(
    `'${post.menuName}' 게시물을 삭제할까요?\n\n` +
    '좋아요와 댓글도 함께 사라지고 되돌릴 수 없어요.\n' +
    '기기 안 식사 기록은 남습니다.'
  );
  if (!ok) return;

  closeManageSheet();
  const result = await deletePost(post.id);
  if (!result.ok) {
    if (result.error) toast(result.error);
    return;
  }
  myPosts = myPosts.filter(p => p.id !== post.id);
  render();
  syncPublishedIds();
  toast('게시물을 삭제했어요.');
}

// ─── 초기화 ───

function init() {
  document.querySelectorAll('[data-record-mode]').forEach(button =>
    button.addEventListener('click', () => setMode(button.dataset.recordMode)));

  el('mtToggleVisibility')?.addEventListener('click', toggleVisibility);
  el('mtManageEdit')?.addEventListener('click', openEditBox);
  el('mtEditSave')?.addEventListener('click', saveEdit);
  el('mtManageDelete')?.addEventListener('click', removeCurrent);
  el('mtManageClose')?.addEventListener('click', closeManageSheet);
  el('mtManageSheet')?.addEventListener('click', event => {
    if (event.target === el('mtManageSheet')) closeManageSheet();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeManageSheet();
  });

  el('mtSearchBtn')?.addEventListener('click', () => {
    toast('기록 검색은 준비 중이에요.');
  });

  // 로그인 상태가 바뀌면 내 게시물도 달라진다
  if (FIREBASE_READY) {
    onAuthChange(() => {
      loadedOnce = false;
      syncPublishedIds();
      if (currentMode === 'mine') loadMyTable({ force: true });
    });
  }

  setMode('all');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// ─── 전체 기록 탭에 공개 상태 알려주기 ───
// '전체 기록'은 app.js가 그리는데, 공개 여부는 서버 데이터라 여기서만 알 수 있다.
// 조회한 뒤 기록 id 집합으로 넘겨준다.

async function syncPublishedIds() {
  if (!FIREBASE_READY || !getCurrentUser()) {
    window.publishedRecordIds = new Set();
    document.dispatchEvent(new CustomEvent('publishedRecordsChanged'));
    return;
  }
  try {
    const posts = await fetchMyPosts(60);
    myPosts = posts;
    loadedOnce = true;
    window.publishedRecordIds = new Set(
      posts.filter(p => p.status === 'visible')
        .map(p => p.sourceRecordId || String(p.id).split('_').slice(1).join('_'))
    );
  } catch (error) {
    window.publishedRecordIds = new Set();
  }
  document.dispatchEvent(new CustomEvent('publishedRecordsChanged'));
}

window.publishedRecordIds = new Set();
window.myTable = { reload: () => loadMyTable({ force: true }), setMode, syncPublished: syncPublishedIds };
