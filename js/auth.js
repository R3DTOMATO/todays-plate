// ─────────────────────────────────────────────────────────────
// 인증 모듈 — 구글 / 애플 / 이메일+비밀번호
//
// 설계 원칙
//  1. 게이트 방식이다. 앱 진입에는 로그인이 필요 없고,
//     계정이 있어야만 하는 기능(그룹 투표 만들기, 피드 글쓰기, 좋아요, 신고)에서만 요구한다.
//     추천 받기·검색·기록은 비로그인으로 그대로 쓸 수 있다.
//  2. requireAuth()가 유일한 관문이다. 각 기능은 이 함수만 호출하면 된다.
//  3. FIREBASE_CONFIG가 비어 있으면 전체가 비활성화되고 기존 앱은 그대로 동작한다.
// ─────────────────────────────────────────────────────────────

import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signOut,
  GoogleAuthProvider, OAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  sendPasswordResetEmail, updateProfile
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore, doc, setDoc, getDoc, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

export const FIREBASE_READY = Boolean(
  window.FIREBASE_CONFIG &&
  window.FIREBASE_CONFIG.apiKey &&
  window.FIREBASE_CONFIG.projectId
);

let app = null;
let auth = null;
let db = null;

if (FIREBASE_READY) {
  // group-vote.js 등 다른 모듈이 먼저 초기화했을 수 있으므로 재사용한다
  app = getApps().length ? getApps()[0] : initializeApp(window.FIREBASE_CONFIG);
  auth = getAuth(app);
  db = getFirestore(app);
} else {
  console.info('[auth] FIREBASE_CONFIG가 비어 있어 로그인 기능이 비활성화되었습니다.');
}

export { auth, db };

// ─── 상태 ───
let currentUser = null;
let authReady = false;
const readyWaiters = [];
const listeners = new Set();

if (FIREBASE_READY) {
  onAuthStateChanged(auth, async user => {
    currentUser = user;
    if (user) await ensureUserDoc(user);
    if (!authReady) {
      authReady = true;
      readyWaiters.splice(0).forEach(resolve => resolve(user));
    }
    listeners.forEach(fn => {
      try { fn(user); } catch (error) { console.error('[auth] listener 오류:', error); }
    });
  });

  // 모바일 리다이렉트 로그인 복귀 처리
  getRedirectResult(auth).catch(error => {
    if (error?.code !== 'auth/no-auth-event') console.error('[auth] 리다이렉트 로그인 실패:', error);
  });
}

/** 최초 인증 상태 확인이 끝날 때까지 기다린다. */
export function waitForAuth() {
  if (!FIREBASE_READY) return Promise.resolve(null);
  if (authReady) return Promise.resolve(currentUser);
  return new Promise(resolve => readyWaiters.push(resolve));
}

export function getCurrentUser() {
  return currentUser;
}

export function isSignedIn() {
  return Boolean(currentUser);
}

/** 로그인 상태 변화를 구독한다. 반환값을 호출하면 구독 해제. */
export function onAuthChange(callback) {
  listeners.add(callback);
  if (authReady) callback(currentUser);
  return () => listeners.delete(callback);
}

// ─── 사용자 문서 ───
// 피드·그룹 투표에서 표시 이름이 필요하므로 로그인 시 자동 생성한다.

async function ensureUserDoc(user) {
  try {
    const ref = doc(db, 'users', user.uid);
    const snapshot = await getDoc(ref);
    if (snapshot.exists()) return;

    await setDoc(ref, {
      displayName: user.displayName || defaultNickname(user),
      photoUrl: user.photoURL || null,
      // 이메일은 저장하지 않는다. Auth가 이미 보관하고 있고,
      // Firestore에 두면 다른 사용자에게 노출될 위험이 생긴다.
      createdAt: serverTimestamp(),
      feedPublicDefault: false   // 기록 공개는 항상 사용자가 직접 켜야 한다
    });
  } catch (error) {
    console.error('[auth] 사용자 문서 생성 실패:', error);
  }
}

function defaultNickname(user) {
  if (user.email) return user.email.split('@')[0].slice(0, 12);
  return '식탁친구' + user.uid.slice(0, 4);
}

// ─── 로그인 수단 ───

// 팝업이 막히는 환경(인앱 브라우저, iOS Safari 일부)에서는 리다이렉트로 넘어간다.
async function runProviderSignIn(provider) {
  requireReady();
  try {
    const result = await signInWithPopup(auth, provider);
    return result.user;
  } catch (error) {
    const fallback = [
      'auth/popup-blocked',
      'auth/popup-closed-by-user',
      'auth/cancelled-popup-request',
      'auth/operation-not-supported-in-this-environment'
    ];
    if (fallback.includes(error?.code)) {
      await signInWithRedirect(auth, provider);
      return null; // 페이지가 이동하므로 여기서 끝
    }
    throw toFriendlyError(error);
  }
}

export function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return runProviderSignIn(provider);
}

export function signInWithApple() {
  const provider = new OAuthProvider('apple.com');
  provider.addScope('email');
  provider.addScope('name');
  return runProviderSignIn(provider);
}

export async function signUpWithEmail(email, password, nickname) {
  requireReady();
  validateEmail(email);
  validatePassword(password);
  try {
    const { user } = await createUserWithEmailAndPassword(auth, email.trim(), password);
    const name = (nickname || '').trim().slice(0, 12);
    if (name) await updateProfile(user, { displayName: name });
    return user;
  } catch (error) {
    throw toFriendlyError(error);
  }
}

export async function signInWithEmail(email, password) {
  requireReady();
  validateEmail(email);
  try {
    const { user } = await signInWithEmailAndPassword(auth, email.trim(), password);
    return user;
  } catch (error) {
    throw toFriendlyError(error);
  }
}

export async function resetPassword(email) {
  requireReady();
  validateEmail(email);
  try {
    await sendPasswordResetEmail(auth, email.trim());
  } catch (error) {
    throw toFriendlyError(error);
  }
}

export async function signOutUser() {
  requireReady();
  await signOut(auth);
}

/**
 * 계정 삭제. 개인정보보호법·App Store 심사 모두 요구하는 기능이다.
 *
 * 클라이언트에서 Auth 계정만 지우면 Firestore 문서와 Storage 사진이 남는다.
 * 남의 게시물에 단 좋아요·댓글은 보안 규칙상 클라이언트가 정리할 수도 없다.
 * 그래서 서버가 데이터를 모두 정리한 뒤 마지막에 계정을 지운다.
 */
export async function deleteAccount() {
  requireReady();
  if (!currentUser) throw new Error('로그인 상태가 아니에요.');

  const base = window.APP_CONFIG?.API_BASE_URL;
  if (!base) throw new Error('서버 주소가 설정되지 않았어요.');

  // 발급한 지 오래된 토큰은 서버가 거부하므로 새로 받는다
  const token = await currentUser.getIdToken(true);

  const response = await fetch(`${base}/api/account/delete`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    if (response.status === 401) {
      throw new Error('보안을 위해 다시 로그인한 뒤 탈퇴를 진행해 주세요.');
    }
    throw new Error(detail.error === 'service_unavailable'
      ? '탈퇴 기능이 아직 준비되지 않았어요. 문의해 주세요.'
      : '탈퇴 처리에 실패했어요. 잠시 후 다시 시도해 주세요.');
  }

  const result = await response.json();
  // 서버가 계정을 지웠으므로 로컬 세션도 정리한다
  await signOut(auth).catch(() => {});
  return result.deleted;
}

// ─── 게이트 ───

/**
 * 계정이 필요한 기능 앞에서 호출한다.
 * 로그인되어 있으면 사용자, 아니면 로그인 모달을 띄우고 결과를 기다린다.
 *
 * @param {string} reason 모달에 표시할 안내 문구
 * @returns {Promise<Object|null>} 로그인한 사용자, 사용자가 취소하면 null
 */
export async function requireAuth(reason = '이 기능은 로그인이 필요해요') {
  if (!FIREBASE_READY) {
    throw new Error('로그인 기능이 아직 설정되지 않았어요.');
  }
  await waitForAuth();
  if (currentUser) return currentUser;

  if (typeof window.openAuthModal === 'function') {
    return window.openAuthModal(reason);
  }
  throw new Error(reason);
}

// ─── 유틸 ───

function requireReady() {
  if (!FIREBASE_READY) throw new Error('로그인 기능이 아직 설정되지 않았어요.');
}

function validateEmail(email) {
  const value = (email || '').trim();
  if (!value || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new Error('이메일 주소를 다시 확인해 주세요.');
  }
}

function validatePassword(password) {
  if (!password || password.length < 8) {
    throw new Error('비밀번호는 8자 이상으로 만들어 주세요.');
  }
}

// Firebase 오류 코드를 사용자가 읽을 수 있는 문장으로 바꾼다.
function toFriendlyError(error) {
  const messages = {
    'auth/email-already-in-use': '이미 가입된 이메일이에요. 로그인해 주세요.',
    'auth/invalid-email': '이메일 주소 형식이 올바르지 않아요.',
    'auth/weak-password': '비밀번호가 너무 짧아요. 8자 이상으로 만들어 주세요.',
    'auth/user-not-found': '가입되지 않은 이메일이에요.',
    'auth/wrong-password': '비밀번호가 맞지 않아요.',
    'auth/invalid-credential': '이메일 또는 비밀번호가 맞지 않아요.',
    'auth/too-many-requests': '시도가 너무 많았어요. 잠시 후 다시 시도해 주세요.',
    'auth/network-request-failed': '네트워크 연결을 확인해 주세요.',
    'auth/account-exists-with-different-credential':
      '같은 이메일로 다른 방식으로 가입한 계정이 있어요. 기존 방식으로 로그인해 주세요.'
  };
  const friendly = messages[error?.code];
  return friendly ? new Error(friendly) : new Error(error?.message || '로그인에 실패했어요.');
}

// 기존 app.js(클래식 스크립트)에서 접근할 수 있도록 노출한다.
window.appAuth = {
  ready: FIREBASE_READY,
  requireAuth,
  getCurrentUser,
  isSignedIn,
  onAuthChange,
  waitForAuth,
  signInWithGoogle,
  signInWithApple,
  signInWithEmail,
  signUpWithEmail,
  resetPassword,
  signOut: signOutUser,
  deleteAccount
};
