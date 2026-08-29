# Firestore 색인 가이드

---

## 1. 왜 필요한가

Firestore는 **모든 쿼리가 색인을 사용해야** 실행됩니다.
색인 없이 전체 문서를 훑는 동작 자체가 없어서, 데이터가 100만 건이든 10건이든
쿼리 속도가 같은 대신 색인이 없으면 **쿼리가 아예 실패**합니다.

### 자동으로 생기는 것 (단일 필드 색인)
필드 하나만 쓰는 쿼리는 Firestore가 알아서 색인을 만듭니다.

```javascript
where('status', '==', 'visible')          // OK, 자동
orderBy('createdAt', 'desc')              // OK, 자동
```

### 직접 만들어야 하는 것 (복합 색인)
**서로 다른 필드에 필터와 정렬을 같이 걸면** 복합 색인이 필요합니다.

```javascript
where('status', '==', 'visible')          // status로 필터
orderBy('createdAt', 'desc')              // createdAt으로 정렬  ← 복합 색인 필요
```

이게 이 앱에서 색인이 필요한 이유입니다.

---

## 2. 이 앱에 필요한 색인 4개

| # | 컬렉션 | 필드 | 쓰는 곳 | 없으면 |
|---|---|---|---|---|
| 1 | `posts` | status (오름) + createdAt (**내림**) | 피드 목록 | 피드가 안 뜸 |
| 2 | `posts` | status (오름) + menuName (오름) | 메뉴 검색 | 검색 결과 없음 |
| 3 | `posts` | authorUid (오름) + createdAt (**내림**) | 내 게시물 | 내 글 목록 실패 |
| 4 | `comments` | status (오름) + createdAt (오름) | 댓글 목록 | 댓글이 안 보임 |

**정렬 방향이 중요합니다.** `createdAt`이 1·3번은 내림차순(최신순),
4번은 오름차순(오래된 댓글부터)입니다. 방향이 다르면 별개의 색인입니다.

### 색인이 필요 없는 쿼리
필터나 정렬이 없는 단순 조회는 색인이 필요 없습니다.

```javascript
getDocs(collection(db, 'posts', postId, 'likes'))            // 좋아요 목록
getDocs(collection(db, 'users', uid, 'savedPosts'))          // 저장 목록
getDocs(collection(db, 'users', uid, 'blockedUsers'))        // 차단 목록
```

---

## 3. 만드는 방법 3가지

### 방법 A — 파일로 배포 (권장)

`firestore.indexes.json`이 저장소에 있고 `firebase.json`에 연결되어 있습니다.

```bash
firebase deploy --only firestore:indexes
```

한 번에 4개가 모두 생성됩니다. 저장소에 남으므로 다른 환경에서도 재현됩니다.

규칙과 함께 배포하려면:
```bash
firebase deploy --only firestore
```

### 방법 B — 오류 링크 클릭 (가장 쉬움)

색인 없이 앱을 실행하면 브라우저 콘솔에 이런 오류가 뜹니다.

```
FirebaseError: The query requires an index. You can create it here:
https://console.firebase.google.com/project/todays-plate/firestore/indexes?create_composite=...
```

이 링크를 클릭하면 **필요한 필드가 미리 채워진 상태**로 생성 화면이 열립니다.
"만들기"만 누르면 됩니다.

단점: 각 쿼리를 한 번씩 실행해봐야 링크가 나옵니다.
즉 피드도 열어보고, 검색도 해보고, 댓글도 열어봐야 4개가 다 나옵니다.

### 방법 C — 콘솔에서 수동 생성

Firebase 콘솔 → Firestore Database → **색인** 탭 → 복합 → 색인 만들기

1번 색인 예시:
- 컬렉션 ID: `posts`
- 필드: `status` 오름차순, `createdAt` 내림차순
- 쿼리 범위: **컬렉션**

4번(댓글)은 하위 컬렉션이라 헷갈릴 수 있는데:
- 컬렉션 ID: `comments`
- 쿼리 범위: **컬렉션** (컬렉션 그룹 아님)

---

## 4. 생성 후 확인

Firebase 콘솔 → Firestore → 색인 탭에서 상태를 봅니다.

| 상태 | 의미 |
|---|---|
| 빌드 중 | 아직 못 씀. 기존 데이터가 많으면 수 분~수십 분 |
| 사용 설정됨 | 준비 완료 |
| 오류 | 정의가 잘못됨. 삭제 후 다시 생성 |

**데이터가 거의 없는 초기에는 몇 초 만에 끝납니다.**
베타 시작 전에 미리 만들어 두는 게 좋습니다.

---

## 5. 자주 겪는 문제

**색인을 만들었는데도 오류가 난다**
→ 정렬 방향이 다를 가능성이 큽니다. `createdAt DESC`와 `ASC`는 별개입니다.
콘솔의 오류 링크로 다시 만들면 확실합니다.

**`firebase deploy --only firestore:indexes`가 기존 색인을 지운다**
→ 파일에 없는 색인은 삭제 여부를 CLI가 묻습니다. 콘솔에서 수동으로 만든 것이
파일에 없으면 지워지므로, **파일 기반으로 통일**하는 편이 안전합니다.

**쿼리를 바꿨더니 갑자기 실패한다**
→ 필드나 정렬을 바꾸면 새 색인이 필요합니다. 코드 수정 시
`firestore.indexes.json`도 함께 갱신하세요.

---

## 6. 비용

색인은 **저장 용량을 차지하고 쓰기 비용을 늘립니다.**
문서를 하나 쓸 때마다 관련 색인이 전부 갱신되기 때문입니다.

지금 4개 수준은 부담이 없지만, 쓰지 않는 색인은 삭제하는 편이 좋습니다.
특히 컬렉션 그룹 색인은 비용이 더 큽니다.
