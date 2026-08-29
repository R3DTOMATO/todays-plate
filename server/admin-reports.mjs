// ─────────────────────────────────────────────────────────────
// 신고 검토 관리자 API
//
// 배경
//  Firestore 규칙에서 reports 컬렉션은 클라이언트가 읽을 수 없다(신고자 보호).
//  따라서 검토는 Admin SDK 권한이 있는 서버에서만 가능하다.
//
// 인증
//  1. 관리자가 앱과 같은 Firebase 계정으로 로그인해 ID 토큰을 받는다.
//  2. 이 서버가 토큰을 검증하고, ADMIN_UIDS 목록에 있는지 확인한다.
//  비밀번호를 따로 두지 않는 이유는, 별도 자격증명을 만들면 관리가 하나 더 늘고
//  유출 지점도 늘기 때문이다.
//
// 필요한 환경변수
//  FIREBASE_PROJECT_ID
//  FIREBASE_CLIENT_EMAIL
//  FIREBASE_PRIVATE_KEY   ← 서비스 계정 비공개 키. 절대 저장소에 커밋하지 않는다.
//  ADMIN_UIDS             ← 쉼표로 구분한 관리자 uid 목록
// ─────────────────────────────────────────────────────────────

import { createSign, createPublicKey, createVerify } from 'node:crypto';

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || '';
const CLIENT_EMAIL = process.env.FIREBASE_CLIENT_EMAIL || '';
// Railway 환경변수는 줄바꿈을 \n 문자열로 저장하므로 복원한다
const PRIVATE_KEY = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
const ADMIN_UIDS = new Set(
  (process.env.ADMIN_UIDS || '').split(',').map(v => v.trim()).filter(Boolean),
);

export const adminConfigured = Boolean(PROJECT_ID && CLIENT_EMAIL && PRIVATE_KEY && ADMIN_UIDS.size);

// ─── 구글 공개키 캐시 (ID 토큰 검증용) ───

let googleKeys = null;
let googleKeysExpireAt = 0;

async function getGoogleKeys() {
  if (googleKeys && Date.now() < googleKeysExpireAt) return googleKeys;

  const response = await fetch(
    'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com',
  );
  if (!response.ok) throw new Error('google_keys_unavailable');

  googleKeys = await response.json();
  // Cache-Control의 max-age를 존중한다. 없으면 1시간.
  const cacheControl = response.headers.get('cache-control') || '';
  const maxAge = Number(/max-age=(\d+)/.exec(cacheControl)?.[1] || 3600);
  googleKeysExpireAt = Date.now() + maxAge * 1000;
  return googleKeys;
}

// ─── ID 토큰 검증 ───

function base64UrlDecode(input) {
  return Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

/**
 * Firebase ID 토큰을 검증하고 uid를 반환한다.
 * 라이브러리 없이 직접 검증한다 (이 서버는 의존성이 없는 구조를 유지한다).
 */
export async function verifyIdToken(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error('invalid_token_format');

  const header = JSON.parse(base64UrlDecode(parts[0]).toString('utf8'));
  const payload = JSON.parse(base64UrlDecode(parts[1]).toString('utf8'));

  if (header.alg !== 'RS256') throw new Error('unexpected_algorithm');

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp <= now) throw new Error('token_expired');
  if (payload.iat > now + 60) throw new Error('token_issued_in_future');
  if (payload.aud !== PROJECT_ID) throw new Error('audience_mismatch');
  if (payload.iss !== `https://securetoken.google.com/${PROJECT_ID}`) throw new Error('issuer_mismatch');
  if (!payload.sub) throw new Error('missing_subject');

  const keys = await getGoogleKeys();
  const certificate = keys[header.kid];
  if (!certificate) throw new Error('unknown_key_id');

  const verifier = createVerify('RSA-SHA256');
  verifier.update(`${parts[0]}.${parts[1]}`);
  verifier.end();

  const publicKey = createPublicKey(certificate);
  if (!verifier.verify(publicKey, base64UrlDecode(parts[2]))) {
    throw new Error('signature_invalid');
  }

  return payload.sub;
}

export function isAdmin(uid) {
  return ADMIN_UIDS.has(uid);
}

// ─── 서비스 계정 액세스 토큰 (Firestore REST 호출용) ───

let accessToken = null;
let accessTokenExpireAt = 0;

export async function getAccessToken() {
  if (accessToken && Date.now() < accessTokenExpireAt - 60_000) return accessToken;

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: CLIENT_EMAIL,
    scope: [
      'https://www.googleapis.com/auth/datastore',
      'https://www.googleapis.com/auth/identitytoolkit',
      'https://www.googleapis.com/auth/devstorage.full_control',
    ].join(' '),
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };

  const encode = obj => Buffer.from(JSON.stringify(obj))
    .toString('base64url');
  const unsigned = `${encode(header)}.${encode(claim)}`;

  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const jwt = `${unsigned}.${signer.sign(PRIVATE_KEY).toString('base64url')}`;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!response.ok) {
    throw new Error(`access_token_failed_${response.status}`);
  }

  const data = await response.json();
  accessToken = data.access_token;
  accessTokenExpireAt = Date.now() + Number(data.expires_in || 3600) * 1000;
  return accessToken;
}

// ─── Firestore REST 헬퍼 ───

export const PROJECT = () => PROJECT_ID;

const FS_BASE = () =>
  `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

export async function firestoreRequest(path, options = {}) {
  const token = await getAccessToken();
  const response = await fetch(`${FS_BASE()}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`firestore_${response.status}: ${detail.slice(0, 200)}`);
  }
  return response.status === 204 ? null : response.json();
}

// Firestore REST의 값 표현을 평범한 JS 값으로 바꾼다
function fromFirestoreValue(value) {
  if (!value || typeof value !== 'object') return null;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('booleanValue' in value) return value.booleanValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('nullValue' in value) return null;
  if ('mapValue' in value) return fromFirestoreDoc(value.mapValue.fields || {});
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(fromFirestoreValue);
  return null;
}

export function fromFirestoreDoc(fields) {
  const output = {};
  for (const [key, value] of Object.entries(fields || {})) {
    output[key] = fromFirestoreValue(value);
  }
  return output;
}

// ─── 신고 조회 ───

export async function listReports(status = 'pending', limit = 50) {
  const body = {
    structuredQuery: {
      from: [{ collectionId: 'reports' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'status' },
          op: 'EQUAL',
          value: { stringValue: status },
        },
      },
      orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }],
      limit,
    },
  };

  const result = await firestoreRequest(':runQuery', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  return (result || [])
    .filter(row => row.document)
    .map(row => ({
      id: row.document.name.split('/').pop(),
      ...fromFirestoreDoc(row.document.fields),
    }));
}

/** 신고 대상 원문을 함께 보여줘야 판단할 수 있다 */
export async function fetchTarget(targetType, targetId, parentId = '') {
  try {
    if (targetType === 'post') {
      const doc = await firestoreRequest(`/posts/${encodeURIComponent(targetId)}`);
      return fromFirestoreDoc(doc.fields);
    }
    if (targetType === 'user') {
      const doc = await firestoreRequest(`/users/${encodeURIComponent(targetId)}`);
      return fromFirestoreDoc(doc.fields);
    }
    // 댓글은 신고 시 저장한 parentId(상위 게시물)로 바로 찾는다.
    if (targetType === 'comment') {
      if (!parentId) return null;
      const path = `/posts/${encodeURIComponent(parentId)}/comments/${encodeURIComponent(targetId)}`;
      const doc = await firestoreRequest(path);
      return { ...fromFirestoreDoc(doc.fields), _path: doc.name };
    }
  } catch (error) {
    return null;
  }
  return null;
}

// ─── 조치 ───

/** 게시물 숨김 — 삭제하지 않는다. 오판이었을 때 되돌릴 수 있어야 한다. */
export async function hidePost(postId) {
  await firestoreRequest(
    `/posts/${encodeURIComponent(postId)}?updateMask.fieldPaths=status`,
    {
      method: 'PATCH',
      body: JSON.stringify({ fields: { status: { stringValue: 'hidden' } } }),
    },
  );
}

export async function restorePost(postId) {
  await firestoreRequest(
    `/posts/${encodeURIComponent(postId)}?updateMask.fieldPaths=status`,
    {
      method: 'PATCH',
      body: JSON.stringify({ fields: { status: { stringValue: 'visible' } } }),
    },
  );
}

export async function hideComment(commentPath) {
  // commentPath는 projects/.../documents/posts/{id}/comments/{id} 형태
  const relative = commentPath.split('/documents')[1];
  await firestoreRequest(`${relative}?updateMask.fieldPaths=status`, {
    method: 'PATCH',
    body: JSON.stringify({ fields: { status: { stringValue: 'removed' } } }),
  });
}

/** 신고 처리 상태 갱신 */
export async function resolveReport(reportId, status, note = '', adminUid = '') {
  await firestoreRequest(
    `/reports/${encodeURIComponent(reportId)}` +
      '?updateMask.fieldPaths=status&updateMask.fieldPaths=reviewedAt' +
      '&updateMask.fieldPaths=reviewedBy&updateMask.fieldPaths=reviewNote',
    {
      method: 'PATCH',
      body: JSON.stringify({
        fields: {
          status: { stringValue: status },
          reviewedAt: { timestampValue: new Date().toISOString() },
          reviewedBy: { stringValue: adminUid },
          reviewNote: { stringValue: String(note || '').slice(0, 300) },
        },
      }),
    },
  );
}

/** 같은 대상에 대한 신고 건수 — 반복 신고된 것을 먼저 보기 위함 */
export async function countReportsForTarget(targetType, targetId) {
  const body = {
    structuredQuery: {
      from: [{ collectionId: 'reports' }],
      where: {
        compositeFilter: {
          op: 'AND',
          filters: [
            { fieldFilter: { field: { fieldPath: 'targetType' }, op: 'EQUAL', value: { stringValue: targetType } } },
            { fieldFilter: { field: { fieldPath: 'targetId' }, op: 'EQUAL', value: { stringValue: targetId } } },
          ],
        },
      },
      limit: 100,
    },
  };
  const rows = await firestoreRequest(':runQuery', { method: 'POST', body: JSON.stringify(body) });
  return (rows || []).filter(r => r.document).length;
}
