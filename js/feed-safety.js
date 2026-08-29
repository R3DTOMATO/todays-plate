// ─────────────────────────────────────────────────────────────
// 신고 · 차단
//
// UGC 앱의 필수 안전 기능이며 App Store 심사 요건이기도 하다.
//
// 설계
//  1. 신고는 접수만 하고 클라이언트가 다시 읽지 못한다(신고자 보호).
//     누가 신고했는지 서로 알 수 있으면 보복이 가능해진다.
//  2. 차단은 즉시 효과가 있어야 한다. 서버 처리를 기다리지 않고
//     피드에서 바로 사라진다.
//  3. 같은 대상을 중복 신고해도 문서가 쌓이지 않게 ID를 고정한다.
// ─────────────────────────────────────────────────────────────

import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getFirestore, doc, setDoc, deleteDoc, getDocs, collection, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { FIREBASE_READY, getCurrentUser, requireAuth } from './auth.js';

let db = null;
if (FIREBASE_READY) {
  const app = getApps().length ? getApps()[0] : initializeApp(window.FIREBASE_CONFIG);
  db = getFirestore(app);
}

export const REPORT_REASONS = [
  { id: 'spam',          label: '스팸 또는 광고' },
  { id: 'inappropriate', label: '부적절하거나 불쾌한 내용' },
  { id: 'notFood',       label: '음식과 관계없는 게시물' },
  { id: 'harassment',    label: '욕설·괴롭힘' },
  { id: 'falseInfo',     label: '허위 정보' },
  { id: 'other',         label: '기타' }
];

// ─── 신고 ───

/**
 * @param {'post'|'comment'|'user'} targetType
 * @param {string} targetId
 * @param {string} reason  REPORT_REASONS의 id
 * @param {string} detail  선택 설명
 */
export async function submitReport(targetType, targetId, reason, detail = '') {
  if (!FIREBASE_READY || !db) {
    return { ok: false, error: '신고 기능이 아직 설정되지 않았어요.' };
  }
  if (!REPORT_REASONS.some(r => r.id === reason)) {
    return { ok: false, error: '신고 사유를 선택해 주세요.' };
  }

  let user;
  try {
    user = await requireAuth('신고하려면 로그인이 필요해요');
    if (!user) return { ok: false, error: null };
  } catch (error) {
    return { ok: false, error: error.message };
  }

  // 같은 사람이 같은 대상을 여러 번 신고해도 문서가 하나만 남는다
  const reportId = `${user.uid}_${targetType}_${targetId}`;

  try {
    await setDoc(doc(db, 'reports', reportId), {
      targetType,
      targetId: String(targetId),
      reporterUid: user.uid,
      reason,
      detail: String(detail || '').slice(0, 300),
      status: 'pending',
      createdAt: serverTimestamp()
    });
    return { ok: true };
  } catch (error) {
    console.error('[safety] 신고 실패:', error);
    return { ok: false, error: '신고를 접수하지 못했어요. 잠시 후 다시 시도해 주세요.' };
  }
}

// ─── 차단 ───

export async function blockUser(uid, displayName = '') {
  if (!FIREBASE_READY || !db) return { ok: false, error: '차단 기능이 설정되지 않았어요.' };

  let user;
  try {
    user = await requireAuth('차단하려면 로그인이 필요해요');
    if (!user) return { ok: false, error: null };
  } catch (error) {
    return { ok: false, error: error.message };
  }

  if (uid === user.uid) return { ok: false, error: '자기 자신은 차단할 수 없어요.' };

  try {
    await setDoc(doc(db, 'users', user.uid, 'blockedUsers', uid), {
      displayName: String(displayName || '').slice(0, 12),
      createdAt: serverTimestamp()
    });
    return { ok: true };
  } catch (error) {
    console.error('[safety] 차단 실패:', error);
    return { ok: false, error: '차단하지 못했어요.' };
  }
}

export async function unblockUser(uid) {
  if (!FIREBASE_READY || !db) return { ok: false, error: '차단 기능이 설정되지 않았어요.' };
  const user = getCurrentUser();
  if (!user) return { ok: false, error: '로그인이 필요해요.' };

  try {
    await deleteDoc(doc(db, 'users', user.uid, 'blockedUsers', uid));
    return { ok: true };
  } catch (error) {
    console.error('[safety] 차단 해제 실패:', error);
    return { ok: false, error: '차단을 해제하지 못했어요.' };
  }
}

/** 차단한 사용자 uid 목록. 피드 필터링에 쓴다. */
export async function fetchBlockedUids() {
  if (!FIREBASE_READY || !db) return new Set();
  const user = getCurrentUser();
  if (!user) return new Set();
  try {
    const snapshot = await getDocs(collection(db, 'users', user.uid, 'blockedUsers'));
    return new Set(snapshot.docs.map(d => d.id));
  } catch (error) {
    return new Set();
  }
}

/** 차단 목록 화면용 — 표시 이름까지 함께 */
export async function fetchBlockedList() {
  if (!FIREBASE_READY || !db) return [];
  const user = getCurrentUser();
  if (!user) return [];
  try {
    const snapshot = await getDocs(collection(db, 'users', user.uid, 'blockedUsers'));
    return snapshot.docs.map(d => ({ uid: d.id, ...d.data() }));
  } catch (error) {
    return [];
  }
}

window.feedSafety = {
  report: submitReport,
  block: blockUser,
  unblock: unblockUser,
  blockedUids: fetchBlockedUids,
  blockedList: fetchBlockedList,
  reasons: REPORT_REASONS
};
