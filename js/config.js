// 배포 환경에서는 서버 API 주소만 설정합니다.
// Kakao REST API 키는 브라우저 코드에 절대 넣지 않습니다.
// Railway 공개 도메인은 비밀값이 아니며, 브라우저가 주변 식당/지역 검색 API에 접근할 때 사용합니다.
window.APP_CONFIG = {
  API_BASE_URL: 'https://todays-plate.up.railway.app',
  NEARBY_PROXY_URL: 'https://todays-plate.up.railway.app/api/nearby',
  NEARBY_RADIUS_STEPS: [3000, 7000, 12000, 20000]
};
