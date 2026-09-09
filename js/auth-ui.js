// ─────────────────────────────────────────────────────────────
// 로그인 모달 UI
//
// auth.js의 requireAuth()가 이 모달을 띄운다.
// 모달은 Promise를 반환하며, 로그인 성공 시 사용자를, 취소 시 null을 준다.
// ─────────────────────────────────────────────────────────────

import {
  FIREBASE_READY, onAuthChange, getCurrentUser,
  signInWithGoogle, signInWithApple,
  signInWithEmail, signUpWithEmail, resetPassword, signOutUser, deleteAccount
} from './auth.js';

let resolveModal = null;
let mode = 'signin'; // 'signin' | 'signup' | 'reset'

function el(id) { return document.getElementById(id); }

function toast(message) {
  if (typeof window.showToast === 'function') window.showToast(message);
  else console.log(message);
}

// ─── 열기 / 닫기 ───

/**
 * @param {string} reason 왜 로그인이 필요한지 안내
 * @returns {Promise<Object|null>}
 */
export function openAuthModal(reason, initialMode = 'signin') {
  const overlay = el('authModal');
  if (!overlay) return Promise.resolve(null);

  const hint = el('authReason');
  if (hint) {
    hint.textContent = reason || '';
    hint.hidden = !reason;
  }

  if (resolveModal) resolveModal(null);
  setMode(initialMode === 'signup' ? 'signup' : 'signin');
  clearError();
  overlay.classList.add('show');
  overlay.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');

  setTimeout(() => el('authEmail')?.focus(), 80);

  return new Promise(resolve => { resolveModal = resolve; });
}

export function closeAuthModal(user = null) {
  const overlay = el('authModal');
  if (overlay) {
    overlay.classList.remove('show');
    overlay.setAttribute('aria-hidden', 'true');
  }
  document.body.classList.remove('modal-open');

  const pending = resolveModal;
  resolveModal = null;
  if (pending) pending(user);
}

// ─── 모드 전환 ───

function setMode(next) {
  mode = next;
  const titles = {
    signin: '로그인',
    signup: '회원가입',
    reset: '비밀번호 재설정'
  };
  const submitLabels = {
    signin: '로그인',
    signup: '가입하기',
    reset: '재설정 메일 보내기'
  };

  const title = el('authModalTitle');
  if (title) title.textContent = titles[next];

  const submit = el('authSubmitBtn');
  if (submit) submit.textContent = submitLabels[next];

  // 회원가입일 때만 닉네임, 재설정일 때는 비밀번호 숨김
  const nickRow = el('authNicknameRow');
  if (nickRow) nickRow.hidden = next !== 'signup';

  const pwRow = el('authPasswordRow');
  if (pwRow) pwRow.hidden = next === 'reset';

  const social = el('authSocialGroup');
  if (social) social.hidden = next === 'reset';

  const toSignup = el('authToSignup');
  const toSignin = el('authToSignin');
  const toReset = el('authToReset');
  if (toSignup) toSignup.hidden = next !== 'signin';
  if (toReset) toReset.hidden = next !== 'signin';
  if (toSignin) toSignin.hidden = next === 'signin';

  clearError();
}

// ─── 오류 표시 ───

function showError(message) {
  const box = el('authError');
  if (!box) return;
  box.textContent = message;
  box.hidden = false;
}

function clearError() {
  const box = el('authError');
  if (box) { box.textContent = ''; box.hidden = true; }
}

function setBusy(busy) {
  const submit = el('authSubmitBtn');
  const overlay = el('authModal');
  if (submit) submit.disabled = busy;
  if (overlay) overlay.classList.toggle('busy', busy);
}

// ─── 동작 ───

async function handleSubmit() {
  if (el('authModal')?.classList.contains('busy')) return;
  clearError();
  const email = el('authEmail')?.value || '';
  const password = el('authPassword')?.value || '';
  const nickname = el('authNickname')?.value || '';

  setBusy(true);
  try {
    if (mode === 'reset') {
      await resetPassword(email);
      toast('재설정 메일을 보냈어요. 메일함을 확인해 주세요.');
      setMode('signin');
      return;
    }

    const user = mode === 'signup'
      ? await signUpWithEmail(email, password, nickname)
      : await signInWithEmail(email, password);

    toast(mode === 'signup' ? '가입이 완료됐어요.' : '로그인했어요.');
    closeAuthModal(user);
  } catch (error) {
    showError(error.message);
  } finally {
    setBusy(false);
  }
}

async function handleSocial(providerFn) {
  if (el('authModal')?.classList.contains('busy')) return;
  clearError();
  setBusy(true);
  try {
    const user = await providerFn();
    // 리다이렉트 방식이면 user가 null이고 페이지가 이동한다
    if (user) {
      toast('로그인했어요.');
      closeAuthModal(user);
    }
  } catch (error) {
    showError(error.message);
  } finally {
    setBusy(false);
  }
}

// ─── 로그인 상태를 프로필 화면에 반영 ───

function renderAuthState(user) {
  const box = el('authStatusBox');
  if (!box) return;

  if (user) {
    const name = user.displayName || user.email || '사용자';
    box.innerHTML = `
      <div class="auth-status-row">
        <div class="auth-status-name">${escapeHtml(name)}</div>
        <button type="button" class="profile-utility-btn" id="authSignOutBtn">로그아웃</button>
      </div>
      <button type="button" class="auth-delete-link" id="authDeleteBtn">계정 삭제</button>`;
    el('authSignOutBtn')?.addEventListener('click', async () => {
      await signOutUser();
      toast('로그아웃했어요.');
    });
    el('authDeleteBtn')?.addEventListener('click', openDeleteModal);
  } else {
    box.innerHTML = `
      <div class="auth-status-row">
        <div class="auth-status-name muted">로그인하지 않음</div>
        <button type="button" class="profile-utility-btn" id="authSignInBtn">로그인 / 회원가입</button>
      </div>
      <p class="auth-status-hint">로그인하면 저장한 입맛으로 메뉴를 추천받을 수 있어요.</p>`;
    el('authSignInBtn')?.addEventListener('click', () => openAuthModal(''));
  }
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}


// ─── 계정 삭제 ───
// 실수로 누르는 일이 없도록 "삭제"를 직접 입력해야 버튼이 활성화된다.

function openDeleteModal() {
  const overlay = el('deleteAccountModal');
  if (!overlay) return;

  const input = el('deleteConfirmInput');
  const confirmBtn = el('deleteAccountConfirm');
  if (input) input.value = '';
  if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = '계정 삭제'; }

  const errorBox = el('deleteAccountError');
  if (errorBox) { errorBox.hidden = true; errorBox.textContent = ''; }

  overlay.classList.add('show');
  overlay.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  setTimeout(() => input?.focus(), 80);
}

function closeDeleteModal() {
  const overlay = el('deleteAccountModal');
  if (!overlay) return;
  overlay.classList.remove('show');
  overlay.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
}

async function runDeleteAccount() {
  const confirmBtn = el('deleteAccountConfirm');
  const errorBox = el('deleteAccountError');
  if (!confirmBtn) return;

  confirmBtn.disabled = true;
  confirmBtn.textContent = '삭제 중…';
  if (errorBox) errorBox.hidden = true;

  try {
    await deleteAccount();
    closeDeleteModal();
    toast('계정을 삭제했어요. 그동안 이용해 주셔서 감사합니다.');
  } catch (error) {
    if (errorBox) {
      errorBox.textContent = error.message;
      errorBox.hidden = false;
    }
    confirmBtn.disabled = false;
    confirmBtn.textContent = '계정 삭제';
  }
}

// ─── 초기화 ───

function init() {
  // 기본값은 숨김이다. Firebase가 준비된 것을 확인한 뒤에만 보여준다.
  // (gstatic 로드 실패 등으로 이 모듈이 아예 실행되지 않으면 빈 박스가 남지 않는다)
  if (!FIREBASE_READY) return;

  const box = el('authStatusBox');
  if (box) box.hidden = false;

  el('authSubmitBtn')?.addEventListener('click', handleSubmit);
  el('authGoogleBtn')?.addEventListener('click', () => handleSocial(signInWithGoogle));
  el('authAppleBtn')?.addEventListener('click', () => handleSocial(signInWithApple));

  el('authToSignup')?.addEventListener('click', () => setMode('signup'));
  el('authToSignin')?.addEventListener('click', () => setMode('signin'));
  el('authToReset')?.addEventListener('click', () => setMode('reset'));

  el('authCloseBtn')?.addEventListener('click', () => closeAuthModal(null));

  el('deleteAccountCancel')?.addEventListener('click', closeDeleteModal);
  el('deleteAccountConfirm')?.addEventListener('click', runDeleteAccount);
  el('deleteConfirmInput')?.addEventListener('input', event => {
    const btn = el('deleteAccountConfirm');
    if (btn) btn.disabled = event.target.value.trim() !== '삭제';
  });
  el('authModal')?.addEventListener('click', event => {
    if (event.target === el('authModal')) closeAuthModal(null);
  });

  // Enter 키로 제출
  ['authEmail', 'authPassword', 'authNickname'].forEach(id => {
    el(id)?.addEventListener('keydown', event => {
      if (event.key === 'Enter') handleSubmit();
    });
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && el('authModal')?.classList.contains('show')) {
      closeAuthModal(null);
    }
  });

  onAuthChange(renderAuthState);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// auth.js의 requireAuth()가 찾는 전역 진입점
window.openAuthModal = openAuthModal;
window.closeAuthModal = closeAuthModal;

window.openDeleteAccountModal = openDeleteModal;
