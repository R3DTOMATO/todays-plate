import { createHash } from 'node:crypto';

const SEARCH_URL = 'https://openapi.naver.com/v1/search/local.json';
const MAPS_URL = 'https://maps.apigw.ntruss.com';

function fail(message, statusCode = 502) {
  return Object.assign(new Error(message), { statusCode });
}

function plainText(value) {
  const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return String(value ?? '').replace(/<[^>]*>/g, '').replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, entity) => {
    if (entity.startsWith('#')) {
      const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    }
    return entities[entity.toLowerCase()] ?? match;
  }).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
}

export function validLocation(lat, lng) {
  return lat !== null && lng !== null && lat !== '' && lng !== ''
    && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))
    && Number(lat) >= 33 && Number(lat) <= 39 && Number(lng) >= 124 && Number(lng) <= 132;
}

export function localCoordinates(item) {
  if (item?.mapx == null || item?.mapy == null) return null;
  let lng = Number(item.mapx), lat = Number(item.mapy);
  // Local Search returns WGS84 integers at 1e7 precision. Also accept decimal WGS84.
  if (Math.abs(lng) > 180 || Math.abs(lat) > 90) { lng /= 1e7; lat /= 1e7; }
  return validLocation(lat, lng) ? { lat, lng } : null;
}

export function distanceMeters(a, b) {
  const rad = value => value * Math.PI / 180;
  const dlat = rad(b.lat - a.lat), dlng = rad(b.lng - a.lng);
  const h = Math.sin(dlat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dlng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

function normalizePlace(item, center) {
  const point = localCoordinates(item);
  const name = plainText(item.title), category = plainText(item.category);
  if (!point || !name) return null;
  // Naver uses category names, not Kakao's group codes. Keep the existing UI contract.
  if (/^(쇼핑|서비스|제조|교육|의료|교통|숙박)/.test(category)) return null;
  const cafe = /카페|커피|디저트|베이커리|제과/.test(category);
  if (!cafe && !/음식점|한식|중식|일식|양식|분식|치킨|피자|햄버거|주점|술집|뷔페|도시락|아시아음식|멕시코|태국|베트남|인도음식/.test(category)) return null;
  const address = plainText(item.address), road = plainText(item.roadAddress);
  const identity = `${name}|${road || address}|${point.lat}|${point.lng}`;
  return {
    id: `naver:${createHash('sha256').update(identity).digest('hex').slice(0, 24)}`,
    provider: 'naver', place_name: name, category_name: category,
    category_group_code: cafe ? 'CE7' : 'FD6', category_group_name: cafe ? '카페' : '음식점',
    description: plainText(item.description), address_name: address, road_address_name: road,
    x: String(point.lng), y: String(point.lat), distance: String(Math.round(distanceMeters(center, point))),
    distance_type: 'straight_line', phone: '',
    place_url: `https://map.naver.com/p/search/${encodeURIComponent(`${name} ${road || address}`.trim())}`,
    menuAvailability: 'unknown',
  };
}

export function createNaverPlacesClient({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const searchId = env.NAVER_SEARCH_CLIENT_ID || '', searchSecret = env.NAVER_SEARCH_CLIENT_SECRET || '';
  const mapsId = env.NAVER_MAPS_CLIENT_ID || '', mapsSecret = env.NAVER_MAPS_CLIENT_SECRET || '';
  const searchConfigured = Boolean(searchId && searchSecret), mapsConfigured = Boolean(mapsId && mapsSecret);
  // Share only in-flight reverse lookups. Coordinates/results are not persisted here.
  const regionRequests = new Map();

  async function request(url, kind) {
    if (!(kind === 'search' ? searchConfigured : mapsConfigured)) throw fail(`naver_${kind}_not_configured`, 503);
    const headers = kind === 'search'
      ? { 'X-Naver-Client-Id': searchId, 'X-Naver-Client-Secret': searchSecret }
      : { 'x-ncp-apigw-api-key-id': mapsId, 'x-ncp-apigw-api-key': mapsSecret };
    try {
      const response = await fetchImpl(url, { headers: { ...headers, Accept: 'application/json' }, signal: AbortSignal.timeout(6000) });
      if (!response.ok) {
        if ([401, 403].includes(response.status)) throw fail(`naver_${kind}_authentication_failed`, 503);
        if (response.status === 429) throw fail('naver_quota_exceeded', 503);
        throw fail('naver_upstream_error');
      }
      const payload = await response.json();
      if (!payload || typeof payload !== 'object' || payload.errorCode || payload.error) throw fail('naver_invalid_response');
      return payload;
    } catch (error) {
      if (error.statusCode) throw error;
      throw fail(error.name === 'TimeoutError' || error.name === 'AbortError' ? 'naver_timeout' : 'naver_upstream_error', error.name === 'TimeoutError' || error.name === 'AbortError' ? 504 : 502);
    }
  }

  async function search(query) {
    const url = new URL(SEARCH_URL);
    url.search = new URLSearchParams({ query, display: '5', start: '1', sort: 'random' });
    const payload = await request(url, 'search');
    if (!Array.isArray(payload.items)) throw fail('naver_invalid_response');
    return payload.items;
  }

  async function regions(center) {
    const key = `${center.lng},${center.lat}`;
    if (regionRequests.has(key)) return regionRequests.get(key);
    const promise = (async () => {
      const url = new URL(`${MAPS_URL}/map-reversegeocode/v2/gc`);
      url.search = new URLSearchParams({ coords: key, sourcecrs: 'EPSG:4326', orders: 'legalcode,admcode', output: 'json' });
      const payload = await request(url, 'maps');
      if (Number(payload.status?.code) === 3) throw fail('location_not_found', 404);
      if (Number(payload.status?.code) !== 0 || !Array.isArray(payload.results)) throw fail('naver_invalid_response');
      const result = [];
      for (const item of payload.results) {
        const areas = [1, 2, 3, 4].map(index => plainText(item.region?.[`area${index}`]?.name));
        if (areas[0] && areas[1]) result.push(areas.filter(Boolean).join(' '));
      }
      const region = payload.results[0]?.region;
      const district = [region?.area1?.name, region?.area2?.name].map(plainText).filter(Boolean).join(' ');
      if (district && region?.area2?.name) result.push(district);
      if (!result.length) throw fail('location_not_found', 404);
      return [...new Set(result)].slice(0, 3);
    })();
    regionRequests.set(key, promise);
    try { return await promise; } finally { regionRequests.delete(key); }
  }

  async function nearby({ query, lat, lng, radius = 5000, size = 15 }) {
    if (!validLocation(lat, lng) || !plainText(query) || !Number.isFinite(radius) || radius < 1 || radius > 20000) throw fail('invalid_parameters', 400);
    if (!searchConfigured) throw fail('naver_search_not_configured', 503);
    const center = { lat: Number(lat), lng: Number(lng) };
    const names = await regions(center);
    const batches = await Promise.all(names.map(region => search(`${region} ${plainText(query)}`)));
    const places = new Map();
    for (const item of batches.flat()) {
      const place = normalizePlace(item, center);
      if (place && Number(place.distance) <= radius) places.set(place.id, place);
    }
    const documents = [...places.values()].sort((a, b) => Number(a.distance) - Number(b.distance)).slice(0, size);
    return { provider: 'naver', documents, meta: { is_end: true, total_count: documents.length, search_region: names[0], radius, coverage: 'search_results_only' } };
  }

  async function resolveLocation(query) {
    const url = new URL(`${MAPS_URL}/map-geocode/v2/geocode`);
    url.search = new URLSearchParams({ query, count: '1' });
    const payload = await request(url, 'maps');
    if (payload.status !== 'OK' || !Array.isArray(payload.addresses)) throw fail('naver_invalid_response');
    const address = payload.addresses.find(item => validLocation(item.y, item.x));
    if (address) return { provider: 'naver', lat: Number(address.y), lng: Number(address.x), label: plainText(address.roadAddress || address.jibunAddress || query) };
    // Geocoding accepts addresses; stations, campuses and building names use Local Search.
    const items = await search(query);
    for (const item of items) {
      const point = localCoordinates(item);
      if (point) return { provider: 'naver', ...point, label: plainText(item.title || query) };
    }
    throw fail('location_not_found', 404);
  }

  return { nearby, resolveLocation, searchConfigured, mapsConfigured };
}
