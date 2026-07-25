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
