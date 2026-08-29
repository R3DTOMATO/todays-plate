# GROUP TABLE — 그룹 투표 기능 설계

> 방식: **A(링크 기반, 로그인 불필요)로 구현하되 B(친구 계정) 확장을 막지 않는 스키마**
> 대상: `index.html`의 `panel-group` (기존 UI 재사용)

---

## 1. 설계 원칙

1. **참여자는 회원가입하지 않는다.** 링크를 열고 이름만 입력하면 투표할 수 있다.
2. **모든 참여자는 Firebase 익명 인증(Anonymous Auth)으로 식별한다.**
   - 로그인 화면이 뜨지 않지만 각 기기는 고유 uid를 가짐 → 중복 투표 방지, 재방문 시 내 투표 표시
3. **나중에 계정을 붙일 때 데이터를 옮기지 않아도 되게 만든다.**
   - 익명 uid는 Firebase에서 정식 계정으로 **승격(link)** 이 가능하다.
   - 즉 나중에 회원가입을 넣어도 기존 투표 이력이 그대로 그 계정에 붙는다.
   - 이것이 A→B 확장의 핵심이며, 이 때문에 처음부터 익명 인증을 쓴다.
4. **세션 ID는 추측 불가능해야 한다.** 링크를 아는 사람만 접근하므로 ID가 곧 접근 권한이다.

---

## 2. Firestore 스키마

```text
voteSessions/{sessionId}          # sessionId = 12자 랜덤 문자열 (추측 불가)
  title: string                   # "오늘 저녁, 뭐 먹지?"
  candidates: [                   # 주최자가 고른 메뉴 후보 2~5개
    { menuId: string, menuName: string, emoji: string, area: string|null }
  ]
  hostUid: string                 # 주최자의 (익명) uid
  hostName: string                # 주최자가 입력한 표시 이름
  createdAt: timestamp
  closesAt: timestamp             # 마감 시각
  status: 'open' | 'closed'
  winnerMenuId: string | null     # 마감 후 확정된 1위

  # ── B(친구 계정) 확장 대비 필드 ──
  ownerAccountUid: string | null  # 정식 계정 도입 후 주최자 계정 uid
  groupId: string | null          # 저장된 친구 그룹에서 만든 경우 그 그룹 id

voteSessions/{sessionId}/participants/{uid}   # 문서 ID = 참여자 익명 uid
  name: string                    # 참여자가 입력한 이름
  votedMenuId: string | null
  votedAt: timestamp | null
  joinedAt: timestamp

  # ── B 확장 대비 ──
  accountUid: string | null       # 익명 uid가 계정으로 승격되면 채움
```

### 왜 participants를 하위 컬렉션으로 두는가
- 문서 ID를 uid로 두면 **한 사람이 한 표만** 던지도록 구조적으로 보장된다.
- 투표수는 참여자 문서를 읽어 클라이언트에서 집계한다(그룹 규모가 작으므로 충분).
  참여자가 수십 명 이상으로 커지면 그때 Cloud Functions 집계로 옮긴다.

### B로 확장할 때 바뀌는 것
- `users/{uid}/friends/{friendUid}` 컬렉션 추가
- `groups/{groupId}` 컬렉션 추가 (자주 함께 먹는 멤버 묶음)
- `voteSessions`에 `groupId`를 채워서 생성
- **기존 세션·투표 데이터는 그대로 유효** — 마이그레이션 불필요

---

## 3. Firestore 보안 규칙

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    match /voteSessions/{sessionId} {
      // 링크(=sessionId)를 아는 사람은 읽을 수 있다
      allow read: if request.auth != null;

      // 로그인(익명 포함)한 사용자는 세션을 만들 수 있다
      allow create: if request.auth != null
                    && request.resource.data.hostUid == request.auth.uid
                    && request.resource.data.candidates.size() >= 2
                    && request.resource.data.candidates.size() <= 5;

      // 세션 수정은 주최자만 (마감/취소)
      allow update: if request.auth != null
                    && resource.data.hostUid == request.auth.uid;

      allow delete: if false;

      match /participants/{participantUid} {
        allow read: if request.auth != null;

        // 자기 자신의 참여 문서만 생성·수정 가능 → 대리 투표·중복 투표 차단
        allow create, update: if request.auth != null
                              && request.auth.uid == participantUid
                              && get(/databases/$(database)/documents/voteSessions/$(sessionId)).data.status == 'open';

        allow delete: if false;
      }
    }
  }
}
```

**주의:** `allow read: if request.auth != null` 은 "링크를 아는 사람만 읽는다"를 규칙으로 강제하지
못한다(세션 ID를 알면 누구나 읽음). 세션 ID를 12자 랜덤으로 만드는 이유가 이것이다.
민감한 내용이 아니므로 이 수준으로 충분하지만, 더 엄격히 하려면 참여자 목록에 있는
uid만 읽게 제한할 수 있다(단, 처음 들어오는 사람이 못 읽는 문제가 생기므로 별도 join 플로우 필요).

---

## 4. URL 구조

기존 앱에는 해시/쿼리 라우팅이 없으므로 진입점만 추가한다.

```
https://<도메인>/?vote=<sessionId>
```

- 앱 시작 시 `?vote=` 파라미터가 있으면 곧바로 `panel-group`을 열고 해당 세션을 로드
- 없으면 기존 동작 그대로

---

## 5. 화면 흐름

```
[주최자]
홈 → "친구들과 함께 고르기"
 → 메뉴 후보 고르기 (추천 결과 / 찜 목록 / 검색에서 2~5개 선택)
 → 마감 시간 설정 (30분 / 1시간 / 직접 입력)
 → 내 이름 입력
 → 세션 생성 → 공유 링크 발급 → 카카오톡/링크 복사

[참여자]
링크 클릭 → 앱 열림 (설치 불필요, 웹으로 동작)
 → 이름 입력
 → 후보 중 하나 선택 → 투표
 → 실시간으로 다른 사람 투표 반영됨

[마감]
마감 시각 도달 → status='closed', 1위 확정
 → "1위 메뉴 근처 식당 보기" → 기존 nearby 패널로 연결 (이미 구현된 기능 재사용)
```

---

## 6. 기존 UI에서 바꿔야 할 것

`index.html`의 `panel-group`은 디자인은 그대로 쓰되, 하드코딩된 값을 실제 데이터로 교체한다.

| 현재 (하드코딩) | 변경 후 |
|---|---|
| `7명 중 5명 참여 · 오늘 6:30 마감` | 참여자 수 / 마감 시각을 세션 데이터에서 렌더 |
| 아바타 `재 민 수 하 윤 +2` | 실제 참여자 이름 첫 글자로 생성 |
| 후보 3개 및 표수 하드코딩 | `candidates` + 실시간 집계 결과 |
| `제육볶음이 1표 앞서고 있어요` | 실시간 1위 계산 결과 |
| `submitGroupVote()` → localStorage | Firestore participants 문서 write |

---

## 7. 구현 순서

1. Firebase 프로젝트 생성 + 익명 인증 활성화 + 위 보안 규칙 배포
2. `js/group-vote.js` 모듈 추가 (아래 코드)
3. `index.html`에 모듈 스크립트 태그 + 세션 생성 화면 마크업 추가
4. `app.js`의 `openGroupVote` / `selectGroupVote` / `submitGroupVote`를 모듈 함수로 교체
5. `?vote=` 진입 처리
6. 마감 처리 (클라이언트에서 시각 비교 → 필요 시 Cloud Functions 스케줄러로 이전)

---

## 8. 이후 B 확장 시 추가 작업 (지금은 안 함)

- 회원가입 UI (`linkWithCredential`로 익명 uid를 정식 계정으로 승격)
- 친구 검색/요청/수락
- 자주 함께 먹는 그룹 저장
- 그룹원에게 푸시 알림으로 투표 요청
- 과거 그룹 투표 이력 조회
