// 배포 환경에서는 서버 API 주소만 설정합니다.
// Kakao REST API 키는 브라우저 코드에 절대 넣지 않습니다.
// Railway 공개 도메인은 비밀값이 아니며, 브라우저가 주변 식당/지역 검색 API에 접근할 때 사용합니다.
window.APP_CONFIG = {
  API_BASE_URL: 'https://todays-plate.up.railway.app',
  NEARBY_PROXY_URL: 'https://todays-plate.up.railway.app/api/nearby',
  NEARBY_RADIUS_STEPS: [3000, 7000, 12000, 20000],
  SENTRY_DSN: 'https://34821251de57c83695bad555a61f4cbb@o4511997253517312.ingest.us.sentry.io/4511997266296832',
};

// Firebase 설정 — 그룹 투표(js/group-vote.js)와 소셜 피드에서 사용합니다.
// 아래 값은 Firebase 콘솔 > 프로젝트 설정 > 웹 앱에서 발급받아 채웁니다.
// 이 값들은 비밀값이 아니며 브라우저에 노출되어도 됩니다.
// 실제 접근 제어는 Firestore 보안 규칙(docs/firebase-rules.example)이 담당합니다.
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyAl61ersZFkoNURuhJcz8AQ_LInFymCCi4",
  authDomain: "todays-plate.firebaseapp.com",
  projectId: "todays-plate",
  storageBucket: "todays-plate.firebasestorage.app",
  messagingSenderId: "825515742524",
  appId: "1:825515742524:web:c7a893f0a6ce19ed833a39",
  measurementId: "G-LN4YQC9VXT",
};
