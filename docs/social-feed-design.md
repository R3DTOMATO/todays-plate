# 탐색 탭 → 소셜 피드 개편 설계

> 기존 `panel-favorites`(음식 탐색: 검색/상세/찜)를 사용자 게시물 기반 소셜 피드로 전환한다.
> 피드 정렬은 **음식 취향 기반 개인화**로 한다.

---

## 1. 핵심 설계 결정

### 1.1 게시물은 식사 기록에서 나온다 (콜드 스타트 해법)

앱에는 이미 식사 기록(diary) 기능이 있고, 레코드에 다음이 모두 들어 있다.

```
{ menu, photoDataUrl, memo, satisfaction, eatAgain, amount, time, dateTime }
```

**이것이 그대로 게시물의 재료다.** 별도 작성 화면을 새로 만드는 대신,
기존 식사 기록 모달에 **"피드에 공개" 토글 하나**를 추가한다.

이유:
- 사용자가 이미 하고 있던 행동에 얹으므로 게시물 공급이 즉시 발생한다
- "SNS에 올릴 글을 쓴다"는 부담이 없다 (기록하다가 체크 하나)
- 사진·메뉴·평점이 이미 구조화되어 있어 피드 카드 품질이 균일하다

### 1.2 검색/찜은 없애지 않는다
탐색 탭이 피드로 바뀌면 기존 메뉴 검색·찜 기능이 갈 곳이 없어진다.
→ 피드 상단에 검색 아이콘을 두고, 찜 목록은 `내 입맛(profile)` 탭 하위로 옮긴다.
기능 삭제가 아니라 이동이다.

---

## 2. Firestore 스키마

```text
posts/{postId}
  authorUid: string
  authorName: string
  authorPhotoUrl: string | null

  menuId: string              # 취향 매칭의 핵심 키
  menuName: string
  menuType: string            # 한식/양식/중식/일식/세계음식
  menuSpicy: number           # 0~3
  menuSoup: boolean
  menuWeight: string          # 가벼움/중간/든든

  photoUrl: string | null     # Firebase Storage 경로
  memo: string                # 최대 300자
  satisfaction: number        # 1~5
  diningMode: string          # 집밥/외식/배달
  placeName: string | null    # 외식일 때 식당명
  amount: number | null

  likeCount: number
  commentCount: number
  reportCount: number         # 누적 신고 수

  status: 'visible' | 'hidden' | 'removed'
  createdAt: timestamp

posts/{postId}/likes/{uid}
  createdAt: timestamp

posts/{postId}/comments/{commentId}
  authorUid, authorName, text, createdAt
  status: 'visible' | 'removed'

reports/{reportId}                    # 신고 (App Store 심사 필수)
  targetType: 'post' | 'comment' | 'user'
  targetId: string
  reporterUid: string
  reason: 'spam' | 'inappropriate' | 'notFood' | 'harassment' | 'other'
  detail: string
  status: 'pending' | 'reviewed' | 'actioned'
  createdAt: timestamp

users/{uid}/blockedUsers/{blockedUid}  # 차단 (심사 필수)
  createdAt: timestamp

users/{uid}/tasteVector                # 피드 개인화용
  typeAffinity: { 한식: number, 양식: number, ... }
  spicyPreference: number     # 0~3 가중 평균
  soupPreference: number      # 0~1
  weightPreference: { 가벼움: number, 중간: number, 든든: number }
  updatedAt: timestamp
```

---

## 3. 피드 개인화 알고리즘

추천 엔진(`recommendation-engine.js`)과 같은 철학: **필터가 아니라 점수제.**
취향에 안 맞는다고 게시물을 숨기면 피드가 금방 마른다.

### 3.1 취향 벡터 만들기
사용자의 식사 기록·찜·추천 수락 이력에서 집계한다.

```
typeAffinity[한식] = (한식을 먹거나 찜한 횟수) / (전체 횟수)
spicyPreference    = 먹은 메뉴들의 spicy 가중 평균 (만족도로 가중)
soupPreference     = 국물 메뉴 비율
weightPreference   = 무게별 비율
```

기록이 3개 미만이면 취향 벡터를 신뢰하지 않고 **인기순 + 최신순**으로 대체한다
(콜드 스타트 사용자 처리).

### 3.2 게시물 점수

| 요소 | 배점 | 설명 |
|---|---|---|
| 음식 종류 일치 | +30 × typeAffinity | 좋아하는 종류일수록 높게 |
| 매운맛 근접도 | +20 × (1 − \|차이\|/3) | 내 선호 매움과 가까울수록 |
| 국물 일치 | +15 | |
| 무게 일치 | +15 | |
| 최신성 | +40 × exp(−경과시간/24h) | 하루 지나면 급감 |
| 인기도 | +10 × log(좋아요+1) | 과열 방지 위해 로그 |
| 같은 작성자 연속 | −25 (2번째부터) | 한 사람이 피드 도배하는 것 방지 |
| 이미 본 게시물 | −30 | |
| 사진 있음 | +12 | 사진 있는 글이 피드 품질을 좌우 |

### 3.3 다양성 보장
상위 점수만 그대로 보여주면 같은 음식 종류만 나온다.
→ **연속 3개가 같은 `menuType`이면 4번째는 다른 종류를 강제 삽입**한다.

---

## 4. 안전·심사 요건 (필수)

UGC 앱은 아래가 없으면 App Store 심사에서 반려된다.

| 요건 | 구현 |
|---|---|
| 게시물 신고 | 모든 게시물·댓글에 신고 버튼, `reports` 컬렉션에 기록 |
| 사용자 차단 | 차단 시 해당 사용자 게시물이 피드에서 완전히 사라짐 |
| 신고 누적 자동 숨김 | `reportCount >= 3`이면 `status='hidden'`으로 자동 전환 후 검토 |
| 운영자 검토 도구 | 신고 목록을 보고 처리하는 웹 관리자 화면 (별도 구축) |
| 이용약관 개정 | UGC 저작권 귀속, 삭제 권한, 금지 행위 명시 |
| 부적절 이미지 대응 | 초기에는 신고 기반 사후 대응. 규모가 커지면 Cloud Vision SafeSearch 도입 |

**운영 인력이 반드시 필요하다.** 신고 기능만 만들고 처리할 사람이 없으면
심사는 통과해도 실제 문제 발생 시 대응이 불가능하다.

---

## 5. 개인정보 고려사항

- 게시물에는 **정확한 위치를 저장하지 않는다.** 식당명까지만 (집 주소 노출 위험)
- 집밥 기록을 공개할 때 위치 정보는 아예 붙이지 않는다
- 작성자 표시 이름은 실명이 아닌 닉네임 사용
- 공개 범위는 기본값 **비공개**로 두고, 사용자가 명시적으로 켜야 공개된다
  (기본 공개로 하면 실수로 사생활이 노출된다)

---

## 6. 로그인 요건 — 그룹 투표와 다른 점

그룹 투표는 익명 인증으로 충분했지만, **소셜 피드는 정식 계정이 필요하다.**

- 게시물에 작성자가 남고, 신고·차단이 계정 단위로 동작해야 하기 때문
- 익명 계정은 차단해도 재생성으로 우회 가능

따라서 순서상:
1. 피드 **읽기**는 익명 인증으로 가능 (진입 장벽 낮춤)
2. **게시물 작성·좋아요·댓글·신고**는 정식 계정 필요 → 그 시점에 로그인 유도

이것이 앞서 미뤄뒀던 **Firebase Auth 정식 구현(P0)이 이제 필수가 되는 지점**이다.

---

## 7. 구현 순서

1. Firebase Auth 정식 구현 (소셜 로그인: 카카오/애플/구글)
2. 위 Firestore 스키마 + 보안 규칙 배포
3. 식사 기록 모달에 "피드에 공개" 토글 추가 → 게시물 생성 연결
4. 피드 UI 구현 (`panel-favorites` → `panel-feed`)
5. 취향 벡터 집계 + 피드 랭킹 적용
6. 신고·차단 기능
7. 관리자 검토 화면 (웹)
8. 이용약관·개인정보처리방침 개정
9. 기존 검색/찜 기능 이동 (피드 상단 검색, 찜은 프로필 하위)

---

## 8. 리스크

- **콜드 스타트**: 식사 기록 연동으로 완화하지만, 초기 사용자 50명 규모에서는
  피드가 하루 몇 건 수준일 수 있다. 베타 기간에는 "이번 주 인기 메뉴" 같은
  앱 생성 콘텐츠를 섞어 피드를 채우는 것을 검토한다.
- **운영 부담**: 신고 처리 인력이 없으면 UGC는 빠르게 관리 불능이 된다.
- **앱 정체성**: 메뉴 추천 앱에서 SNS로 무게중심이 옮겨가면, 기존 강점인
  추천 정확도 개선이 뒤로 밀릴 수 있다. 두 축의 우선순위를 명확히 해둘 것.
