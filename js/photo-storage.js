// ─────────────────────────────────────────────────────────────
// 사진 저장소 — Firebase Storage 업로드
//
// 배경
//  기존 식사 기록은 사진을 base64 dataURL로 localStorage에 넣는다.
//  개인 기록으로는 충분하지만 피드에는 쓸 수 없다.
//   - 다른 사람 기기에서 볼 수 없다
//   - Firestore 문서 크기 한도(1MB)에 근접해 위험하다
//   - CDN 캐싱이 안 되어 피드 스크롤이 느려진다
//  따라서 피드에 공개하는 사진만 Storage로 올리고 URL만 문서에 남긴다.
//
// 설계
//  1. 기존 압축 결과(dataURL)를 그대로 받는다. app.js의 compressMealPhoto를
//     다시 구현하지 않는다.
//  2. 업로드 실패가 기록 저장을 막지 않는다. 사진 없이라도 기록은 남아야 한다.
//  3. 경로에 uid를 포함해 보안 규칙에서 소유자를 검증할 수 있게 한다.
// ─────────────────────────────────────────────────────────────

import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getStorage, ref, uploadBytes, getDownloadURL, deleteObject
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';
import { getCurrentUser, FIREBASE_READY } from './auth.js';

let storage = null;

if (FIREBASE_READY) {
  const app = getApps().length ? getApps()[0] : initializeApp(window.FIREBASE_CONFIG);
  storage = getStorage(app);
}

// Storage 무료 할당량과 피드 로딩 속도를 함께 고려한 상한
const MAX_UPLOAD_BYTES = 800 * 1024;

// ─── dataURL → Blob ───

function dataUrlToBlob(dataUrl) {
  const match = /^data:([^;,]+)(;base64)?,/.exec(dataUrl || '');
  if (!match) throw new Error('사진 형식을 읽지 못했어요.');

  const mime = match[1];
  const isBase64 = Boolean(match[2]);
  const body = dataUrl.slice(match[0].length);

  if (!isBase64) {
    return new Blob([decodeURIComponent(body)], { type: mime });
  }

  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function extensionFor(mime) {
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/png') return 'png';
  return 'jpg';
}

// 파일명이 겹치지 않게 — 같은 사람이 같은 밀리초에 두 장 올려도 안전하도록
function randomId(length = 10) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789';
  return Array.from(bytes, b => alphabet[b % alphabet.length]).join('');
}

// ─── 업로드 ───

/**
 * 피드 공개용 사진을 Storage에 올린다.
 *
 * @param {string} dataUrl app.js의 compressMealPhoto()가 만든 압축 결과
 * @returns {Promise<{url: string, path: string}>}
 */
export async function uploadFeedPhoto(dataUrl) {
  if (!FIREBASE_READY || !storage) {
    throw new Error('사진 업로드 기능이 아직 설정되지 않았어요.');
  }

  const user = getCurrentUser();
  if (!user) throw new Error('사진을 올리려면 로그인이 필요해요.');
  if (!dataUrl) throw new Error('업로드할 사진이 없어요.');

  const blob = dataUrlToBlob(dataUrl);

  // 압축을 거쳤다면 여기 걸릴 일이 거의 없지만, 방어적으로 확인한다
  if (blob.size > MAX_UPLOAD_BYTES) {
    throw new Error('사진 용량이 너무 커요. 다른 사진을 선택해 주세요.');
  }
  if (!blob.type.startsWith('image/')) {
    throw new Error('이미지 파일만 올릴 수 있어요.');
  }

  // 경로에 uid를 넣어야 보안 규칙에서 소유자를 검증할 수 있다
  const path = `feedPhotos/${user.uid}/${Date.now()}-${randomId()}.${extensionFor(blob.type)}`;
  const objectRef = ref(storage, path);

  await uploadBytes(objectRef, blob, {
    contentType: blob.type,
    // 피드 사진은 내용이 바뀌지 않으므로 길게 캐싱한다
    cacheControl: 'public, max-age=31536000, immutable'
  });

  const url = await getDownloadURL(objectRef);
  return { url, path };
}

/**
 * 게시물을 내리거나 공개를 취소할 때 사진도 지운다.
 * 실패해도 예외를 던지지 않는다 — 사진이 남는 것보다 흐름이 막히는 게 더 나쁘다.
 */
export async function deleteFeedPhoto(path) {
  if (!FIREBASE_READY || !storage || !path) return false;
  try {
    await deleteObject(ref(storage, path));
    return true;
  } catch (error) {
    if (error?.code !== 'storage/object-not-found') {
      console.error('[photo] 사진 삭제 실패:', error);
    }
    return false;
  }
}

/**
 * 업로드 오류를 사용자가 읽을 수 있는 문장으로 바꾼다.
 */
export function describeUploadError(error) {
  const messages = {
    'storage/unauthorized': '사진을 올릴 권한이 없어요. 다시 로그인해 주세요.',
    'storage/quota-exceeded': '저장 공간이 가득 찼어요. 잠시 후 다시 시도해 주세요.',
    'storage/retry-limit-exceeded': '네트워크가 불안정해요. 다시 시도해 주세요.',
    'storage/canceled': '업로드를 취소했어요.'
  };
  return messages[error?.code] || error?.message || '사진을 올리지 못했어요.';
}

window.feedPhoto = {
  upload: uploadFeedPhoto,
  remove: deleteFeedPhoto,
  describeError: describeUploadError
};
