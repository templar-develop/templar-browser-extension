import { throwIfCancelled } from './measurement-job.js';
import { checkedLatencyHost } from './gateway-latency.js';

const MAX_RESPONSE = 128 * 1024;
const PRODUCTION_ORIGINS = new Set(['https://cabinet.templarvpn.com', 'https://api.templarvpn.com']);

export function checkedApiBase(value, allowLocalFixture = false) {
  const url = new URL(value);
  const local = allowLocalFixture && url.protocol === 'http:' && url.hostname === '127.0.0.1';
  if ((!local && !PRODUCTION_ORIGINS.has(url.origin)) || url.username || url.password || url.search || url.hash
      || url.pathname !== '/api/browser/v1') throw new Error('INVALID_API_BASE');
  return url.href;
}

export class ApiError extends Error {
  constructor(code) { super(code); this.code = code; }
}

export class BrowserApi {
  constructor(base, { fetcher = globalThis.fetch.bind(globalThis), allowLocalFixture = false } = {}) {
    this.base = base ? checkedApiBase(base, allowLocalFixture) : null;
    this.fetcher = fetcher;
  }

  async request(path, { method = 'GET', token, body, signal, timeout = 10000 } = {}) {
    if (!this.base) throw new ApiError('SERVICE_NOT_CONFIGURED');
    if (!/^\/(?:session|subscription|connect|disconnect|latency|auth\/(?:refresh|revoke|remember|telegram|telegram\/poll|cabinet|cabinet\/poll|cabinet\/cancel))$/.test(path)) throw new ApiError('INVALID_API_PATH');
    throwIfCancelled(signal);
    let response;
    try {
      response = await this.fetcher(this.base + path, { method, redirect: 'error', credentials: 'omit', cache: 'no-store',
        referrerPolicy: 'no-referrer', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout),
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    } catch { throwIfCancelled(signal); throw new ApiError('SERVICE_UNAVAILABLE'); }
    if (!response.ok) {
      if (path === '/latency' && [404, 405, 501].includes(response.status)) throw new ApiError('LATENCY_UNAVAILABLE');
      let error;
      try { error = (await readJson(response)).error; } catch { /* Only bounded, known error codes may reach the UI. */ }
      const known = { 401: ['INVALID_LOGIN'], 403: ['EMAIL_UNVERIFIED', 'SUBSCRIPTION_REQUIRED', 'CABINET_DENIED'], 409: ['DEVICE_LIMIT_REACHED'], 410: ['CABINET_EXPIRED'] };
      if (known[response.status]?.includes(error)) throw new ApiError(error);
      if ([401, 403].includes(response.status)) throw new ApiError('ACCESS_DENIED');
      if (response.status === 429) throw new ApiError('RATE_LIMITED');
      throw new ApiError('SERVICE_UNAVAILABLE');
    }
    try { return await readJson(response); } catch (error) { throwIfCancelled(signal); throw error; }
  }
}

async function readJson(response) {
  if (!(response.headers.get('content-type') || '').includes('application/json')) throw new ApiError('INVALID_RESPONSE');
  if (!response.body || typeof response.body.getReader !== 'function') throw new ApiError('INVALID_RESPONSE');
  const chunks = [];
  const reader = response.body.getReader();
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_RESPONSE) { await reader.cancel(); throw new ApiError('INVALID_RESPONSE'); }
      chunks.push(value);
    }
    const buffer = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder().decode(buffer));
  } catch { throw new ApiError('INVALID_RESPONSE'); }
}

export function checkedSubscription(value, now = Date.now()) {
  if (value?.status !== 'ACTIVE' || !Number.isFinite(value.expiresAt) || value.expiresAt <= now) throw new ApiError('ACCESS_DENIED');
  if (!Array.isArray(value.regions) || value.regions.length < 1 || value.regions.length > 64) throw new ApiError('INVALID_RESPONSE');
  const ids = new Set();
  const regions = value.regions.map(region => {
    if (!/^[a-z0-9_-]{1,24}$/.test(region.id) || ids.has(region.id) || typeof region.name !== 'string'
        || !region.name.trim() || region.name.length > 80 || region.id === 'auto'
        || !['tcp', 'xhttp'].includes(region.transport) || !/^[a-z]{2}$/.test(region.flag)) throw new ApiError('INVALID_RESPONSE');
    ids.add(region.id);
    const load = region.load === undefined ? null : region.load;
    if (load !== null && !['low', 'medium', 'high'].includes(load)) throw new ApiError('INVALID_RESPONSE');
    return { id: region.id, name: region.name, flag: region.flag, transport: region.transport, load,
      ...(region.latencyHost === undefined ? {} : { latencyHost: checkedLatencyHost(region.latencyHost) }) };
  });
  if (value.trafficLimitBytes !== null && (!Number.isSafeInteger(value.trafficLimitBytes) || value.trafficLimitBytes < 1)) throw new ApiError('INVALID_RESPONSE');
  if (!Number.isSafeInteger(value.trafficUsedBytes) || value.trafficUsedBytes < 0
      || (value.trafficLimitBytes !== null && value.trafficUsedBytes >= value.trafficLimitBytes)) throw new ApiError('ACCESS_DENIED');
  // Device capacity is authoritative for access control. Do not silently
  // downgrade an old/malformed response to one device on the client.
  const devices = value.devices;
  if (!Number.isSafeInteger(devices.used) || devices.used < 0 || !Number.isSafeInteger(devices.limit)
      || devices.limit < 1 || devices.used > devices.limit) throw new ApiError('INVALID_RESPONSE');
  const accountLabel = typeof value.accountLabel === 'string' && [...value.accountLabel].length <= 254
    && value.accountLabel.trim() === value.accountLabel && !/[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(value.accountLabel) ? value.accountLabel || null : null;
  return { status: 'ACTIVE', expiresAt: value.expiresAt, regions, accountLabel,
    trafficLimitBytes: value.trafficLimitBytes, trafficUsedBytes: value.trafficUsedBytes, devices: { used: devices.used, limit: devices.limit } };
}

export function checkedSession(value, now = Date.now()) {
  if (typeof value?.token !== 'string' || !/^[A-Za-z0-9._~-]{24,4096}$/.test(value.token)
      || !Number.isFinite(value.sessionExpiresAt) || value.sessionExpiresAt <= now
      || value.sessionExpiresAt > now + 24 * 60 * 60_000) throw new ApiError('INVALID_RESPONSE');
  return { token: value.token, sessionExpiresAt: value.sessionExpiresAt, subscription: checkedSubscription(value.subscription, now) };
}

export function checkedRefresh(value, now = Date.now()) {
  if (!value || typeof value.token !== 'string' || !/^tvpn_refresh_[1-9][0-9]{0,17}_[A-Za-z0-9_-]{43}$/.test(value.token)
      || !Number.isSafeInteger(value.expiresAt) || value.expiresAt <= now || value.expiresAt > now + 30 * 86400_000) throw new ApiError('ACCESS_DENIED');
  return { token: value.token, expiresAt: value.expiresAt };
}
