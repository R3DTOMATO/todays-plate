// ─────────────────────────────────────────────────────────────
// 피드 공개 토글 — 식사 기록 모달에 얹는 UI
//
// app.js는 클래식 스크립트라 이 모듈을 직접 import할 수 없다.
// 그래서 DOM 이벤트와 전역 훅으로 느슨하게 연결한다.
// app.js를 수정하지 않으므로 기존 기록 저장 흐름이 깨지지 않는다.
// ─────────────────────────────────────────────────────────────

import { FIREBASE_READY, onAuthChange, getCurrentUser } from './auth.js';
import { publishRecord, unpublishRecord, isRecordPublished } from './feed-posts.js';

function el(id) { return document.getElementById(id); }

function toast(message) {
  if (typeof window.showToast === 'function') window.showToast(message);
  else console.log(message);
}

// 기록 모달이 열릴 때 어떤 기록을 편집 중인지 추적한다
let editingRecordSnapshot = null;
let wasPublished = false;

// ─── 안내 문구 ───
// 기존 문구는 "현재 기기에만 저장됩니다"인데, 공개를 켜면 사실이 아니게 된다.
// 토글 상태에 따라 정확한 문구로 바꾼다.

const NOTICE_PRIVATE =
  '사진과 메모는 현재 기기에만 저장됩니다. 분석 이벤트에는 사진·메모 원문을 전송하지 않습니다.';
const NOTICE_PUBLIC =
  '공개하면 사진·메모·메뉴·만족도가 다른 사용자에게 보입니다. 정확한 위치는 저장하지 않습니다.';

function updateNotice() {
  const notice = el('recordPrivacyNotice');
  const toggle = el('recordFeedPublic');
  if (!notice || !toggle) return;
  notice.textContent = toggle.checked ? NOTICE_PUBLIC : NOTICE_PRIVATE;
  notice.classList.toggle('is-public', toggle.checked);
}

// ─── 토글 표시 여부 ───
// 로그인해야 공개할 수 있으므로, 비로그인 상태에서는 안내만 보여준다.

function refreshVisibility() {
  const field = el('feedShareField');
  if (!field) return;

  if (!FIREBASE_READY) {
    field.hidden = true;
    return;
  }

  field.hidden = false;
  const signedIn = Boolean(getCurrentUser());
  const toggle = el('recordFeedPublic');
  const hint = field.querySelector('.feed-share-text small');

  if (toggle) toggle.disabled = false;
  if (hint) {
    hint.textContent = signedIn
      ? '다른 사용자가 이 기록을 볼 수 있어요. 언제든 다시 비공개로 바꿀 수 있어요.'
      : '체크하면 로그인 후 공개됩니다. 메뉴 추천은 로그인 없이도 계속 쓸 수 있어요.';
  }
}

// ─── 모달 열림 감지 ───
// app.js가 recordModal에 'show' 클래스를 붙이는 것을 관찰한다.

function watchRecordModal() {
  const modal = el('recordModal');
  if (!modal) return;

  const observer = new MutationObserver(() => {
    const isOpen = modal.classList.contains('show');
    if (isOpen) onModalOpen();
  });
  observer.observe(modal, { attributes: true, attributeFilter: ['class'] });
}

async function onModalOpen() {
  const toggle = el('recordFeedPublic');
  if (!toggle) return;

  refreshVisibility();

  // 수정 중인 기록이라면 이미 공개된 상태인지 확인해 토글에 반영한다
  const record = findEditingRecord();
  editingRecordSnapshot = record;
  wasPublished = false;
  toggle.checked = false;

  if (record && getCurrentUser()) {
    wasPublished = await isRecordPublished(record);
    toggle.checked = wasPublished;
  }
  updateNotice();
}

// app.js 내부 상태(diary, editingRecordId)는 IIFE에 갇혀 있어 직접 못 읽는다.
// app.js가 노출한 전역 훅이 있으면 쓰고, 없으면 null을 반환한다.
function findEditingRecord() {
  if (typeof window.getEditingDiaryRecord === 'function') {
    try { return window.getEditingDiaryRecord(); } catch (_) { return null; }
  }
  return null;
}

// ─── 기록 저장 후 처리 ───
// app.js의 confirmRecord()가 저장에 성공하면 이 이벤트를 쏜다.
// (app.js에 한 줄만 추가하면 된다 — 자세한 내용은 docs/feed-publish-setup.md)

async function onRecordSaved(event) {
  const record = event.detail?.record;
  const toggle = el('recordFeedPublic');
  if (!record || !toggle) return;

  const shouldPublish = toggle.checked;

  // 상태가 그대로면 아무것도 하지 않는다
  if (shouldPublish === wasPublished) return;

  if (shouldPublish) {
    const result = await publishRecord(record);
    if (result.ok) {
      toast('피드에 공개했어요.');
    } else if (result.error) {
      // 기록 자체는 이미 저장됐다. 공개만 실패했음을 분명히 알린다.
      toast(`기록은 저장했지만 공개하지 못했어요: ${result.error}`);
    }
  } else {
    const result = await unpublishRecord(record);
    if (result.ok) toast('피드에서 내렸어요.');
    else if (result.error) toast(result.error);
  }
}

// ─── 초기화 ───

function init() {
  const toggle = el('recordFeedPublic');
  if (toggle) toggle.addEventListener('change', updateNotice);

  watchRecordModal();
  document.addEventListener('mealRecordSaved', onRecordSaved);

  if (FIREBASE_READY) onAuthChange(refreshVisibility);
  else refreshVisibility();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
