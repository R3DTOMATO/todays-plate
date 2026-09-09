// Retriable cleanup: propagate failures and delete Auth only after all data pages.
import { getAccessToken, firestoreRequest, fromFirestoreDoc, PROJECT } from './admin-reports.mjs';

export function createAccountDeletion(dependencies = {}) {
  const fs = dependencies.firestoreRequest || firestoreRequest;
  const token = dependencies.getAccessToken || getAccessToken;
  const request = dependencies.fetch || globalThis.fetch;
  const project = dependencies.project || PROJECT;
  const bucket = dependencies.bucket ?? process.env.FIREBASE_STORAGE_BUCKET;
  const relative = name => name.split('/documents')[1];
  const missing = error => error.status === 404 || /^firestore_404:/.test(error.message);
  async function read(path) {
    try { return await fs(path); } catch (error) { if (missing(error)) return null; throw error; }
  }
  async function remove(path) {
    try { await fs(path, { method: 'DELETE' }); } catch (error) { if (!missing(error)) throw error; }
  }
  async function rows(collectionId, field, uid, descendants = false) {
    const result = await fs(':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId, ...(descendants ? { allDescendants: true } : {}) }],
      where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: uid } } },
      limit: 500,
    } }) });
    return (result || []).filter(row => row.document);
  }
  async function drainCollection(path) {
    // Each successful page is removed; restarting at the beginning is retry-safe.
    for (;;) {
      const page = await read(`${path}?pageSize=300`);
      const documents = page?.documents || [];
      if (!documents.length) return;
      for (const item of documents) await remove(relative(item.name));
    }
  }
  async function storage(path, options = {}) {
    const response = await request(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}${path}`, {
      ...options, headers: { Authorization: `Bearer ${await token()}` },
    });
    if (!response.ok && !(options.method === 'DELETE' && response.status === 404)) {
      throw new Error(`storage_${response.status}: cleanup failed`);
    }
    return response;
  }
  async function removePhoto(path, uid, log) {
    if (!path.startsWith(`feedPhotos/${uid}/`)) throw new Error('invalid_owned_photo_path');
    const response = await storage(`/o/${encodeURIComponent(path)}`, { method: 'DELETE' });
    if (response.ok) log.photos++;
  }
  async function removeLike(name) {
    const likePath = relative(name);
    const parentPath = likePath.replace(/\/likes\/[^/]+$/, '');
    for (let attempt = 0; attempt < 5; attempt++) {
      const like = await read(likePath);
      if (!like) return;
      const post = await read(parentPath);
      const writes = [{ delete: name, currentDocument: { updateTime: like.updateTime } }];
      if (post) writes.push({
        update: { name: post.name, fields: { likeCount: { integerValue: String(Math.max(0, Number(fromFirestoreDoc(post.fields).likeCount || 0) - 1)) } } },
        updateMask: { fieldPaths: ['likeCount'] }, currentDocument: { updateTime: post.updateTime },
      });
      try {
        await fs(':commit', { method: 'POST', body: JSON.stringify({ writes }) });
        return;
      } catch (error) {
        if (attempt === 4 || !/firestore_(409|400|404):/.test(error.message)) throw error;
      }
    }
  }
  return async function deleteAccountData(uid) {
    if (!uid || /\//.test(uid)) throw new Error('invalid_uid');
    // Without a bucket, orphan photos cannot be checked; never report success.
    if (!bucket) throw new Error('storage_bucket_not_configured');
    const log = { posts: 0, likes: 0, comments: 0, photos: 0, userDoc: false };
    // Keep a server-only marker through Auth deletion so existing sessions cannot
    // create new data during cleanup. A failed attempt can use the same token to retry.
    await fs(`/accountDeletions/${uid}`, { method: 'PATCH', body: JSON.stringify({ fields: { active: { booleanValue: true } } }) });
    for (;;) {
      const page = await rows('posts', 'authorUid', uid);
      if (!page.length) break;
      for (const { document } of page) {
        const path = relative(document.name);
        const data = fromFirestoreDoc(document.fields);
        await fs(`${path}?updateMask.fieldPaths=status&currentDocument.exists=true`, { method: 'PATCH', body: JSON.stringify({ fields: { status: { stringValue: 'deleting' } } }) });
        await drainCollection(`${path}/likes`);
        await drainCollection(`${path}/comments`);
        if (data.photoPath) await removePhoto(data.photoPath, uid, log);
        await remove(path);
        log.posts++;
      }
    }
    for (;;) {
      const page = await rows('likes', 'uid', uid, true);
      if (!page.length) break;
      for (const { document } of page) { await removeLike(document.name); log.likes++; }
    }
    for (;;) {
      const page = await rows('comments', 'authorUid', uid, true);
      if (!page.length) break;
      for (const { document } of page) {
        await fs(`${relative(document.name)}?updateMask.fieldPaths=authorUid&updateMask.fieldPaths=authorName&currentDocument.exists=true`, {
          method: 'PATCH', body: JSON.stringify({ fields: { authorUid: { stringValue: 'deleted' }, authorName: { stringValue: '탈퇴한 사용자' } } }),
        });
        log.comments++;
      }
    }
    let pageToken = '';
    do {
      const response = await storage(`/o?prefix=${encodeURIComponent(`feedPhotos/${uid}/`)}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`);
      const page = await response.json();
      for (const item of page.items || []) await removePhoto(item.name, uid, log);
      pageToken = page.nextPageToken || '';
    } while (pageToken);
    await drainCollection(`/users/${uid}/private`);
    await drainCollection(`/users/${uid}/savedPosts`);
    await drainCollection(`/users/${uid}/blockedUsers`);
    await remove(`/users/${uid}`);
    log.userDoc = true;
    const response = await request(`https://identitytoolkit.googleapis.com/v1/projects/${project()}/accounts:delete`, {
      method: 'POST', headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ localId: uid }),
    });
    if (!response.ok) throw new Error(`auth_delete_failed: ${response.status}`);
    return log;
  };
}

export const deleteAccountData = createAccountDeletion();
