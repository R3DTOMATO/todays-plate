// ─────────────────────────────────────────────────────────────
// 카카오맵 — 실제 지도에 내 위치와 식당 표시
//
// 키에 대해
//  이 지도는 카카오 JavaScript 키를 씁니다. 서버에 숨겨 둔 REST 키와는 다른 키이며,
//  브라우저에 노출되는 것이 정상입니다. 대신 카카오 콘솔에서 플랫폼 도메인을
//  등록해 다른 사이트에서 쓰지 못하게 막아야 합니다.
//  REST 키는 절대 여기에 넣지 마세요.
//
// 동작 원칙
//  1. 키가 없거나 SDK 로드에 실패하면 기존 지도 일러스트로 조용히 되돌아간다.
//     지도가 없다고 주변 식당 기능 전체가 멈추면 안 된다.
//  2. 마커는 검색 결과와 1:1로 연결한다. 누르면 해당 식당으로 이동한다.
// ─────────────────────────────────────────────────────────────

const JS_KEY = (window.APP_CONFIG && window.APP_CONFIG.KAKAO_JS_KEY) || '';

let sdkPromise = null;
let mapInstance = null;
let userMarker = null;
let placeMarkers = [];
let overlays = [];
let currentPlaces = [];
let currentOnSelect = null;

export const KAKAO_MAP_READY = Boolean(JS_KEY);

// ─── SDK 로드 ───

function loadSdk() {
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise((resolve, reject) => {
    if (!JS_KEY) return reject(new Error('no_js_key'));
    if (window.kakao && window.kakao.maps) return resolve(window.kakao);

    const script = document.createElement('script');
    // autoload=false로 두고 kakao.maps.load()를 직접 호출해야
    // 스크립트 로드와 초기화 시점이 어긋나지 않는다.
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(JS_KEY)}&autoload=false`;
    script.async = true;
    script.onload = () => {
      if (!window.kakao || !window.kakao.maps) return reject(new Error('sdk_missing'));
      window.kakao.maps.load(() => resolve(window.kakao));
    };
    script.onerror = () => reject(new Error('sdk_load_failed'));
    document.head.appendChild(script);
  });

  return sdkPromise;
}

// ─── 지도 생성 ───

async function ensureMap(center) {
  const kakao = await loadSdk();
  const container = document.getElementById('nbMapCanvas');
  if (!container) throw new Error('no_container');

  if (!mapInstance) {
    mapInstance = new kakao.maps.Map(container, {
      center: new kakao.maps.LatLng(center.lat, center.lng),
      level: 4,
    });
    mapInstance.setZoomable(true);
    // Split views and tablet rotation change the canvas without a new search.
    // Ignore hidden panels and preserve the user's current map position.
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(entries => {
        if (!entries.some(entry => entry.contentRect.width && entry.contentRect.height)) return;
        const position = mapInstance.getCenter();
        mapInstance.relayout();
        mapInstance.setCenter(position);
      });
      observer.observe(container);
    }
  } else {
    mapInstance.setCenter(new kakao.maps.LatLng(center.lat, center.lng));
  }

  // 컨테이너가 숨겨진 상태에서 만들어지면 크기가 0으로 잡힌다.
  // 패널이 보이는 시점에 다시 계산해 준다.
  setTimeout(() => mapInstance && mapInstance.relayout(), 60);
  return kakao;
}

function clearMarkers() {
  placeMarkers.forEach(marker => marker.setMap(null));
  overlays.forEach(overlay => overlay.setMap(null));
  placeMarkers = [];
  overlays = [];
}

// ─── 렌더 ───

/**
 * @param {{lat:number,lng:number}} center 내 위치(또는 검색 기준 위치)
 * @param {Array} places formatPlace() 결과 배열. x=경도, y=위도를 포함해야 한다.
 * @param {Function} onSelect 마커 클릭 시 호출
 */
export async function renderKakaoMap(center, places, onSelect) {
  if (!center || !Number.isFinite(center.lat) || !Number.isFinite(center.lng)) return false;

  const kakao = await ensureMap(center);
  clearMarkers();

  // 내 위치 — 기본 마커 대신 디자인의 점 표시를 쓴다
  const centerPos = new kakao.maps.LatLng(center.lat, center.lng);
  if (userMarker) userMarker.setMap(null);
  userMarker = new kakao.maps.CustomOverlay({
    position: centerPos,
    content: '<div class="nb-map-me" aria-label="현재 위치"></div>',
    zIndex: 5,
  });
  userMarker.setMap(mapInstance);

  const bounds = new kakao.maps.LatLngBounds();
  bounds.extend(centerPos);

  (places || []).forEach((place, index) => {
    const lat = Number(place.lat);
    const lng = Number(place.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const position = new kakao.maps.LatLng(lat, lng);
    bounds.extend(position);

    // 디자인의 알약형 마커. 1순위만 채운 브랜드 색.
    const label = place.dist || `${index + 1}`;
    const overlay = new kakao.maps.CustomOverlay({
      position,
      yAnchor: 1.35,
      zIndex: 4 - index,
      content: `<button type="button" class="nb-map-pin${index === 0 ? ' is-primary' : ''}"
                  data-place="${index}">${escapeForHtml(label)}</button>`,
    });
    overlay.setMap(mapInstance);
    overlays.push(overlay);
  });

  // 결과가 모두 보이도록 화면을 맞춘다
  if ((places || []).some(p => Number.isFinite(Number(p.lat)))) {
    mapInstance.setBounds(bounds, 40, 40, 40, 40);
  }

  // 클릭 핸들러와 현재 목록을 함께 갱신한다.
  //
  // 예전에는 dataset.bound로 리스너를 한 번만 등록했는데,
  // 그 리스너가 첫 검색의 places/onSelect를 클로저로 붙잡고 있었다.
  // 그래서 새로 검색해도 마커를 누르면 이전 결과의 식당이 열렸다.
  currentPlaces = places || [];
  currentOnSelect = onSelect;

  const container = document.getElementById('nbMapCanvas');
  if (container && !container.dataset.bound) {
    container.dataset.bound = '1';
    container.addEventListener('click', event => {
      const pin = event.target.closest('.nb-map-pin');
      if (!pin) return;
      const index = Number(pin.dataset.place);
      // 클로저가 아니라 모듈 상태를 읽는다. 항상 최신 목록을 본다.
      if (typeof currentOnSelect === 'function') currentOnSelect(index);
    });
  }

  return true;
}

function escapeForHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

/** 지도를 못 쓰는 경우를 호출부가 알 수 있게 한다 */
export function isKakaoMapUsable() {
  return Boolean(JS_KEY);
}

window.kakaoMap = { render: renderKakaoMap, usable: isKakaoMapUsable };
