// 로컬 개발 예시
window.APP_CONFIG = {
  API_BASE_URL: 'http://localhost:8787',
  NEARBY_PROXY_URL: 'http://localhost:8787/api/nearby',
  NEARBY_RADIUS_STEPS: [3000, 7000, 12000, 20000],

  // 개발용 QA 화면(recipeqa / debug) 노출.
  // localhost에서는 이 값이 없어도 자동으로 켜집니다.
  // 배포용 js/config.js에는 절대 넣지 마세요 — 넣으면 프로덕션에서 QA 패널이 열립니다.
  ENABLE_QA_PANEL: true
};
