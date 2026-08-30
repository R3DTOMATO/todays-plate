# 주변 식당 화면 에셋 (Figma 172:472)

## 상태

| 파일 | 상태 |
|---|---|
| `map-art.svg` | ⚠️ 기존 프로젝트 에셋(393×210) 재사용 중. 디자인은 **393×390**이라 늘어나 보입니다 |
| `icon-search.svg` | ❌ 자리표시 |
| `icon-filter.svg` | ❌ 자리표시 |
| `current-location.svg` | ❌ 자리표시 |

## 다운로드

```bash
cd assets/figma/nearby

curl -L -o map-art.svg          "https://www.figma.com/api/mcp/asset/fff6416e-7619-4747-af4b-14e30e313aad.svg"
curl -L -o current-location.svg "https://www.figma.com/api/mcp/asset/9e59e61c-cf82-4c37-98e9-c1afd3ce2e08.svg"
curl -L -o icon-search.svg      "https://www.figma.com/api/mcp/asset/d58546ac-153d-4a02-abab-514fc91edcee.svg"
curl -L -o icon-filter.svg      "https://www.figma.com/api/mcp/asset/2cbae2f3-a003-41de-abda-314599fac374.svg"
```

URL은 발급 후 약 7일이면 만료됩니다. 만료 시 Figma에서 직접 Export하세요.

| Figma 레이어 | 파일명 | 크기 |
|---|---|---|
| Map Artwork | `map-art.svg` | 393×390 |
| Current Location | `current-location.svg` | 24×24 |
| Icon / Search | `icon-search.svg` | 20×20 |
| Icon / Filter | `icon-filter.svg` | 20×20 |

확인: `grep -l PLACEHOLDER assets/figma/nearby/*.svg` → 출력 없으면 정상

---

## 디자인과 실제 데이터가 다른 부분

디자인에는 다음이 있지만 **카카오 로컬 API는 제공하지 않습니다.**
없는 값을 지어내면 사용자를 오도하므로, 실제로 아는 값으로 대체했습니다.

| 디자인 | 대체 | 이유 |
|---|---|---|
| ★ 4.6 · 리뷰 312 | 카테고리 · 도보 시간 | 평점·리뷰 수 미제공 |
| 영업 중 / 영업 중 8곳 | 상호 일치 / 메뉴 검색 (검증 tier) | 영업 상태 미제공 |
| 9,900원 · 마커의 "9.9천" | 주소 / 마커는 거리(270m) | 가격 미제공 |
| 취향 96% | 적합도 라벨(fitLabel) | 실제 계산되는 값 사용 |

평점·영업시간이 필요하면 별도 데이터 소스(네이버, 구글 플레이스)가 있어야 합니다.

---

## 카카오맵 설정 (실제 지도 사용)

`js/config.js`의 `KAKAO_JS_KEY`를 채우면 일러스트 대신 **실제 지도**가 뜨고,
내 위치와 식당 위치가 표시됩니다. 비워 두면 기존 일러스트로 동작합니다.

### 1. JavaScript 키 발급

카카오 개발자 콘솔 → 내 애플리케이션 → 앱 키 → **JavaScript 키** 복사

**서버에 숨겨 둔 REST 키와는 다른 키입니다.**
JavaScript 키는 브라우저에 노출되는 것이 정상이며, 도메인 등록으로 보호합니다.
REST 키는 절대 `config.js`에 넣지 마세요.

### 2. 플랫폼 도메인 등록 (필수)

앱 설정 → 플랫폼 → **Web 플랫폼 등록**

```
https://todays-plate.web.app
https://todays-plate.firebaseapp.com
http://localhost:8000        (개발용)
```

등록하지 않으면 지도가 로드되지 않습니다.

### 3. 키 입력

```javascript
// js/config.js
KAKAO_JS_KEY: '여기에_JavaScript_키'
```

### 4. 배포

```bash
firebase deploy --only hosting
```

`firebase.json`의 CSP에 `dapi.kakao.com`(스크립트)과
`map.daumcdn.net`, `t1.daumcdn.net`, `mts.daumcdn.net`(지도 타일)을 추가해 두었습니다.
이게 없으면 CSP에 막혀 지도가 뜨지 않습니다.

### 동작

- 지도 위 알약형 마커에 **거리**가 표시되고, 1순위만 브랜드 색으로 채워집니다
- 마커를 누르면 해당 식당 상세로 이동합니다
- 내 위치는 초록 점으로 표시됩니다
- 검색 결과가 모두 보이도록 화면이 자동으로 맞춰집니다
- **키가 없거나 로드에 실패하면 일러스트로 조용히 되돌아갑니다.**
  지도가 안 된다고 주변 식당 기능 전체가 멈추지 않습니다
