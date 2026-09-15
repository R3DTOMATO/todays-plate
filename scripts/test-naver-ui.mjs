import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
function appFunctions(names, values = {}) {
  const context = vm.createContext({ URLSearchParams, AbortController, setTimeout, clearTimeout, console, ...values });
  for (const name of names) {
    const match = new RegExp(`  (?:async )?function ${name}\\(`).exec(source);
    assert.ok(match, name);
    const end = source.indexOf('\n  }\n', match.index) + 5;
    vm.runInContext(source.slice(match.index, end), context);
  }
  return context;
}

test('frontend makes one bounded request and rejects a previous-provider response', async () => {
  let calls = 0;
  const context = appFunctions(['searchPlacesNaver'], {
    NEARBY_PROXY_URL: 'https://fixture.test/api/nearby', NEARBY_SEARCH_DEFAULTS: { pageSize: 15 },
    normalizeNaverPlace: value => value,
    fetch: async input => {
      calls++;
      const url = new URL(input);
      assert.equal(url.searchParams.has('page'), false);
      assert.equal(url.searchParams.get('radius'), '1000');
      return { ok: true, json: async () => ({ provider: 'naver', documents: [{ category_group_code: 'FD6', distance: '200' }, { category_group_code: 'FD6', distance: '2000' }] }) };
    },
  });
  assert.equal((await context.searchPlacesNaver('김치찌개', { lat: 37.6, lng: 127 }, { radius: 1000, pageLimit: 3 })).length, 1);
  assert.equal(calls, 1);
  context.fetch = async () => ({ ok: true, json: async () => ({ documents: [] }) });
  await assert.rejects(context.searchPlacesNaver('김치찌개', { lat: 37.6, lng: 127 }), { code: 'unexpected_places_provider' });
});

test('radius expansion reuses distinct menu searches and propagates provider failures', async () => {
  const calls = [];
  const context = appFunctions(['placeTierRank', 'searchPlacesForExactMenuOnly'], {
    strictMenuPlaceQueries: () => ['김치찌개', '김치 찌개'], cuisineCandidateQueries: () => [],
    getNearbySearchRadiusSteps: () => [1000, 3000], lastNearbySearchLog: [],
    searchPlacesNaver: async (query, location, options) => { calls.push({ query, radius: options.radius }); return [{ id: query, distance: '2000', place_name: query }]; },
    evaluatePlaceEvidence: () => ({ tier: 'menu_query_candidate', evidenceRank: 1 }),
  });
  const places = await context.searchPlacesForExactMenuOnly({ name: '김치찌개' }, { lat: 37.6, lng: 127 });
  assert.equal(places.length, 2);
  assert.equal(calls.length, 2);
  assert.ok(calls.every(call => call.radius === 3000));
  context.searchPlacesNaver = async () => { throw Object.assign(new Error('provider unavailable'), { code: 'naver_quota_exceeded' }); };
  await assert.rejects(context.searchPlacesForExactMenuOnly({ name: '김치찌개' }, { lat: 37.6, lng: 127 }), { code: 'naver_quota_exceeded' });
});

test('manual location works without a recommended menu and preserves a direct search', async () => {
  let general = 0, direct = '';
  const elements = { manualLocationQuery: { value: '광운대역' }, nearbyContent: { innerHTML: '' } };
  const context = appFunctions(['searchByManualLocation'], {
    document: { getElementById: id => elements[id] }, nearbySearchRequest: 0,
    currentMenu: null, nearbySearchTerm: '', userLocation: null, userLocationLabel: '',
    renderExternalSearchLinks: () => '', escapeHtml: value => value, trackEvent() {},
    resolveManualLocation: async () => ({ lat: 37.619, lng: 127.059, label: '광운대역' }),
    searchNearbyGeneral: async () => { general++; }, runNearbySearch: async value => { direct = value; },
  });
  await context.searchByManualLocation();
  assert.equal(general, 1);
  assert.equal(context.userLocationLabel, '광운대역');
  context.nearbySearchTerm = '제육볶음';
  await context.searchByManualLocation();
  assert.equal(direct, '제육볶음');
  assert.equal(general, 1);
});

test('restaurant links always open Naver with the selected restaurant identity', () => {
  const opened = [];
  const context = appFunctions(['openInMaps', 'openRestaurantResult'], { URL, currentMenu: null, trackEvent() {}, window: { open: (...args) => opened.push(args) } });
  context.openRestaurantResult('one', '밥집', '서울 노원구', 'https://map.naver.com/p/search/one');
  assert.equal(opened[0][0], 'https://map.naver.com/p/search/one');
  context.openRestaurantResult('two', '다른 밥집', '서울 노원구', 'javascript:alert(1)');
  assert.equal(new URL(opened[1][0]).hostname, 'map.naver.com');
  assert.ok(decodeURIComponent(opened[1][0]).includes('다른 밥집 서울 노원구'));
});

test('quoted restaurant names cannot break HTML handler attributes', () => {
  const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const context = appFunctions(['escapeJsString', 'restaurantClickHandler'], { escapeHtml });
  const name = `밥집 O'Brian " onmouseover="alert(1) <식당>`;
  const html = context.restaurantClickHandler({ id: 'one', name, addr: '서울', placeUrl: 'https://map.naver.com/p/search/one' });
  assert.ok(!/["<>]/.test(html));
  const decoded = html.replace(/&(amp|lt|gt|quot|#39);/g, (_, entity) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" })[entity]);
  let selected;
  vm.runInNewContext(decoded, { openRestaurantResult: (...args) => { selected = args; } });
  assert.equal(selected[1], name);
});

test('map replacement removes old markers and click handlers; resizing retains map center', async () => {
  const created = [], removed = [];
  let resize, map;
  const container = { hidden: true, clientWidth: 393, clientHeight: 400 };
  const saved = { window: globalThis.window, document: globalThis.document, ResizeObserver: globalThis.ResizeObserver };
  globalThis.window = { APP_CONFIG: { NAVER_MAPS_CLIENT_ID: 'fixture' }, naver: { maps: {
    LatLng: class { constructor(lat, lng) { this.lat = lat; this.lng = lng; } },
    LatLngBounds: class { constructor(a, b) { assert.ok(a && b); } extend() {} }, Point: class {}, Size: class {},
    Map: class { constructor(_, options) { map = this; this.center = options.center; this.resizes = 0; } getCenter() { return this.center; } setCenter(center) { this.center = center; } setSize() { this.resizes++; } fitBounds() {} },
    Marker: class { constructor(options) { this.options = options; created.push(this); } setMap(value) { assert.equal(value, null); removed.push(this); } },
    Event: { addListener(marker, event, callback) { const listener = { marker, callback }; marker.listener = listener; return listener; }, removeListener(listener) { listener.removed = true; } },
  } } };
  globalThis.document = { getElementById: () => container };
  globalThis.ResizeObserver = class { constructor(callback) { resize = callback; } observe() {} };
  try {
    const module = await import('../js/naver-map.js?unit-map');
    const selected = [];
    await module.renderNaverMap({ lat: 37.619, lng: 127.059 }, [{ name: '<식당 A>', lat: 37.62, lng: 127.06, dist: '100m' }], () => selected.push('A'));
    const first = created[1];
    assert.ok(first.options.icon.content.includes('&lt;식당 A&gt;'));
    first.listener.callback();
    await module.renderNaverMap({ lat: 37.61, lng: 127.05 }, [{ name: '식당 B', lat: 37.61, lng: 127.05, dist: '0m' }], () => selected.push('B'));
    first.listener.callback();
    created[3].listener.callback();
    assert.deepEqual(selected, ['A', 'B']);
    assert.equal(removed.length, 2);
    assert.equal(first.listener.removed, true);
    const before = map.resizes; const center = map.getCenter();
    resize();
    assert.equal(map.getCenter(), center);
    assert.equal(map.resizes, before + 1);
    assert.equal(container.hidden, false);
  } finally { Object.assign(globalThis, saved); }
});

test('an SDK load failure can be retried without leaving a pending promise', async () => {
  const saved = { window: globalThis.window, document: globalThis.document };
  let attempts = 0;
  globalThis.window = { APP_CONFIG: { NAVER_MAPS_CLIENT_ID: 'fixture' } };
  globalThis.document = { createElement: () => ({ remove() {} }), head: { appendChild(script) { attempts++; queueMicrotask(() => script.onerror()); } } };
  try {
    const module = await import('../js/naver-map.js?unit-failed-load');
    for (let i = 0; i < 2; i++) await assert.rejects(module.renderNaverMap({ lat: 37.6, lng: 127 }, []), { message: 'naver_map_load_failed' });
    assert.equal(attempts, 2);
  } finally { Object.assign(globalThis, saved); }
});
