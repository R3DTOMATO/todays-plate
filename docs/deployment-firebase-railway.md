# Firebase Hosting + Railway 배포

## 1. Railway API

Railway에서 GitHub 저장소를 연결하거나 Railway CLI로 이 프로젝트를 배포한다.

필수 서비스 변수:

```env
KAKAO_REST_API_KEY=카카오_REST_API_키
ALLOWED_ORIGINS=https://FIREBASE_PROJECT_ID.web.app,https://FIREBASE_PROJECT_ID.firebaseapp.com
RATE_LIMIT_PER_MINUTE=120
```

`PORT`는 Railway가 자동 제공하므로 직접 설정하지 않아도 된다.

분석 이벤트와 피드백 파일을 재배포 후에도 보존하려면 Railway Volume을 서비스에 연결한다. 권장 마운트 경로는 `/app/server/data`다. 서버는 `RAILWAY_VOLUME_MOUNT_PATH`를 자동 사용한다.

배포 후 Networking에서 Public Domain을 생성하고 다음 주소를 확인한다.

```text
https://RAILWAY_DOMAIN/api/health
```

`ok: true`, `kakaoConfigured: true`여야 한다.

## 2. 프런트 설정

`js/config.js`를 다음처럼 수정한다.

```js
window.APP_CONFIG = {
  API_BASE_URL: 'https://RAILWAY_DOMAIN',
  NEARBY_PROXY_URL: 'https://RAILWAY_DOMAIN/api/nearby',
  NEARBY_RADIUS_STEPS: [3000, 7000, 12000, 20000]
};
```

## 3. Firebase Hosting

프로젝트 루트에서 실행한다.

```bash
npm install -g firebase-tools
firebase login
firebase use --add
firebase deploy --only hosting
```

배포 주소는 보통 다음 두 개다.

```text
https://FIREBASE_PROJECT_ID.web.app
https://FIREBASE_PROJECT_ID.firebaseapp.com
```

## 4. 최종 확인

1. Firebase URL에서 앱 실행
2. 현재 위치 검색
3. 지역 직접 입력 검색
4. `/api/events` 수집
5. 피드백 제출
6. Railway 재배포 후 Volume 데이터 유지 여부

## v4.9 데이터 운영

Railway Variables에 다음 값을 추가한다.

```env
DATA_RETENTION_DAYS=90
DATA_DIR=/app/server/data
```

이벤트와 피드백은 각각 `events-YYYY-MM.jsonl`, `feedback-YYYY-MM.jsonl`로 월별 저장된다. 동일한 이벤트 ID와 피드백 ID는 중복 저장하지 않는다. 서버 시작 시 보존 기간이 지난 월별 파일을 정리한다.

수동 백업:

```bash
npm run backup
```

백업은 기본적으로 Railway Volume의 `server/data/backups/<timestamp>`에 생성된다. 백업 파일을 같은 Volume에만 보관하면 Volume 장애에는 대응하지 못하므로 정기적으로 외부 저장소로 복사해야 한다.
