import { createServer } from 'node:http';
import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT || 8787);
const KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY || '';
const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(process.env.DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || resolve(HERE, 'data'));
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

async function appendJsonLine(filename, payload) {
  await mkdir(DATA_DIR, { recursive: true });
  await appendFile(resolve(DATA_DIR, filename), `${JSON.stringify(payload)}\n`, { encoding: 'utf8', mode: 0o600 });
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
    return sendJson(res, 400, { error: 'invalid_parameters' }, origin);
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
  if (query.length < 2) return sendJson(res, 400, { error: 'invalid_query' }, origin);

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
    return sendJson(res, 404, { error: 'location_not_found' }, origin);
  }
  return sendJson(res, 200, { lat, lng, label: cleanString(label || query, 160) }, origin, 'private, max-age=300');
}

async function handleEvents(req, res, origin) {
  const body = await readJsonBody(req);
  const events = Array.isArray(body.events) ? body.events.slice(0, 50) : [];
  if (!events.length) return sendJson(res, 400, { error: 'events_required' }, origin);

  let accepted = 0;
  for (const raw of events) {
    if (!raw || typeof raw !== 'object') continue;
    const name = cleanString(raw.name || raw.eventName, 80);
    const eventId = cleanString(raw.eventId, 100);
    const anonymousUserId = cleanString(raw.anonymousUserId, 100);
    const sessionId = cleanString(raw.sessionId, 100);
    if (!name || !eventId || !anonymousUserId || !sessionId) continue;
    const rawTimestamp = raw.occurredAt || raw.timestamp;
    const timestamp = Number.isFinite(Date.parse(rawTimestamp)) ? new Date(rawTimestamp).toISOString() : new Date().toISOString();
    await appendJsonLine('events.jsonl', {
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
    });
    accepted += 1;
  }
  if (!accepted) return sendJson(res, 400, { error: 'no_valid_events' }, origin);
  return sendJson(res, 202, { accepted }, origin);
}

async function handleFeedback(req, res, origin) {
  const body = await readJsonBody(req);
  const id = cleanString(body.feedbackId || body.id, 100) || `feedback_${Date.now()}`;
  const type = cleanString(body.type, 80);
  const message = cleanString(body.message, 4000);
  if (!type || !message) return sendJson(res, 400, { error: 'type_and_message_required' }, origin);

  await appendJsonLine('feedback.jsonl', {
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
  });
  return sendJson(res, 202, { accepted: true, feedbackId: id }, origin);
}

const server = createServer(async (req, res) => {
  const origin = String(req.headers.origin || '');

  if (!isOriginAllowed(origin)) return sendJson(res, 403, { error: 'origin_not_allowed' });

  if (req.method === 'OPTIONS') {
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Accept, Content-Type');
    res.setHeader('Access-Control-Max-Age', '86400');
    res.writeHead(204);
    return res.end();
  }

  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
  if (rateLimit(ip)) return sendJson(res, 429, { error: 'rate_limit_exceeded' }, origin);

  const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  try {
    if (req.method === 'GET' && requestUrl.pathname === '/api/health') {
      return sendJson(res, 200, {
        ok: true,
        kakaoConfigured: Boolean(KAKAO_REST_API_KEY),
        eventCollection: true,
        feedbackCollection: true,
      }, origin, 'no-store');
    }
    if (req.method === 'GET' && requestUrl.pathname === '/api/nearby') return await handleNearby(requestUrl, res, origin);
    if (req.method === 'GET' && requestUrl.pathname === '/api/resolve-location') return await handleResolveLocation(requestUrl, res, origin);
    if (req.method === 'POST' && requestUrl.pathname === '/api/events') return await handleEvents(req, res, origin);
    if (req.method === 'POST' && requestUrl.pathname === '/api/feedback') return await handleFeedback(req, res, origin);
    return sendJson(res, 404, { error: 'not_found' }, origin);
  } catch (error) {
    const status = Number(error?.statusCode) || 500;
    const payload = { error: cleanString(error?.message || 'internal_error', 100) };
    if (error?.detail) payload.detail = cleanString(error.detail, 240);
    return sendJson(res, status, payload, origin);
  }
});

server.listen(PORT, () => {
  console.log(`Today's Plate beta API listening on http://localhost:${PORT}`);
  console.log(`Data directory: ${DATA_DIR}`);
});
