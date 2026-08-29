# Firestore 보안 규칙 적용 가이드

규칙 파일: 저장소 루트의 `firestore.rules`

---

## 왜 중요한가

Firebase의 웹 API 키는 공개되어도 안전하지만, **데이터 보호는 전적으로 이 규칙이 담당합니다.**
규칙이 테스트 모드로 열려 있으면 누구나 브라우저 콘솔만으로 전체 데이터를 읽고 지울 수 있습니다.

콘솔 → Firestore Database → 규칙 탭에서 현재 상태를 먼저 확인하세요.

```javascript
// (A) 테스트 모드 — 만료일까지 전면 개방. 만료되면 앱이 갑자기 멈춘다.
allow read, write: if request.time < timestamp.date(2026, 9, 28);

// (B) 잠금 모드 — 전면 차단. 앱이 동작하지 않는다.
allow read, write: if false;
```

둘 다 배포에 쓸 수 없습니다.

---

## 적용 방법 1 — 콘솔에 붙여넣기 (간단)

1. Firebase 콘솔 → Firestore Database → **규칙** 탭
2. 기존 내용을 전부 지우고 `firestore.rules` 내용을 붙여넣기
3. **게시** 클릭

---

## 적용 방법 2 — CLI로 배포 (권장, 버전 관리됨)

`firebase.json`에 이미 연결해 두었습니다.

```bash
npm install -g firebase-tools
firebase login
firebase deploy --only firestore:rules
```

이 방식은 규칙이 저장소에 남아 변경 이력을 추적할 수 있습니다.

---

## 규칙이 보장하는 것

| 항목 | 동작 |
|---|---|
| 비로그인 사용자 | 아무것도 읽거나 쓸 수 없음 |
| 남의 프로필 수정 | 차단 (`isSelf` 검사) |
| 남의 이름으로 투표 | 차단 (문서 ID = uid) |
| 중복 투표 | 구조적으로 불가능 (1인 1문서) |
| 마감 후 투표 | 차단 (`closesAt > request.time`) |
| 주최자 아닌 사람이 마감 | 차단 |
| 문서 삭제 | 전면 차단 |
| 정의되지 않은 컬렉션 | 전면 차단 (기본 거부) |

---

## 테스트

콘솔 규칙 탭의 **규칙 놀이터(Rules Playground)** 에서 검증할 수 있습니다.

확인해 볼 시나리오:

| 시뮬레이션 | 기대 결과 |
|---|---|
| 인증 없이 `/users/abc` 읽기 | 거부 |
| uid `abc`로 `/users/abc` 쓰기 | 허용 |
| uid `abc`로 `/users/xyz` 쓰기 | 거부 |
| uid `abc`로 `/voteSessions/s1/participants/xyz` 쓰기 | 거부 |

---

## 소셜 피드 도입 시 추가할 규칙

피드는 아직 구현 전이므로 규칙에 넣지 않았습니다.
(존재하지 않는 컬렉션을 미리 열어두면 스팸 작성이 가능해집니다.)

피드를 출시할 때 아래를 `firestore.rules`에 추가하세요.

```javascript
// ─── 소셜 피드 ───
match /posts/{postId} {
  allow read: if isSignedIn()
              && resource.data.status == 'visible';

  allow create: if isSignedIn()
                && request.resource.data.authorUid == request.auth.uid
                && request.resource.data.status == 'visible'
                && request.resource.data.likeCount == 0
                && request.resource.data.reportCount == 0
                && request.resource.data.memo.size() <= 300;

  // 작성자는 본문만 수정 가능. 좋아요/신고 수는 조작할 수 없다.
  allow update: if isSignedIn()
                && resource.data.authorUid == request.auth.uid
                && request.resource.data.diff(resource.data)
                     .affectedKeys().hasOnly(['memo', 'photoUrl']);

  allow delete: if isSignedIn()
                && resource.data.authorUid == request.auth.uid;

  match /likes/{uid} {
    allow read: if isSignedIn();
    allow create, delete: if isSelf(uid);
    allow update: if false;
  }

  match /comments/{commentId} {
    allow read: if isSignedIn() && resource.data.status == 'visible';
    allow create: if isSignedIn()
                  && request.resource.data.authorUid == request.auth.uid
                  && request.resource.data.text.size() <= 300;
    allow update, delete: if isSignedIn()
                          && resource.data.authorUid == request.auth.uid;
  }
}

// 신고 — 본인이 낸 신고도 다시 읽을 수 없다(신고자 보호).
// 검토는 관리자 도구(Admin SDK)에서만 한다.
match /reports/{reportId} {
  allow read: if false;
  allow create: if isSignedIn()
                && request.resource.data.reporterUid == request.auth.uid
                && request.resource.data.status == 'pending';
  allow update, delete: if false;
}

// 차단 목록 — 본인만 접근
match /users/{userId}/blockedUsers/{blockedUid} {
  allow read, create, delete: if isSelf(userId);
  allow update: if false;
}
```

**주의:** `likeCount` / `reportCount` 는 클라이언트가 직접 못 바꾸게 막았습니다.
집계는 Cloud Functions에서 처리해야 합니다. 그렇지 않으면 좋아요 수를 임의로 조작할 수 있습니다.

---

## 함께 수정된 것: CSP

`firebase.json`의 Content-Security-Policy가 Firebase를 차단하고 있어 함께 고쳤습니다.

- `script-src`에 `https://www.gstatic.com` 추가 — 없으면 **Firebase SDK 자체가 로드되지 않습니다**
- `frame-src` 추가 — 없으면 구글/애플 로그인 팝업이 뜨지 않습니다
- `img-src`에 프로필 사진·Storage 도메인 추가

이 수정 없이 배포하면 로그인이 전혀 동작하지 않습니다.
