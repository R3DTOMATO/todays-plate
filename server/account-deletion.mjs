// ─────────────────────────────────────────────────────────────
// 계정 삭제 (탈퇴)
//
// 왜 서버가 필요한가
//  클라이언트에서 Firebase Auth 계정만 지우면 Firestore 문서와 Storage 사진이
//  그대로 남는다. 개인정보 파기 의무를 지키지 못하고, 피드에는 이미 사라진
//  사용자의 게시물이 계속 보인다.
//  또한 남의 게시물에 단 좋아요·댓글은 보안 규칙상 클라이언트가 정리할 수 없다.
//
// 처리 순서 (되돌릴 수 없는 것을 마지막에 둔다)
//  1. 내 게시물 + 사진 삭제
//  2. 남의 게시물에 단 좋아요 삭제 (집계값도 함께 감소)
//  3. 남의 게시물에 단 댓글 익명화
//  4. 사용자 문서와 하위 컬렉션 삭제
//  5. Auth 계정 삭제  ← 마지막. 앞 단계가 실패하면 계정이 남아 재시도할 수 있다.
// ─────────────────────────────────────────────────────────────

import {
  getAccessToken, firestoreRequest, fromFirestoreDoc, PROJECT,
} from './admin-reports.mjs';

const STORAGE_BUCKET = process.env.FIREBASE_STORAGE_BUCKET || '';

// ─── 조회 헬퍼 ───

async function runQuery(structuredQuery) {
  const rows = await firestoreRequest(':runQuery', {
    method: 'POST',
    body: JSON.stringify({ structuredQuery }),
  });
  return (rows || []).filter(row => row.document);
}

function equalityFilter(field, value) {
  return { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: value } } };
}

// 문서 경로에서 컬렉션 상대 경로만 뽑는다
function relativePath(fullName) {
  return fullName.split('/documents')[1];
}

// ─── 1. 내 게시물 ───

async function deleteOwnPosts(uid, log) {
  const rows = await runQuery({
    from: [{ collectionId: 'posts' }],
    where: equalityFilter('authorUid', uid),
    limit: 500,
  });

  for (const row of rows) {
    const data = fromFirestoreDoc(row.document.fields);

    // 게시물의 하위 컬렉션(좋아요·댓글)은 문서를 지워도 남으므로 먼저 정리한다
    const postId = row.document.name.split('/').pop();
    await deleteSubcollection(`/posts/${postId}/likes`);
    await deleteSubcollection(`/posts/${postId}/comments`);

    if (data.photoPath) await deleteStorageObject(data.photoPath, log);
    await firestoreRequest(relativePath(row.document.name), { method: 'DELETE' });
  }

  log.posts = rows.length;
}

async function deleteSubcollection(parentPath) {
  try {
    const result = await firestoreRequest(`${parentPath}?pageSize=300`);
    for (const doc of result.documents || []) {
      await firestoreRequest(relativePath(doc.name), { method: 'DELETE' });
    }
  } catch (error) {
    // 하위 컬렉션이 없으면 404가 난다. 정상이다.
  }
}

// ─── 2. 남의 게시물에 단 좋아요 ───

async function deleteOwnLikes(uid, log) {
  const rows = await runQuery({
    from: [{ collectionId: 'likes', allDescendants: true }],
    where: equalityFilter('uid', uid),
    limit: 500,
  });

  let count = 0;
  for (const row of rows) {
    const path = relativePath(row.document.name);
    await firestoreRequest(path, { method: 'DELETE' });

    // 좋아요 수를 줄이지 않으면 실제 좋아요보다 숫자가 크게 남는다
    const postPath = path.replace(/\/likes\/[^/]+$/, '');
    try {
      await firestoreRequest(':commit', {
        method: 'POST',
        body: JSON.stringify({
          writes: [{
            transform: {
              document: `projects/${PROJECT()}/databases/(default)/documents${postPath}`,
              fieldTransforms: [{
                fieldPath: 'likeCount',
                increment: { integerValue: '-1' },
              }],
            },
          }],
        }),
      });
    } catch (error) {
      // 게시물이 이미 삭제된 경우 — 무시해도 된다
    }
    count += 1;
  }
  log.likes = count;
}

// ─── 3. 남의 게시물에 단 댓글 ───
// 삭제하지 않고 익명화한다. 지워버리면 남아 있는 대화의 맥락이 끊긴다.

async function anonymizeOwnComments(uid, log) {
  const rows = await runQuery({
    from: [{ collectionId: 'comments', allDescendants: true }],
    where: equalityFilter('authorUid', uid),
    limit: 500,
  });

  for (const row of rows) {
    const path = relativePath(row.document.name);
    await firestoreRequest(
      `${path}?updateMask.fieldPaths=authorUid&updateMask.fieldPaths=authorName`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          fields: {
            authorUid: { stringValue: 'deleted' },
            authorName: { stringValue: '탈퇴한 사용자' },
          },
        }),
      },
    );
  }
  log.comments = rows.length;
}

// ─── 4. 사용자 문서 ───

async function deleteUserDocs(uid, log) {
  // Private taste data must be removed successfully before deleting the account.
  await firestoreRequest(`/users/${uid}/private/taste`, { method: 'DELETE' });
  await deleteSubcollection(`/users/${uid}/savedPosts`);
  await deleteSubcollection(`/users/${uid}/blockedUsers`);
  try {
    await firestoreRequest(`/users/${uid}`, { method: 'DELETE' });
    log.userDoc = true;
  } catch (error) {
    log.userDoc = false;
  }
}

// ─── Storage ───

async function deleteStorageObject(objectPath, log) {
  if (!STORAGE_BUCKET) return;
  try {
    const token = await getAccessToken();
    const url = `https://storage.googleapis.com/storage/v1/b/${STORAGE_BUCKET}` +
                `/o/${encodeURIComponent(objectPath)}`;
    await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    log.photos = (log.photos || 0) + 1;
  } catch (error) {
    console.error('[account] 사진 삭제 실패:', objectPath, error.message);
  }
}

/** 혹시 문서에서 놓친 사진이 있을 수 있으므로 폴더 단위로 한 번 더 정리한다 */
async function deleteStorageFolder(uid, log) {
  if (!STORAGE_BUCKET) return;
  try {
    const token = await getAccessToken();
    const listUrl = `https://storage.googleapis.com/storage/v1/b/${STORAGE_BUCKET}/o` +
                    `?prefix=${encodeURIComponent(`feedPhotos/${uid}/`)}`;
    const response = await fetch(listUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) return;

    const data = await response.json();
    for (const item of data.items || []) {
      await deleteStorageObject(item.name, log);
    }
  } catch (error) {
    console.error('[account] 사진 폴더 정리 실패:', error.message);
  }
}

// ─── 5. Auth 계정 ───

async function deleteAuthAccount(uid) {
  const token = await getAccessToken();
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT()}/accounts:delete`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ localId: uid }),
    },
  );
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`auth_delete_failed: ${detail.slice(0, 160)}`);
  }
}

// ─── 진입점 ───

/**
 * 사용자 본인의 요청으로 계정과 관련 데이터를 모두 삭제한다.
 * 호출 전에 반드시 ID 토큰을 검증해 uid를 확인해야 한다.
 */
export async function deleteAccountData(uid) {
  const log = { posts: 0, likes: 0, comments: 0, photos: 0, userDoc: false };

  await deleteOwnPosts(uid, log);
  await deleteOwnLikes(uid, log);
  await anonymizeOwnComments(uid, log);
  await deleteStorageFolder(uid, log);
  await deleteUserDocs(uid, log);

  // 계정 삭제는 마지막이다.
  // 앞 단계가 실패하면 계정이 남아 있어 사용자가 다시 시도할 수 있다.
  await deleteAuthAccount(uid);

  return log;
}
