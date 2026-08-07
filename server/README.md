# 오늘의 식탁 친구 베타 API

브라우저에 비밀키를 넣지 않고 다음 기능을 제공하는 Node.js 표준 라이브러리 기반 서버입니다.

- Kakao Local 주변 식당 검색
- 주소·지역·역 이름 좌표 확인
- 익명 분석 이벤트 수집
- 사용자 피드백 수집
- 베타 지표 리포트 생성

## 실행

```bash
KAKAO_REST_API_KEY="발급받은_서버용_키" \
ALLOWED_ORIGINS="http://localhost:5500,http://127.0.0.1:5500" \
node server/kakao-nearby-proxy.mjs
```

환경 변수:

| 변수 | 기본값 | 설명 |
|---|---|---|
| `PORT` | `8787` | API 포트 |
| `KAKAO_REST_API_KEY` | 없음 | Kakao REST API 키 |
| `ALLOWED_ORIGINS` | 로컬 5500 | 허용할 웹 앱 출처 |
| `DATA_DIR` | `server/data` | JSONL 저장 위치 |
| `RATE_LIMIT_PER_MINUTE` | `120` | IP 기준 분당 요청 수 |

## 클라이언트 설정

```js
window.APP_CONFIG = {
  API_BASE_URL: 'http://localhost:8787',
  NEARBY_PROXY_URL: 'http://localhost:8787/api/nearby',
  NEARBY_RADIUS_STEPS: [3000, 7000, 12000, 20000]
};
```

## 엔드포인트

### `GET /api/health`

서버와 수집 기능 상태를 확인합니다. Kakao 키가 없어도 사용할 수 있습니다.

### `GET /api/nearby`

필수 쿼리: `query`, `x`, `y`. Kakao API 키가 필요합니다.

### `GET /api/resolve-location`

필수 쿼리: `query`. 주소 검색 후 결과가 없으면 키워드 검색을 시도합니다.

### `POST /api/events`

한 번에 최대 50개 이벤트를 받습니다. 좌표·주소·연락처·메모·사진 관련 속성은 서버에서도 제거합니다.

### `POST /api/feedback`

문제 유형과 내용을 JSONL에 저장합니다. 연락처는 사용자가 입력한 경우에만 저장합니다.

## 저장 파일

```text
server/data/events.jsonl
server/data/feedback.jsonl
```

운영 환경에서는 로컬 파일 대신 관리형 데이터베이스와 백업·암호화·접근 통제를 적용해야 합니다.

## 리포트

```bash
node server/beta-report.mjs
node server/beta-report.mjs > beta-report.json
```

리포트는 이벤트 수, 추천 퍼널, 메뉴 선택률, 기록률, 거절 이유, 주변 식당·레시피 이용량, 오류 및 피드백 유형을 출력합니다.

## v4.9 운영

- 이벤트: `events-YYYY-MM.jsonl`
- 피드백: `feedback-YYYY-MM.jsonl`
- 기본 보존 기간: 90일 (`DATA_RETENTION_DAYS`)
- 동일 ID 중복 수집 방지
- `npm run backup`: Volume 내부 백업 생성
- `npm run report`: 전체 월별 파일을 합쳐 베타 리포트 생성

Railway Volume 자체의 장애에 대비하려면 생성된 백업을 별도 저장소로 복사해야 한다.
