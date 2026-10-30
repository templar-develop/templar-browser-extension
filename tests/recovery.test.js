import test from 'node:test';
import assert from 'node:assert/strict';
import { BrowserApi } from '../runtime/api.js';

const event = () => ({ listeners: [], addListener(fn) { this.listeners.push(fn); } });
const store = data => ({ async get(keys) { return Object.fromEntries(keys.map(k => [k, structuredClone(data[k])])); },
  async set(values) { Object.assign(data, structuredClone(values)); }, async remove(k) { delete data[k]; }, async clear() { for (const k of Object.keys(data)) delete data[k]; } });
const until = async predicate => { for (let i = 0; i < 100; i++) { const value = await predicate(); if (value) return value; await new Promise(r => setImmediate(r)); } throw new Error('recovery did not settle'); };

test('startup with an expired lease blocks until recovery; network events keep manual XHTTP and Disconnect aborts recovery', async t => {
  const now = Date.now();
  const account = { token: 'test_private_session_token_123456789', sessionExpiresAt: now + 600000,
    subscription: { status: 'ACTIVE', expiresAt: now + 3600000, regions: [{ id: 'ch-xhttp', name: 'CH additional', flag: 'ch', transport: 'xhttp' }],
      trafficLimitBytes: null, trafficUsedBytes: 0, devices: { used: 1, limit: 3 } } };
  const lease = { proxy: { host: 'browser-ch.platina300.org', port: 9443 }, username: 'own_user', password: 'own_proxy_password_1234567890', expiresAt: now + 120000, regionId: 'ch-xhttp' };
  const alarms = new Map(); const online = [];
  const api = { runtime: { id: 'own', getURL: p => 'moz-extension://own/' + p, onMessage: event(), onInstalled: event(), onStartup: event(), async sendMessage() {} },
    storage: { local: store({ intentActive: true, selectedRegion: 'ch-xhttp', login: { token: 'tvpn_refresh_123_' + 'r'.repeat(43), expiresAt: now + 86400000 } }),
      session: store({ account, lease: { ...lease, expiresAt: now - 1 } }) },
    proxy: { onRequest: event(), settings: { async get() { return { levelOfControl: 'controlled_by_this_extension' }; } } },
    alarms: { onAlarm: event(), async get(k) { return alarms.get(k); }, async create(k, v) { alarms.set(k, v); }, async clear(k) { alarms.delete(k); } } };
  const previous = { browser: globalThis.browser, event: globalThis.addEventListener, request: BrowserApi.prototype.request };
  globalThis.browser = api; globalThis.addEventListener = (name, fn) => { if (name === 'online') online.push(fn); };
  t.after(() => { BrowserApi.prototype.request = previous.request; if (previous.browser === undefined) delete globalThis.browser; else globalThis.browser = previous.browser; if (previous.event === undefined) delete globalThis.addEventListener; else globalThis.addEventListener = previous.event; });
  let release; let connects = 0; const regions = [];
  BrowserApi.prototype.request = async function (path, options = {}) {
    if (path === '/subscription') return account.subscription;
    if (path === '/connect') {
      connects++; regions.push(options.body.region);
      await new Promise((resolve, reject) => {
        release = resolve;
        options.signal?.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError')), { once: true });
      });
      return lease;
    }
    return {};
  };
  await import('../runtime/background.js?recovery-regression');
  const message = type => new Promise(resolve => api.runtime.onMessage.listeners[0]({ type }, { id: 'own', url: api.runtime.getURL('popup.html') }, resolve));
  await until(() => connects === 1);
  assert.notEqual((await message('GET_STATE')).state.status, 'connected');
  const routing = await api.proxy.onRequest.listeners[0]({ url: 'https://example.com/' });
  assert.equal(routing[0].host, '127.0.0.1'); assert.equal(routing[0].port, 9);
  release(); await until(async () => (await message('GET_STATE')).state.status === 'connected');
  await until(async () => !(await message('GET_STATE')).state.measurement);
  await new Promise(r => setImmediate(r));
  online[0](); await until(() => connects === 2);
  assert.deepEqual(regions, ['ch-xhttp', 'ch-xhttp']);
  const stopped = await message('DISCONNECT');
  assert.equal(stopped.state.active, false); assert.equal(stopped.state.status, 'disconnected');
  online[0](); await new Promise(r => setImmediate(r));
  assert.equal(connects, 2, 'a network event after explicit disconnect must not restart VPN');
  assert.equal((await message('GET_STATE')).state.active, false);
});
