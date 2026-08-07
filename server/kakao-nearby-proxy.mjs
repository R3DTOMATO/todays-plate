import { createServer } from 'node:http';
import { appendFile, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT || 8787);
const KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY || '';
const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(process.env.DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || resolve(HERE, 'data'));
const RETENTION_DAYS = Math.max(30, Number(process.env.DATA_RETENTION_DAYS || 90));
const ALLOWED_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGINS || 'http://localhost:5500,http://127.0.0.1:5500')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
);

const requestBuckets = new Map();
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = Number(process.env.RATE_LIMIT_PER_MINUTE || 120);
const MAX_BODY_BYTES = 256 * 1024;
const MAX_DEDUPE_IDS = 50_000;
const seenEventIds = new Set();
const seenFeedbackIds = new Set();

function isOriginAllowed(origin) {
  return !origin || ALLOWED_ORIGINS.has(origin);
}

function sendJson(res, status, payload, origin = '', cacheControl = 'no-store') {
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': cacheControl,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  res.end(JSON.stringify(payload));
}

function rateLimit(ip) {
  const now = Date.now();
  const current = requestBuckets.get(ip);
  if (!current || now - current.startedAt >= WINDOW_MS) {
    requestBuckets.set(ip, { startedAt: now, count: 1 });
    return false;
  }
  current.count += 1;
  return current.count > MAX_REQUESTS_PER_WINDOW;
}

function parseNumber(value, { min, max, fallback }) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function cleanString(value, max = 200) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}

function cleanScalar(value) {
  if (typeof value === 'string') return cleanString(value, 180);
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean' || value === null) return value;
  return undefined;
}

function sanitizeProperties(value, depth = 0) {
  if (depth > 3 || value === undefined) return undefined;
  const scalar = cleanScalar(value);
  if (scalar !== undefined) return scalar;
  if (Array.isArray(value)) return value.slice(0, 30).map((item) => sanitizeProperties(item, depth + 1)).filter((item) => item !== undefined);
  if (!value || typeof value !== 'object') return undefined;

  const blocked = /(^|_)(lat|lng|latitude|longitude|address|contact|email|phone|memo|photo|image)($|_)/i;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !blocked.test(key))
      .slice(0, 50)
      .map(([key, item]) => [cleanString(key, 64), sanitizeProperties(item, depth + 1)])
      .filter(([, item]) => item !== undefined),
  );
}

async function readJsonBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const error = new Error('payload_too_large');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    const error = new Error('invalid_json');
    error.statusCode = 400;
    throw error;
  }
}

function monthKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const safe = Number.isNaN(date.getTime()) ? new Date() : date;
  return `${safe.getUTCFullYear()}-${String(safe.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthlyFilename(kind, value = new Date()) {
  return `${kind}-${monthKey(value)}.jsonl`;
}

function keepBounded(set, value) {
  if (!value || set.has(value)) return;
  set.add(value);
  if (set.size <= MAX_DEDUPE_IDS) return;
  const removeCount = Math.max(1, Math.floor(MAX_DEDUPE_IDS * 0.1));
  const iterator = set.values();
  for (let i = 0; i < removeCount; i += 1) {
    const next = iterator.next();
    if (next.done) break;
    set.delete(next.value);
  }
}

async function appendJsonLine(filename, payload) {
  await mkdir(DATA_DIR, { recursive: true });
  await appendFile(resolve(DATA_DIR, filename), `${JSON.stringify(payload)}\n`, { encoding: 'utf8', mode: 0o600 });
}

async function readJsonLinesIfExists(filename) {
  try {
    const text = await readFile(resolve(DATA_DIR, filename), 'utf8');
    return text.split(/\r?\n/).filter(Boolean).flatMap((line) => {
      try { return [JSON.parse(line)]; } catch { return []; }
    });
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

async function warmDedupeSets() {
  const now = new Date();
  const previous = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const files = [
    'events.jsonl', 'feedback.jsonl',
    monthlyFilename('events', now), monthlyFilename('events', previous),
    monthlyFilename('feedback', now), monthlyFilename('feedback', previous),
  ];
  for (const filename of [...new Set(files)]) {
    const rows = await readJsonLinesIfExists(filename);
    for (const row of rows) {
      if (row.eventId) keepBounded(seenEventIds, cleanString(row.eventId, 100));
      if (row.id) keepBounded(seenFeedbackIds, cleanString(row.id, 100));
    }
  }
}

async function cleanupExpiredData() {
  await mkdir(DATA_DIR, { recursive: true });
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const names = await readdir(DATA_DIR);
  const removed = [];
  for (const name of names) {
    const match = /^(events|feedback)-(\d{4})-(\d{2})\.jsonl$/.exec(name);
    if (!match) continue;
    const [, , year, month] = match;
    const nextMonth = Date.UTC(Number(year), Number(month), 1);
    if (nextMonth >= cutoff) continue;
    await rm(resolve(DATA_DIR, name), { force: true });
    removed.push(name);
  }
  return removed;
}

async function kakaoRequest(path, params) {
  if (!KAKAO_REST_API_KEY) {
    const error = new Error('server_key_not_configured');
    error.statusCode = 503;
    throw error;
  }
  const upstream = await fetch(`https://dapi.kakao.com${path}?${params}`, {
    headers: { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` },
    signal: AbortSignal.timeout(6_000),
  });
  const text = await upstream.text();
  if (!upstream.ok) {
    const error = new Error('kakao_api_error');
    error.statusCode = upstream.status;
    error.detail = text.slice(0, 240);
    throw error;
  }
  return JSON.parse(text);
}

async function handleNearby(requestUrl, res, origin) {
  const query = cleanString(requestUrl.searchParams.get('query'), 80);
  const x = parseNumber(requestUrl.searchParams.get('x'), { min: 124, max: 132, fallback: NaN });
  const y = parseNumber(requestUrl.searchParams.get('y'), { min: 33, max: 39, fallback: NaN });
  const radius = Math.round(parseNumber(requestUrl.searchParams.get('radius'), { min: 1, max: 20_000, fallback: 5_000 }));
  const size = Math.round(parseNumber(requestUrl.searchParams.get('size'), { min: 1, max: 15, fallback: 15 }));
  const page = Math.round(parseNumber(requestUrl.searchParams.get('page'), { min: 1, max: 45, fallback: 1 }));
  const sort = requestUrl.searchParams.get('sort') === 'distance' ? 'distance' : 'accuracy';

  if (query.length < 2 || !Number.isFinite(x) || !Number.isFinite(y)) {
    return sendJson(res, 400, { error: 'invalid_parameters', errorCode: 'NEARBY_PARAM_001' }, origin);
  }

  const params = new URLSearchParams({ query, x: String(x), y: String(y), radius: String(radius), size: String(size), page: String(page), sort });
  const payload = await kakaoRequest('/v2/local/search/keyword.json', params);
  return sendJson(res, 200, {
    documents: Array.isArray(payload.documents) ? payload.documents : [],
    meta: payload.meta || { is_end: true },
  }, origin, 'private, max-age=30');
}

async function handleResolveLocation(requestUrl, res, origin) {
  const query = cleanString(requestUrl.searchParams.get('query'), 120);
  if (query.length < 2) return sendJson(res, 400, { error: 'invalid_query', errorCode: 'LOCATION_QUERY_001' }, origin);

  let payload = await kakaoRequest('/v2/local/search/address.json', new URLSearchParams({ query, size: '1' }));
  let doc = Array.isArray(payload.documents) ? payload.documents[0] : null;
  let label = doc?.road_address?.address_name || doc?.address?.address_name || doc?.address_name || '';

  if (!doc) {
    payload = await kakaoRequest('/v2/local/search/keyword.json', new URLSearchParams({ query, size: '1', sort: 'accuracy' }));
    doc = Array.isArray(payload.documents) ? payload.documents[0] : null;
    label = doc?.place_name || doc?.road_address_name || doc?.address_name || '';
  }

  const lat = Number(doc?.y);
  const lng = Number(doc?.x);
  if (!doc || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return sendJson(res, 404, { error: 'location_not_found', errorCode: 'LOCATION_NOT_FOUND_001' }, origin);
  }
  return sendJson(res, 200, { lat, lng, label: cleanString(label || query, 160) }, origin, 'private, max-age=300');
}

async function handleEvents(req, res, origin) {
  const body = await readJsonBody(req);
  const events = Array.isArray(body.events) ? body.events.slice(0, 50) : [];
  if (!events.length) return sendJson(res, 400, { error: 'events_required' }, origin);

  let accepted = 0;
  let duplicates = 0;
  let invalid = 0;
  for (const raw of events) {
    if (!raw || typeof raw !== 'object') { invalid += 1; continue; }
    const name = cleanString(raw.name || raw.eventName, 80);
    const eventId = cleanString(raw.eventId, 100);
    const anonymousUserId = cleanString(raw.anonymousUserId, 100);
    const sessionId = cleanString(raw.sessionId, 100);
    if (!name || !eventId || !anonymousUserId || !sessionId) { invalid += 1; continue; }
    if (seenEventIds.has(eventId)) { duplicates += 1; continue; }

    const rawTimestamp = raw.occurredAt || raw.timestamp;
    const timestamp = Number.isFinite(Date.parse(rawTimestamp)) ? new Date(rawTimestamp).toISOString() : new Date().toISOString();
    const record = {
      eventId,
      name,
      anonymousUserId,
      sessionId,
      timestamp,
      receivedAt: new Date().toISOString(),
      appVersion: cleanString(raw.appVersion, 60),
      firstVisit: Boolean(raw.firstVisit),
      previousUseCount: parseNumber(raw.previousUseCount, { min: 0, max: 1_000_000, fallback: 0 }),
      properties: sanitizeProperties(raw.properties || {}),
    };
    await appendJsonLine(monthlyFilename('events', timestamp), record);
    keepBounded(seenEventIds, eventId);
    accepted += 1;
  }
  if (!accepted && !duplicates) return sendJson(res, 400, { error: 'no_valid_events', invalid }, origin);
  return sendJson(res, 202, { accepted, duplicates, invalid, received: events.length }, origin);
}

async function handleFeedback(req, res, origin) {
  const body = await readJsonBody(req);
  const id = cleanString(body.feedbackId || body.id, 100) || `feedback_${Date.now()}`;
  const type = cleanString(body.type, 80);
  const message = cleanString(body.message, 4000);
  if (!type || !message) return sendJson(res, 400, { error: 'type_and_message_required' }, origin);
  if (seenFeedbackIds.has(id)) return sendJson(res, 202, { accepted: true, duplicate: true, feedbackId: id }, origin);

  const record = {
    id,
    type,
    message,
    contact: cleanString(body.contact, 240),
    anonymousUserId: cleanString(body.anonymousUserId, 100),
    sessionId: cleanString(body.sessionId, 100),
    occurredAt: Number.isFinite(Date.parse(body.occurredAt)) ? new Date(body.occurredAt).toISOString() : new Date().toISOString(),
    receivedAt: new Date().toISOString(),
    appVersion: cleanString(body.appVersion, 60),
    context: sanitizeProperties(body.context || {}),
    status: 'received',
  };
  await appendJsonLine(monthlyFilename('feedback', record.receivedAt), record);
  keepBounded(seenFeedbackIds, id);
  return sendJson(res, 202, { accepted: true, duplicate: false, feedbackId: id }, origin);
}

const server = createServer(async (req, res) => {
  const origin = String(req.headers.origin || '');

  if (!isOriginAllowed(origin)) return sendJson(res, 403, { error: 'origin_not_allowed', errorCode: 'CORS_001' });

  if (req.method === 'OPTIONS') {
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Accept, Content-Type');
    res.setHeader('Access-Control-Max-Age', '86400');
    res.writeHead(204);
    return res.end();
  }

  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
  if (rateLimit(ip)) return sendJson(res, 429, { error: 'rate_limit_exceeded', errorCode: 'RATE_LIMIT_001' }, origin);

  const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  try {
    if (req.method === 'GET' && requestUrl.pathname === '/api/health') {
      return sendJson(res, 200, {
        ok: true,
        version: '4.9.0',
        kakaoConfigured: Boolean(KAKAO_REST_API_KEY),
        eventCollection: true,
        feedbackCollection: true,
        storageMode: 'monthly-jsonl',
        retentionDays: RETENTION_DAYS,
      }, origin, 'no-store');
    }
    if (req.method === 'GET' && requestUrl.pathname === '/api/nearby') return await handleNearby(requestUrl, res, origin);
    if (req.method === 'GET' && requestUrl.pathname === '/api/resolve-location') return await handleResolveLocation(requestUrl, res, origin);
    if (req.method === 'POST' && requestUrl.pathname === '/api/events') return await handleEvents(req, res, origin);
    if (req.method === 'POST' && requestUrl.pathname === '/api/feedback') return await handleFeedback(req, res, origin);
    return sendJson(res, 404, { error: 'not_found', errorCode: 'ROUTE_404' }, origin);
  } catch (error) {
    const status = Number(error?.statusCode) || 500;
    const payload = { error: cleanString(error?.message || 'internal_error', 100), errorCode: status >= 500 ? 'SERVER_001' : 'REQUEST_001' };
    if (error?.detail) payload.detail = cleanString(error.detail, 240);
    return sendJson(res, status, payload, origin);
  }
});

await mkdir(DATA_DIR, { recursive: true });
await cleanupExpiredData();
await warmDedupeSets();

setInterval(() => {
  const cutoff = Date.now() - WINDOW_MS * 2;
  for (const [ip, bucket] of requestBuckets) {
    if (bucket.startedAt < cutoff) requestBuckets.delete(ip);
  }
}, 5 * 60_000).unref();

server.listen(PORT, () => {
  console.log(`Today's Plate beta API v4.9.0 listening on http://localhost:${PORT}`);
  console.log(`Data directory: ${DATA_DIR}`);
  console.log(`Retention: ${RETENTION_DAYS} days`);
});
