// Naver Maps JavaScript v3. Only the public Maps Client ID belongs in APP_CONFIG.
let sdkPromise = null;
let mapInstance = null;
let markers = [];
let listeners = [];
let renderGeneration = 0;
let authenticationFailed = false;
const clientId = () => String(window.APP_CONFIG?.NAVER_MAPS_CLIENT_ID || '').trim();

function loadSdk() {
  if (!clientId()) return Promise.reject(new Error('naver_map_not_configured'));
  if (authenticationFailed) return Promise.reject(new Error('naver_map_authentication_failed'));
  if (window.naver?.maps?.Map) return Promise.resolve(window.naver.maps);
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    let finished = false;
    const finish = error => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      script.onerror = null;
      if (error) { script.remove(); reject(error); }
      else resolve(window.naver.maps);
    };
    const timer = setTimeout(() => finish(new Error('naver_map_timeout')), 8000);
    window.__plateNaverMapReady = () => finish(window.naver?.maps?.Map ? null : new Error('naver_map_sdk_missing'));
    window.navermap_authFailure = () => {
      authenticationFailed = true;
      finish(new Error('naver_map_authentication_failed'));
      window.dispatchEvent(new Event('plate:map-unavailable'));
    };
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(clientId())}&callback=__plateNaverMapReady`;
    script.async = true;
    script.onerror = () => finish(new Error('naver_map_load_failed'));
    document.head.appendChild(script);
  }).catch(error => { sdkPromise = null; throw error; });
  return sdkPromise;
}

function resizeMap(maps, container) {
  if (!container.clientWidth || !container.clientHeight || !mapInstance) return;
  const center = mapInstance.getCenter();
  mapInstance.setSize(new maps.Size(container.clientWidth, container.clientHeight));
  mapInstance.setCenter(center);
}

function clearMarkers(maps) {
  listeners.forEach(listener => maps.Event.removeListener(listener));
  markers.forEach(marker => marker.setMap(null));
  listeners = [];
  markers = [];
}

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

export async function renderNaverMap(center, places = [], onSelect) {
  const generation = ++renderGeneration;
  if (!center || !Number.isFinite(center.lat) || !Number.isFinite(center.lng)) return false;
  const maps = await loadSdk();
  if (generation !== renderGeneration) return false;
  const container = document.getElementById('nbMapCanvas');
  if (!container) return false;
  container.hidden = false;
  const position = new maps.LatLng(center.lat, center.lng);
  if (!mapInstance) {
    mapInstance = new maps.Map(container, { center: position, zoom: 15, zoomControl: true });
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => resizeMap(maps, container));
      observer.observe(container);
    }
  } else mapInstance.setCenter(position);
  resizeMap(maps, container);
  clearMarkers(maps);
  markers.push(new maps.Marker({ map: mapInstance, position, zIndex: 100,
    icon: { content: '<div class="nb-map-me" aria-label="검색 기준 위치"></div>', anchor: new maps.Point(8, 8) } }));
  const bounds = new maps.LatLngBounds(position, position);
  bounds.extend(position);
  let validPlaces = 0;
  places.forEach((place, index) => {
    if (place.lat == null || place.lng == null || !Number.isFinite(Number(place.lat)) || !Number.isFinite(Number(place.lng))) return;
    const point = new maps.LatLng(Number(place.lat), Number(place.lng));
    bounds.extend(point);
    validPlaces++;
    const marker = new maps.Marker({ map: mapInstance, position: point, zIndex: 90 - index,
      title: place.name || '식당',
      icon: { content: `<button type="button" class="nb-map-pin${index === 0 ? ' is-primary' : ''}" data-place="${index}" aria-label="${escapeHtml(place.name || '식당')} 네이버 지도에서 보기">${escapeHtml(place.dist || index + 1)}</button>`, anchor: new maps.Point(25, 38) } });
    markers.push(marker);
    listeners.push(maps.Event.addListener(marker, 'click', () => {
      if (generation === renderGeneration && typeof onSelect === 'function') onSelect(index);
    }));
  });
  if (validPlaces) mapInstance.fitBounds(bounds, { top: 50, right: 50, bottom: 50, left: 50 });
  return true;
}

export function isNaverMapUsable() { return Boolean(clientId()) && !authenticationFailed; }
window.naverMap = { render: renderNaverMap, usable: isNaverMapUsable };
