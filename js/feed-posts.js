// ─────────────────────────────────────────────────────────────
// 게시물 발행 — 식사 기록을 피드에 공개
//
// 설계
//  1. 별도 글쓰기 화면을 만들지 않는다.
//     기존 식사 기록에 "피드에 공개" 토글 하나만 얹는다.
//     사용자가 이미 하던 행동에 붙이므로 게시물 공급이 즉시 발생한다.
//  2. 발행 실패가 기록 저장을 절대 막지 않는다.
//     로컬 기록이 우선이고, 피드 공개는 부가 기능이다.
//  3. 공개를 취소하면 게시물과 사진을 함께 정리한다.
//  4. 위치는 저장하지 않는다. 식당 이름까지만 남긴다(집 주소 노출 방지).
// ─────────────────────────────────────────────────────────────

import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getFirestore, doc, setDoc, deleteDoc, getDoc, addDoc, updateDoc,
  collection, query, where, orderBy, limit, getDocs, serverTimestamp,
  getCountFromServer, startAt, endAt
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { getCurrentUser, requireAuth, FIREBASE_READY } from './auth.js';
import { uploadFeedPhoto, deleteFeedPhoto, describeUploadError } from './photo-storage.js';

let db = null;
if (FIREBASE_READY) {
  const app = getApps().length ? getApps()[0] : initializeApp(window.FIREBASE_CONFIG);
  db = getFirestore(app);
}

const MEMO_MAX = 300;

// ─── 기록 → 게시물 변환 ───
// 피드 랭킹(feed-ranking.js)이 취향 매칭에 쓰는 필드를 평평하게 펼쳐 저장한다.
// 중첩 객체로 두면 Firestore 쿼리와 규칙 검증이 어려워진다.

function buildPostData(record, user, photo) {
  const menu = record.menu || {};
  return {
    authorUid: user.uid,
    authorName: user.displayName || '식탁친구',
    authorPhotoUrl: user.photoURL || null,

    menuId: String(menu.id || menu.name || ''),
    menuName: String(menu.name || ''),
    menuType: String(menu.type || '기타'),
    menuSpicy: Number(menu.spicy ?? 0),
    menuSoup: Boolean(menu.soup),
    menuWeight: String(menu.weight || '중간'),

    photoUrl: photo?.url || null,
    photoPath: photo?.path || null,   // 삭제할 때 필요
    memo: String(record.memo || '').slice(0, MEMO_MAX),
    satisfaction: Number(record.satisfaction || 0),
    diningMode: mapDiningMode(record.method),

    // 위치는 저장하지 않는다. 식당 이름까지만.
    placeName: record.placeName || null,
    amount: record.amount ?? null,

    likeCount: 0,
    commentCount: 0,
    reportCount: 0,
    status: 'visible',
    createdAt: serverTimestamp(),

    // 어떤 로컬 기록에서 나왔는지 — 공개 취소·수정 시 대조용
    sourceRecordId: String(record.id || '')
  };
}

function mapDiningMode(method) {
  if (method === '집밥' || method === '요리' || method === '간단') return '집밥';
  if (method === '배달') return '배달';
  return '외식';
}

// 게시물 ID는 기록 ID와 1:1로 묶는다.
// 같은 기록을 두 번 공개해도 게시물이 중복 생성되지 않는다.
function postIdFor(user, record) {
  return `${user.uid}_${record.id}`;
}

// ─── 발행 ───

/**
 * 식사 기록을 피드에 공개한다.
 *
 * @param {Object} record 식사 기록 (app.js의 diary 항목)
 * @returns {Promise<{ok: boolean, postId?: string, error?: string}>}
 *          예외를 던지지 않는다. 호출부가 기록 저장을 계속할 수 있어야 하므로
 *          실패도 결과값으로 돌려준다.
 */
export async function publishRecord(record) {
  if (!FIREBASE_READY || !db) {
    return { ok: false, error: '피드 기능이 아직 설정되지 않았어요.' };
  }
  if (!record || !record.menu?.name) {
    return { ok: false, error: '공개할 기록을 찾지 못했어요.' };
  }

  let user;
  try {
    user = await requireAuth('피드에 공개하려면 로그인이 필요해요');
    if (!user) return { ok: false, error: null };   // 사용자가 취소 — 오류 아님
  } catch (error) {
    return { ok: false, error: error.message };
  }

  let photo = null;
  const postId = postIdFor(user, record);
  try {
    const ref = doc(db, 'posts', postId);
    const existing = await getDoc(ref);
    const previous = existing.exists() ? existing.data() : null;
    if (previous && !['visible', 'private'].includes(previous.status)) {
      return { ok: false, error: '운영자 비공개 또는 삭제 중인 글은 다시 공개할 수 없어요.' };
    }
    if (getCurrentUser()?.uid !== user.uid) return { ok: false, error: '계정이 변경됐어요.' };
    if (record.photoDataUrl) photo = await uploadFeedPhoto(record.photoDataUrl);
    const data = buildPostData(record, user, photo);
    if (previous) {
      const editable = ['memo','photoUrl','photoPath','menuId','menuName','menuType','menuSpicy','menuSoup','menuWeight','satisfaction','diningMode','placeName','amount'];
      await updateDoc(ref, Object.fromEntries(editable.map(key => [key, data[key]])));
      // Once committed, this photo must not be deleted by a later visibility failure.
      photo = null;
      if (previous.photoPath && previous.photoPath !== data.photoPath) await deleteFeedPhoto(previous.photoPath);
      if (previous.status === 'private') await updateDoc(ref, { status: 'visible' });
      return { ok: true, postId, updated: true };
    }
    await setDoc(ref, data);
    return { ok: true, postId, photoPath: photo?.path || null };
  } catch (error) {
    console.error('[feed] 게시물 저장 실패:', error);
    if (photo?.path) await deleteFeedPhoto(photo.path);
    return { ok: false, error: describeUploadError(error) || '피드에 공개하지 못했어요.' };
  }
}

/**
 * 공개를 중지한다. 게시물을 지우지 않고 status를 'private'으로 바꾼다.
 *
 * 삭제하지 않는 이유: 사용자가 잠깐 내렸다가 다시 올릴 수 있어야 하고,
 * 지워버리면 좋아요·댓글이 함께 사라져 되돌릴 수 없다.
 * 완전히 없애려면 deletePost()를 쓴다.
 */
export async function unpublishRecord(record) {
  if (!FIREBASE_READY || !db) return { ok: false, error: '피드 기능이 설정되지 않았어요.' };
  const user = getCurrentUser();
  if (!user) return { ok: false, error: '로그인이 필요해요.' };

  try {
    await updateDoc(doc(db, 'posts', postIdFor(user, record)), { status: 'private' });
    return { ok: true };
  } catch (error) {
    console.error('[feed] 공개 중지 실패:', error);
    return { ok: false, error: '공개를 중지하지 못했어요.' };
  }
}

/** 공개 중지한 게시물을 다시 공개한다. */
export async function setPostVisibility(postId, isPublic) {
  if (!FIREBASE_READY || !db) return { ok: false, error: '피드 기능이 설정되지 않았어요.' };
  if (!getCurrentUser()) return { ok: false, error: '로그인이 필요해요.' };

  try {
    await updateDoc(doc(db, 'posts', postId), { status: isPublic ? 'visible' : 'private' });
    return { ok: true, status: isPublic ? 'visible' : 'private' };
  } catch (error) {
    console.error('[feed] 공개 상태 변경 실패:', error);
    return { ok: false, error: '공개 상태를 바꾸지 못했어요.' };
  }
}

/** 게시물 본문을 수정한다. */
export async function updatePostMemo(postId, memo) {
  if (!FIREBASE_READY || !db) return { ok: false, error: '피드 기능이 설정되지 않았어요.' };
  if (!getCurrentUser()) return { ok: false, error: '로그인이 필요해요.' };

  try {
    await updateDoc(doc(db, 'posts', postId), { memo: String(memo || '').slice(0, MEMO_MAX) });
    return { ok: true };
  } catch (error) {
    console.error('[feed] 본문 수정 실패:', error);
    return { ok: false, error: '내용을 수정하지 못했어요.' };
  }
}

/** 게시물을 완전히 삭제한다. 사진도 함께 지운다. 되돌릴 수 없다. */
export async function deletePost(postId) {
  if (!FIREBASE_READY || !db) return { ok: false, error: '피드 기능이 설정되지 않았어요.' };
  if (!getCurrentUser()) return { ok: false, error: '로그인이 필요해요.' };

  try {
    const ref = doc(db, 'posts', postId);
    const snapshot = await getDoc(ref);
    if (!snapshot.exists()) return { ok: true };
    const photoPath = snapshot.data().photoPath;
    // Freeze new interactions first. Keep this parent until every child/photo is gone.
    await updateDoc(ref, { status: 'deleting' });
    for (const child of ['likes', 'comments']) {
      for (;;) {
        const page = await getDocs(query(collection(db, 'posts', postId, child), limit(100)));
        if (!page.docs.length) break;
        for (const item of page.docs) await deleteDoc(doc(db, 'posts', postId, child, item.id));
      }
    }
    if (photoPath && !await deleteFeedPhoto(photoPath)) throw new Error('photo_cleanup_failed');
    await deleteDoc(ref);
    return { ok: true };
  } catch (error) {
    console.error('[feed] 삭제 실패:', error);
    return { ok: false, error: '게시물을 삭제하지 못했어요.' };
  }
}

/**
 * 이 기록이 이미 공개되어 있는지 확인한다.
 * 기록 수정 화면을 열 때 토글의 초기 상태를 정하는 데 쓴다.
 */
export async function isRecordPublished(record) {
  if (!FIREBASE_READY || !db || !record?.id) return false;
  const user = getCurrentUser();
  if (!user) return false;
  try {
    const snapshot = await getDoc(doc(db, 'posts', postIdFor(user, record)));
    // 문서가 있어도 공개 중지 상태면 '공개 중'이 아니다
    return snapshot.exists() && snapshot.data().status === 'visible';
  } catch (error) {
    console.error('[feed] 공개 상태 조회 실패:', error);
    throw error;
  }
}

// ─── 피드 읽기 ───

/**
 * 피드에 보여줄 게시물을 가져온다.
 * 정렬·개인화는 feed-ranking.js의 rankFeed()가 담당하므로
 * 여기서는 최신순으로 넉넉히 가져오기만 한다.
 */
export async function fetchRecentPosts(max = 60) {
  if (!FIREBASE_READY || !db) return [];
  try {
    const q = query(
      collection(db, 'posts'),
      where('status', '==', 'visible'),
      orderBy('createdAt', 'desc'),
      limit(max)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.error('[feed] 게시물 조회 실패:', error);
    return [];
  }
}

/** 내가 올린 게시물만 */
export async function fetchMyPosts(max = 30) {
  if (!FIREBASE_READY || !db) return [];
  const user = getCurrentUser();
  if (!user) return [];
  try {
    const q = query(
      collection(db, 'posts'),
      where('authorUid', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(max)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.error('[feed] 내 게시물 조회 실패:', error);
    return [];
  }
}

// ─── 검색 ───

/**
 * 메뉴 이름으로 게시물을 찾는다.
 * Firestore는 부분 문자열 검색을 지원하지 않으므로 접두사 일치로 처리한다.
 * ("김치"로 "김치찌개"는 찾지만 "묵은지김치찌개"는 못 찾는다)
 *
 * 필요한 색인: posts(status ASC, menuName ASC)
 */
export async function searchPostsByMenu(term, max = 20) {
  if (!FIREBASE_READY || !db) return [];
  const keyword = String(term || '').trim();
  if (!keyword) return [];

  try {
    const q = query(
      collection(db, 'posts'),
      where('status', '==', 'visible'),
      orderBy('menuName'),
      startAt(keyword),
      endAt(keyword + '\uf8ff'),
      limit(max)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.error('[feed] 게시물 검색 실패:', error);
    return [];
  }
}

// ─── 댓글 ───

/**
 * 댓글 수는 문서에 저장하지 않고 집계 쿼리로 센다.
 * 문서에 두면 클라이언트가 조작할 수 있고, 규칙만으로는
 * "댓글을 실제로 달았는지"를 확인할 수 없기 때문이다.
 * (규모가 커지면 Cloud Functions로 비정규화하는 것이 맞다)
 */
export async function countComments(postId) {
  if (!FIREBASE_READY || !db) return 0;
  try {
    // 보안 규칙이 status == 'visible' 문서만 읽도록 허용하므로,
    // 집계 쿼리에도 같은 조건을 걸어야 한다.
    // 조건 없이 컬렉션 전체를 세면 permission-denied가 난다.
    const q = query(
      collection(db, 'posts', postId, 'comments'),
      where('status', '==', 'visible')
    );
    const snapshot = await getCountFromServer(q);
    return snapshot.data().count;
  } catch (error) {
    console.error('[feed] 댓글 수 조회 실패:', error);
    return 0;
  }
}

export async function fetchComments(postId, max = 50) {
  if (!FIREBASE_READY || !db) return [];
  try {
    const q = query(
      collection(db, 'posts', postId, 'comments'),
      where('status', '==', 'visible'),
      orderBy('createdAt', 'asc'),
      limit(max)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.error('[feed] 댓글 조회 실패:', error);
    return [];
  }
}

export async function addComment(postId, text) {
  if (!FIREBASE_READY || !db) return { ok: false, error: '댓글 기능이 설정되지 않았어요.' };

  const trimmed = String(text || '').trim().slice(0, 300);
  if (!trimmed) return { ok: false, error: '댓글 내용을 입력해 주세요.' };

  let user;
  try {
    user = await requireAuth('댓글을 쓰려면 로그인이 필요해요');
    if (!user) return { ok: false, error: null };
  } catch (error) {
    return { ok: false, error: error.message };
  }

  try {
    await addDoc(collection(db, 'posts', postId, 'comments'), {
      authorUid: user.uid,
      authorName: user.displayName || '식탁친구',
      text: trimmed,
      status: 'visible',
      createdAt: serverTimestamp()
    });
    return { ok: true };
  } catch (error) {
    console.error('[feed] 댓글 작성 실패:', error);
    return { ok: false, error: '댓글을 남기지 못했어요.' };
  }
}

export async function deleteComment(postId, commentId) {
  if (!FIREBASE_READY || !db) return false;
  try {
    await deleteDoc(doc(db, 'posts', postId, 'comments', commentId));
    return true;
  } catch (error) {
    console.error('[feed] 댓글 삭제 실패:', error);
    return false;
  }
}

// ─── 저장(북마크) ───
// 메뉴를 찜하는 기존 기능과는 별개다. 이건 "게시물"을 저장한다.

export async function toggleSavePost(post) {
  if (!FIREBASE_READY || !db) return { ok: false, error: '저장 기능이 설정되지 않았어요.' };

  let user;
  try {
    user = await requireAuth('게시물을 저장하려면 로그인이 필요해요');
    if (!user) return { ok: false, error: null };
  } catch (error) {
    return { ok: false, error: error.message };
  }

  const ref = doc(db, 'users', user.uid, 'savedPosts', post.id);
  try {
    const snapshot = await getDoc(ref);
    if (snapshot.exists()) {
      await deleteDoc(ref);
      return { ok: true, saved: false };
    }
    // 게시물이 지워져도 목록에 남길 최소 정보를 함께 저장한다
    await setDoc(ref, {
      menuName: post.menuName || '',
      photoUrl: post.photoUrl || null,
      savedAt: serverTimestamp()
    });
    return { ok: true, saved: true };
  } catch (error) {
    console.error('[feed] 저장 실패:', error);
    return { ok: false, error: '저장하지 못했어요.' };
  }
}

export async function fetchSavedPostIds() {
  if (!FIREBASE_READY || !db) return new Set();
  const user = getCurrentUser();
  if (!user) return new Set();
  try {
    const snapshot = await getDocs(collection(db, 'users', user.uid, 'savedPosts'));
    return new Set(snapshot.docs.map(d => d.id));
  } catch (error) {
    return new Set();
  }
}

window.feedPosts = {
  publish: publishRecord,
  unpublish: unpublishRecord,
  isPublished: isRecordPublished,
  fetchRecent: fetchRecentPosts,
  fetchMine: fetchMyPosts,
  search: searchPostsByMenu,
  comments: { list: fetchComments, add: addComment, remove: deleteComment, count: countComments },
  toggleSave: toggleSavePost,
  savedIds: fetchSavedPostIds,
  setVisibility: setPostVisibility,
  updateMemo: updatePostMemo,
  remove: deletePost
};
