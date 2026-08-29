// ─────────────────────────────────────────────────────────────
// GROUP TABLE — 링크 기반 그룹 메뉴 투표
//
// 설계 메모:
//  - 참여자는 회원가입하지 않는다. Firebase 익명 인증으로만 식별한다.
//  - 익명 uid는 나중에 linkWithCredential로 정식 계정에 승격할 수 있으므로,
//    회원가입 기능을 추가해도 기존 투표 데이터를 옮길 필요가 없다.
//  - 세션 ID는 추측 불가능해야 한다(링크 = 접근 권한).
// ─────────────────────────────────────────────────────────────

import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { requireAuth, getCurrentUser, FIREBASE_READY as AUTH_READY } from './auth.js';
import {
  getFirestore, doc, setDoc, getDoc, updateDoc, collection,
  onSnapshot, serverTimestamp, Timestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// Firebase 설정이 아직 채워지지 않았으면 이 모듈을 비활성화한다.
// (설정 없이 initializeApp을 호출하면 예외가 발생해 앱 전체가 멈춘다)
const FIREBASE_READY = Boolean(
  window.FIREBASE_CONFIG &&
  window.FIREBASE_CONFIG.apiKey &&
  window.FIREBASE_CONFIG.projectId
);

let firebaseApp = null;
let db = null;

if (FIREBASE_READY) {
  // auth.js가 먼저 초기화했을 수 있으므로 기존 앱 인스턴스를 재사용한다
  firebaseApp = getApps().length ? getApps()[0] : initializeApp(window.FIREBASE_CONFIG);
  db = getFirestore(firebaseApp);
} else {
  console.info('[group-vote] Firebase 설정이 없어 그룹 투표 기능이 비활성화되었습니다. js/config.js의 FIREBASE_CONFIG를 채워 주세요.');
}

function requireFirebase() {
  if (!FIREBASE_READY) {
    throw new Error('그룹 투표 기능이 아직 설정되지 않았어요.');
  }
}

const SESSION_ID_LENGTH = 12;
const ID_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789'; // 혼동되는 l,o,0,1 제외
const MIN_CANDIDATES = 2;
const MAX_CANDIDATES = 5;

// ─── 상태 ───
let currentUid = null;
let currentSessionId = null;
let currentSession = null;
let participants = [];
let myVoteMenuId = null;
let unsubscribeSession = null;
let unsubscribeParticipants = null;
let closeTimer = null;

// ─── 유틸 ───

function generateSessionId() {
  const bytes = new Uint8Array(SESSION_ID_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => ID_ALPHABET[b % ID_ALPHABET.length]).join('');
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

function toast(message) {
  if (typeof window.showToast === 'function') window.showToast(message);
  else console.log(message);
}

function sanitizeName(raw) {
  const name = String(raw ?? '').trim().replace(/\s+/g, ' ').slice(0, 12);
  return name || '익명';
}

function shareUrlFor(sessionId) {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('vote', sessionId);
  return url.toString();
}

function formatDeadline(closesAt) {
  if (!closesAt) return '';
  const date = closesAt instanceof Timestamp ? closesAt.toDate() : new Date(closesAt);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const time = date.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });
  return sameDay ? `오늘 ${time} 마감` : `${date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })} ${time} 마감`;
}

function isClosed(session) {
  if (!session) return false;
  if (session.status === 'closed') return true;
  const closesAt = session.closesAt instanceof Timestamp
    ? session.closesAt.toDate()
    : new Date(session.closesAt);
  return closesAt.getTime() <= Date.now();
}

// ─── 인증 ───

/**
 * 그룹 투표는 정식 계정을 요구한다.
 * 익명 계정은 차단/신고가 우회되고, 나중에 내 투표 이력을 되찾을 수 없기 때문이다.
 * 로그인이 안 되어 있으면 로그인 모달이 뜨고, 사용자가 취소하면 예외를 던진다.
 */
async function ensureSignedIn(reason = '그룹 투표는 로그인이 필요해요') {
  if (!FIREBASE_READY || !AUTH_READY) {
    throw new Error('그룹 투표 기능이 아직 설정되지 않았어요.');
  }
  const user = await requireAuth(reason);
  if (!user) throw new Error('로그인을 취소했어요.');
  currentUid = user.uid;
  return user.uid;
}

/** 로그인한 사용자의 표시 이름을 가져온다. 참여자가 따로 이름을 입력하지 않아도 된다. */
function currentDisplayName() {
  const user = getCurrentUser();
  return user?.displayName || user?.email?.split('@')[0] || '식탁친구';
}

// ─── 세션 생성 (주최자) ───

/**
 * @param {{menuId:string, menuName:string, emoji?:string, area?:string}[]} candidates
 * @param {number} durationMinutes 마감까지 남은 분
 * @param {string} hostName
 * @returns {Promise<{sessionId:string, shareUrl:string}>}
 */
export async function createVoteSession(candidates, durationMinutes, hostName) {
  requireFirebase();
  if (!Array.isArray(candidates)
      || candidates.length < MIN_CANDIDATES
      || candidates.length > MAX_CANDIDATES) {
    throw new Error(`메뉴 후보는 ${MIN_CANDIDATES}~${MAX_CANDIDATES}개여야 합니다.`);
  }

  const uid = await ensureSignedIn('투표를 만들려면 로그인이 필요해요');
  const sessionId = generateSessionId();
  const name = sanitizeName(hostName || currentDisplayName());
  const closesAt = Timestamp.fromDate(new Date(Date.now() + durationMinutes * 60 * 1000));

  await setDoc(doc(db, 'voteSessions', sessionId), {
    title: '오늘 뭐 먹지?',
    candidates: candidates.slice(0, MAX_CANDIDATES).map(c => ({
      menuId: String(c.menuId ?? c.menuName),
      menuName: String(c.menuName),
      emoji: c.emoji ?? '🍽️',
      area: c.area ?? null
    })),
    hostUid: uid,
    hostName: name,
    createdAt: serverTimestamp(),
    closesAt,
    status: 'open',
    winnerMenuId: null,
    // B(친구 계정) 확장 대비 — 지금은 항상 null
    ownerAccountUid: null,
    groupId: null
  });

  // 주최자도 참여자로 등록 (아직 투표 전)
  await setDoc(doc(db, 'voteSessions', sessionId, 'participants', uid), {
    name,
    votedMenuId: null,
    votedAt: null,
    joinedAt: serverTimestamp(),
    accountUid: null
  });

  if (typeof window.trackEvent === 'function') {
    window.trackEvent('group_vote_created', {
      candidateCount: candidates.length,
      durationMinutes
    });
  }

  return { sessionId, shareUrl: shareUrlFor(sessionId) };
}

// ─── 세션 참여 (링크로 들어온 사람) ───

export async function joinVoteSession(sessionId, displayName) {
  const uid = await ensureSignedIn('투표에 참여하려면 로그인이 필요해요');
  const name = displayName || currentDisplayName();
  const sessionRef = doc(db, 'voteSessions', sessionId);
  const snapshot = await getDoc(sessionRef);

  if (!snapshot.exists()) {
    throw new Error('투표를 찾을 수 없어요. 링크가 만료되었을 수 있어요.');
  }

  const participantRef = doc(db, 'voteSessions', sessionId, 'participants', uid);
  const existing = await getDoc(participantRef);

  if (existing.exists()) {
    // 재방문 — 이름만 갱신하고 기존 투표 유지
    if (displayName) {
      await updateDoc(participantRef, { name: sanitizeName(name) });
    }
    myVoteMenuId = existing.data().votedMenuId ?? null;
  } else {
    await setDoc(participantRef, {
      name: sanitizeName(name),
      votedMenuId: null,
      votedAt: null,
      joinedAt: serverTimestamp(),
      accountUid: null
    });
    myVoteMenuId = null;
    if (typeof window.trackEvent === 'function') {
      window.trackEvent('group_vote_joined', { sessionId });
    }
  }

  startListening(sessionId);
  return snapshot.data();
}

// ─── 투표 ───

export async function castVote(menuId) {
  if (!currentSessionId) throw new Error('참여 중인 투표가 없어요.');
  if (isClosed(currentSession)) {
    toast('이미 마감된 투표예요.');
    return;
  }

  const uid = await ensureSignedIn('투표하려면 로그인이 필요해요');
  await updateDoc(doc(db, 'voteSessions', currentSessionId, 'participants', uid), {
    votedMenuId: String(menuId),
    votedAt: serverTimestamp()
  });

  myVoteMenuId = String(menuId);

  if (typeof window.trackEvent === 'function') {
    window.trackEvent('group_vote_submitted', { menuId, sessionId: currentSessionId });
  }
  toast('투표했어요. 마감 전까지 바꿀 수 있어요.');
}

// ─── 실시간 구독 ───

function startListening(sessionId) {
  stopListening();
  currentSessionId = sessionId;

  unsubscribeSession = onSnapshot(
    doc(db, 'voteSessions', sessionId),
    snap => {
      if (!snap.exists()) {
        toast('투표가 삭제되었어요.');
        stopListening();
        return;
      }
      currentSession = snap.data();
      scheduleAutoClose();
      render();
    },
    error => {
      console.error('세션 구독 실패:', error);
      toast('투표 정보를 불러오지 못했어요.');
    }
  );

  unsubscribeParticipants = onSnapshot(
    collection(db, 'voteSessions', sessionId, 'participants'),
    snap => {
      participants = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
      const mine = participants.find(p => p.uid === currentUid);
      myVoteMenuId = mine?.votedMenuId ?? null;
      render();
    },
    error => console.error('참여자 구독 실패:', error)
  );
}

export function stopListening() {
  if (unsubscribeSession) { unsubscribeSession(); unsubscribeSession = null; }
  if (unsubscribeParticipants) { unsubscribeParticipants(); unsubscribeParticipants = null; }
  if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
  currentSessionId = null;
  currentSession = null;
  participants = [];
  myVoteMenuId = null;
}

// ─── 마감 처리 ───
// 주최자 기기에서만 status를 갱신한다. 다른 참여자는 시각 비교로 마감을 표시한다.
// (참여자가 아무도 앱을 열지 않으면 status가 안 바뀌지만, 읽는 쪽에서 시각으로
//  판단하므로 표시상 문제는 없다. 정확한 서버측 마감이 필요해지면 Cloud Functions
//  스케줄러로 옮긴다.)

function scheduleAutoClose() {
  if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
  if (!currentSession || currentSession.status === 'closed') return;

  const closesAt = currentSession.closesAt instanceof Timestamp
    ? currentSession.closesAt.toDate()
    : new Date(currentSession.closesAt);
  const remaining = closesAt.getTime() - Date.now();

  if (remaining <= 0) { finalizeIfHost(); return; }
  if (remaining > 24 * 60 * 60 * 1000) return; // 너무 먼 미래면 타이머 걸지 않음
  closeTimer = setTimeout(finalizeIfHost, remaining + 500);
}

async function finalizeIfHost() {
  if (!currentSession || !currentSessionId) return;
  if (currentSession.status === 'closed') { render(); return; }
  if (currentSession.hostUid !== currentUid) { render(); return; }

  const winner = computeTally()[0];
  try {
    await updateDoc(doc(db, 'voteSessions', currentSessionId), {
      status: 'closed',
      winnerMenuId: winner?.menuId ?? null
    });
    if (typeof window.trackEvent === 'function') {
      window.trackEvent('group_vote_closed', {
        sessionId: currentSessionId,
        winnerMenuId: winner?.menuId ?? null
      });
    }
  } catch (error) {
    console.error('마감 처리 실패:', error);
  }
}

// ─── 집계 ───

function computeTally() {
  if (!currentSession) return [];
  const counts = new Map();
  currentSession.candidates.forEach(c => counts.set(c.menuId, 0));
  participants.forEach(p => {
    if (p.votedMenuId && counts.has(p.votedMenuId)) {
      counts.set(p.votedMenuId, counts.get(p.votedMenuId) + 1);
    }
  });
  return currentSession.candidates
    .map(c => ({ ...c, votes: counts.get(c.menuId) ?? 0 }))
    .sort((a, b) => b.votes - a.votes);
}

// ─── 렌더링 ───
// 기존 panel-group 마크업의 DOM id를 그대로 사용한다.

function render() {
  if (!currentSession) return;

  const tally = computeTally();
  const closed = isClosed(currentSession);
  const votedCount = participants.filter(p => p.votedMenuId).length;

  // 부제: 참여 현황 + 마감
  const subtitle = document.querySelector('#panel-group .sub-subtitle');
  if (subtitle) {
    subtitle.textContent = closed
      ? `${participants.length}명 참여 · 마감됨`
      : `${participants.length}명 중 ${votedCount}명 투표 · ${formatDeadline(currentSession.closesAt)}`;
  }

  // 참여자 아바타
  const avatars = document.querySelector('#panel-group .group-avatars');
  if (avatars) {
    const shown = participants.slice(0, 5);
    const rest = participants.length - shown.length;
    avatars.innerHTML = shown
      .map(p => `<span>${escapeHtml((p.name || '?').charAt(0))}</span>`)
      .join('') + (rest > 0 ? `<small>+${rest}</small>` : '');
    avatars.setAttribute('aria-label', `참여자 ${participants.length}명`);
  }

  // 후보 목록
  const options = document.getElementById('groupVoteOptions');
  if (options) {
    options.innerHTML = tally.map(c => {
      const selected = c.menuId === myVoteMenuId ? ' selected' : '';
      const area = c.area ? ` · ${escapeHtml(c.area)}` : '';
      return `<button type="button" class="${selected.trim()}"
        data-menu-id="${escapeHtml(c.menuId)}"${closed ? ' disabled' : ''}>
        <span>${escapeHtml(c.emoji)}</span>
        <strong>${escapeHtml(c.menuName)}</strong>
        <small>${c.votes}표${area}</small>
      </button>`;
    }).join('');

    options.querySelectorAll('button').forEach(button => {
      button.addEventListener('click', () => {
        castVote(button.dataset.menuId).catch(error => {
          console.error(error);
          toast('투표에 실패했어요. 잠시 후 다시 시도해 주세요.');
        });
      });
    });
  }

  // 현황 문구
  const lead = document.getElementById('groupLead');
  if (lead) {
    const [first, second] = tally;
    if (closed) {
      lead.innerHTML = first && first.votes > 0
        ? `<strong>${escapeHtml(first.menuName)}(으)로 정해졌어요</strong><span>근처 식당을 바로 찾아볼까요?</span>`
        : `<strong>투표가 마감됐어요</strong><span>아무도 투표하지 않았어요.</span>`;
    } else if (!first || first.votes === 0) {
      lead.innerHTML = `<strong>아직 투표가 없어요</strong><span>첫 번째로 골라 보세요.</span>`;
    } else if (second && first.votes === second.votes) {
      lead.innerHTML = `<strong>${escapeHtml(first.menuName)}와 ${escapeHtml(second.menuName)}가 동점이에요</strong><span>마감 전까지 다시 고를 수 있어요.</span>`;
    } else {
      const gap = first.votes - (second?.votes ?? 0);
      lead.innerHTML = `<strong>${escapeHtml(first.menuName)}이(가) ${gap}표 앞서고 있어요</strong><span>마감 후 1위 메뉴와 가까운 식당을 추천해요.</span>`;
    }
  }

  // 제출 버튼 → 마감 후에는 식당 찾기로 전환
  const submit = document.querySelector('.group-vote-submit');
  if (submit) {
    const winner = tally[0];
    if (closed && winner && winner.votes > 0) {
      submit.textContent = `${winner.menuName} 근처 식당 보기`;
      submit.disabled = false;
      submit.onclick = () => {
        if (typeof window.goNearbyWithMenu === 'function') window.goNearbyWithMenu(winner.menuName);
        else if (typeof window.switchPanel === 'function') window.switchPanel('nearby');
      };
    } else if (closed) {
      submit.textContent = '마감된 투표예요';
      submit.disabled = true;
      submit.onclick = null;
    } else {
      submit.textContent = myVoteMenuId ? '투표 완료 · 링크 공유하기' : '위에서 메뉴를 골라 주세요';
      submit.disabled = false;
      submit.onclick = () => shareCurrentSession();
    }
  }
}

// ─── 공유 ───

export async function shareCurrentSession() {
  if (!currentSessionId) return;
  const url = shareUrlFor(currentSessionId);
  const text = '오늘 뭐 먹을지 같이 골라요!';

  if (navigator.share) {
    try {
      await navigator.share({ title: '오늘의 식탁', text, url });
      return;
    } catch (error) {
      if (error?.name === 'AbortError') return; // 사용자가 취소
    }
  }

  try {
    await navigator.clipboard.writeText(url);
    toast('투표 링크를 복사했어요.');
  } catch (_) {
    window.prompt('링크를 복사해 친구에게 보내 주세요', url);
  }
}

// ─── 진입 처리 ───
// 앱 로드 시 ?vote=<id> 가 있으면 자동으로 그룹 패널을 연다.

export async function handleIncomingVoteLink() {
  const sessionId = new URLSearchParams(window.location.search).get('vote');
  if (!sessionId) return false;
  if (!FIREBASE_READY || !AUTH_READY) {
    toast('그룹 투표 기능이 아직 준비 중이에요.');
    return false;
  }

  try {
    // 링크로 들어온 사람에게는 왜 로그인이 필요한지 맥락을 준다
    await ensureSignedIn('투표에 참여하려면 로그인이 필요해요');

    if (typeof window.switchPanel === 'function') window.switchPanel('group');
    await joinVoteSession(sessionId, currentDisplayName());
    return true;
  } catch (error) {
    console.error('투표 참여 실패:', error);
    toast(error.message || '투표에 참여하지 못했어요.');
    return false;
  }
}

// ─── 기존 app.js의 inline onclick 핸들러와 연결 ───

window.groupVote = {
  create: createVoteSession,
  join: joinVoteSession,
  cast: castVote,
  share: shareCurrentSession,
  stop: stopListening,
  handleIncomingLink: handleIncomingVoteLink
};

document.addEventListener('DOMContentLoaded', () => {
  handleIncomingVoteLink();
});
