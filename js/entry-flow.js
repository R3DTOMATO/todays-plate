import { db, FIREBASE_READY, onAuthChange, getCurrentUser } from './auth.js';
import { doc, getDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { tastePreferences, hasCompletedTaste } from './taste-preferences.js';
import './auth-ui.js';

let state = 'loading';
let generation = 0;
const el = id => document.getElementById(id);

function setState(next, message = '') {
  state = next;
  document.body.dataset.access = next;
  const gated = !['ready', 'onboarding'].includes(next);
  el('entryGate').hidden = !gated;
  el('appShell').inert = gated;
  document.querySelector('.bottom-nav')?.toggleAttribute('inert', next !== 'ready');
  el('entryStatus').textContent = message;
  el('entryDeleteRetry').hidden = true;
  el('entryActions').hidden = next !== 'signedout';
  el('entryRetry').hidden = next !== 'error';
  el('entryStatus').setAttribute('role', next === 'error' ? 'alert' : 'status');
}

async function enter(user) {
  const token = ++generation;
  if (!user) {
    window.groupVote?.stop();
    window.tasteProfileBridge?.clear();
    setState('signedout', '로그인하고 나만의 식탁을 시작하세요.');
    return;
  }
  setState('loading', '저장한 입맛을 불러오고 있어요.');
  try {
    const deletion = await getDoc(doc(db, 'accountDeletions', user.uid));
    if (token !== generation || getCurrentUser()?.uid !== user.uid) return;
    if (deletion.exists()) {
      setState('error', '회원 탈퇴가 아직 완료되지 않았어요. 데이터 정리를 다시 시도해 주세요.');
      el('entryDeleteRetry').hidden = false;
      return;
    }
    await window.appDataReady;
    if (!window.tasteProfileBridge) throw new Error('앱을 준비하지 못했어요. 다시 시도해 주세요.');
    const snapshot = await getDoc(doc(db, 'users', user.uid, 'private', 'taste'));
    if (token !== generation || getCurrentUser()?.uid !== user.uid) return;
    const saved = snapshot.exists() ? snapshot.data() : null;
    window.tasteProfileBridge.bind(user.uid, saved ? tastePreferences(saved) : null, hasCompletedTaste(saved));
    if (hasCompletedTaste(saved)) {
      setState('ready');
      window.switchPanel('home');
      if (new URLSearchParams(location.search).has('vote')) window.groupVote?.handleIncomingLink();
    } else {
      setState('onboarding');
      window.openOnboarding();
    }
  } catch (error) {
    if (token !== generation) return;
    console.error('[entry] 입맛 불러오기 실패:', error);
    setState('error', '입맛 정보를 불러오지 못했어요. 연결을 확인하고 다시 시도해 주세요.');
  }
}

async function save(profile) {
  const user = getCurrentUser();
  if (!user || !db) throw new Error('로그인 후 다시 저장해 주세요.');
  const token = generation;
  await setDoc(doc(db, 'users', user.uid, 'private', 'taste'), {
    ...tastePreferences(profile), updatedAt: serverTimestamp(),
  });
  if (token !== generation || getCurrentUser()?.uid !== user.uid) {
    throw new Error('계정이 변경됐어요. 다시 로그인해 주세요.');
  }
}

window.appEntry = {
  canRecommend: () => state === 'ready',
  allowPanel: name => state === 'ready' || (state === 'onboarding' && name === 'onboarding'),
  save,
  reload: () => enter(getCurrentUser()),
  finish() {
    setState('ready');
    window.startQuiz();
    if (new URLSearchParams(location.search).has('vote')) window.groupVote?.handleIncomingLink();
  },
};

el('entryDeleteRetry').addEventListener('click', () => window.openDeleteAccountModal());
el('entrySignIn').addEventListener('click', () => window.openAuthModal('저장한 입맛으로 빠르게 추천받으세요.', 'signin'));
el('entrySignUp').addEventListener('click', () => window.openAuthModal('입맛은 한 번만 알려주세요.', 'signup'));
el('entryRetry').addEventListener('click', () => location.reload());
if (FIREBASE_READY) onAuthChange(enter);
else setState('error', '로그인 서비스를 연결하지 못했어요. 잠시 후 다시 시도해 주세요.');
