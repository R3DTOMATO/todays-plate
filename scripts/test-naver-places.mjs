import test from 'node:test';
import assert from 'node:assert/strict';
import { createNaverPlacesClient, localCoordinates, distanceMeters } from '../server/naver-places.mjs';

const env = { NAVER_SEARCH_CLIENT_ID: 'search-id', NAVER_SEARCH_CLIENT_SECRET: 'search-secret', NAVER_MAPS_CLIENT_ID: 'maps-id', NAVER_MAPS_CLIENT_SECRET: 'maps-secret' };
const center = { lat: 37.619, lng: 127.059 };
const region = { area1: { name: '서울특별시' }, area2: { name: '노원구' }, area3: { name: '월계동' } };
const reverse = { status: { code: 0 }, results: [{ name: 'legalcode', region }] };
const json = body => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
const shop = (title, lat = center.lat, lng = center.lng, extra = {}) => ({ title, category: '음식점>한식', address: '서울 노원구 월계동 1', roadAddress: '서울 노원구 광운로 1', mapx: String(Math.round(lng * 1e7)), mapy: String(Math.round(lat * 1e7)), ...extra });

test('Local Search integer and decimal coordinates are not swapped; invalid/legacy values are rejected', () => {
  assert.deepEqual(localCoordinates(shop('식당')), center);
  assert.deepEqual(localCoordinates({ mapx: 127.059, mapy: 37.619 }), center);
  for (const item of [{}, { mapx: '', mapy: '' }, { mapx: 311277, mapy: 552097 }, { mapx: 'oops', mapy: 37 }, { mapx: 37, mapy: 127 }]) assert.equal(localCoordinates(item), null);
  assert.equal(distanceMeters(center, center), 0);
  const north = distanceMeters(center, { ...center, lat: center.lat + 0.01 });
  assert.ok(north > 1100 && north < 1120);
});

test('nearby uses separate credentials, valid Naver search limits, region queries, deduplication and strict radius filtering', async () => {
  const calls = [];
  const client = createNaverPlacesClient({ env, fetchImpl: async (input, options) => {
    const url = new URL(input); calls.push(url);
    if (url.pathname.endsWith('/gc')) {
      assert.equal(options.headers['x-ncp-apigw-api-key'], 'maps-secret');
      assert.equal(options.headers['X-Naver-Client-Secret'], undefined);
      return json(reverse);
    }
    assert.equal(url.origin, 'https://openapi.naver.com');
    assert.equal(options.headers['X-Naver-Client-Secret'], 'search-secret');
    assert.equal(options.headers['x-ncp-apigw-api-key'], undefined);
    assert.equal(url.searchParams.get('display'), '5');
    assert.equal(url.searchParams.get('start'), '1');
    assert.match(url.searchParams.get('query'), /^서울특별시 노원구(?: 월계동)? 김치찌개$/);
    return json({ items: [shop('<b>김치</b> &amp; 밥집'), shop('가까운 식당', center.lat + 0.003), shop('먼 식당', 37.1), shop('식품 마트', center.lat, center.lng, { category: '쇼핑,유통>식품' }), shop('좌표 없는 식당', null, null)] });
  } });
  const result = await client.nearby({ query: '김치찌개', ...center, radius: 1000 });
  assert.equal(calls.length, 3);
  assert.equal(result.provider, 'naver');
  assert.equal(result.meta.is_end, true);
  assert.deepEqual(result.documents.map(place => place.place_name), ['김치 & 밥집', '가까운 식당']);
  assert.equal(result.documents[0].distance, '0');
  assert.equal(result.documents[0].phone, '');
  assert.equal(result.documents[0].menuAvailability, 'unknown');
  assert.equal(new URL(result.documents[0].place_url).hostname, 'map.naver.com');
  assert.ok(!JSON.stringify(result).includes('secret'));
});

test('successful empty search remains an empty result', async () => {
  const client = createNaverPlacesClient({ env, fetchImpl: async url => json(String(url).includes('/gc?') ? reverse : { items: [] }) });
  assert.deepEqual((await client.nearby({ query: '식당', ...center })).documents, []);
});

test('missing credentials and invalid coordinates fail before unsupported requests are sent', async () => {
  const fetchImpl = () => { throw Error('must not fetch'); };
  const missing = createNaverPlacesClient({ env: {}, fetchImpl });
  await assert.rejects(missing.nearby({ query: '식당', ...center }), { message: 'naver_search_not_configured', statusCode: 503 });
  const configured = createNaverPlacesClient({ env, fetchImpl });
  for (const lat of [null, '', NaN, 91]) await assert.rejects(configured.nearby({ query: '식당', lat, lng: 127 }), { statusCode: 400 });
});

test('provider authentication, quota and timeout failures are not reported as no restaurants', async () => {
  for (const status of [401, 403, 429, 500]) {
    const client = createNaverPlacesClient({ env, fetchImpl: async () => new Response('private upstream detail', { status }) });
    await assert.rejects(client.nearby({ query: '식당', ...center }), error => error.statusCode === (status === 500 ? 502 : 503) && !error.message.includes('private'));
  }
  const client = createNaverPlacesClient({ env, fetchImpl: async () => { throw new DOMException('secret timeout data', 'TimeoutError'); } });
  await assert.rejects(client.nearby({ query: '식당', ...center }), { message: 'naver_timeout', statusCode: 504 });
});

test('malformed success responses and reverse geocoding misses are explicit failures', async () => {
  const invalid = createNaverPlacesClient({ env, fetchImpl: async () => json({}) });
  await assert.rejects(invalid.nearby({ query: '식당', ...center }), { message: 'naver_invalid_response' });
  const missing = createNaverPlacesClient({ env, fetchImpl: async () => json({ status: { code: 3 }, results: [] }) });
  await assert.rejects(missing.nearby({ query: '식당', ...center }), { message: 'location_not_found', statusCode: 404 });
});

test('addresses use geocoding; station names can resolve through Local Search', async () => {
  let searches = 0;
  const client = createNaverPlacesClient({ env, fetchImpl: async input => {
    const url = new URL(input);
    if (url.pathname.endsWith('/geocode')) return json({ status: 'OK', addresses: url.searchParams.get('query') === '광운로 1' ? [{ x: String(center.lng), y: String(center.lat), roadAddress: '서울 노원구 광운로 1' }] : [] });
    searches++;
    return json({ items: [shop('<b>광운대역</b>', center.lat, center.lng, { category: '교통,운수>지하철' })] });
  } });
  assert.equal((await client.resolveLocation('광운로 1')).label, '서울 노원구 광운로 1');
  assert.equal(searches, 0);
  assert.deepEqual(await client.resolveLocation('광운대역'), { provider: 'naver', ...center, label: '광운대역' });
  assert.equal(searches, 1);
});
