import test from 'node:test';
import assert from 'node:assert/strict';
import { BrowserApi } from '../runtime/api.js';

const event = () => ({ listeners: [], addListener(fn) { this.listeners.push(fn); } });
const store = data => ({ async get(keys) { return Object.fromEntries(keys.map(k => [k, structuredClone(data[k])])); },
  async set(values) { Object.assign(data, structuredClone(values)); }, async remove(k) { delete data[k]; },
  async clear() { for (const key of Object.keys(data)) delete data[key]; } });
const until = async predicate => {
  for (let i = 0; i < 200; i++) { if (await predicate()) return; await new Promise(r => setImmediate(r)); }
  throw new Error('BACKGROUND_DID_NOT_SETTLE');
};

test('event storms, simultaneous popups and delayed replies cannot duplicate work or resurrect a disconnected session', async t => {
  const now = Date.now();
  const account = { token: 'synthetic_access_token_for_storm_test', sessionExpiresAt: now + 600_000,
    subscription: { status: 'ACTIVE', expiresAt: now + 3600_000, trafficLimitBytes: null, trafficUsedBytes: 0,
      devices: { used: 1, limit: 3 }, regions: [{ id: 'ch-xhttp', name: 'CH XHTTP', flag: 'ch', transport: 'xhttp' }] } };
  const lease = { proxy: { host: 'browser-ch.platina300.org', port: 9443 }, username: 'synthetic_worker',
    password: 'synthetic_proxy_secret_for_storm_test', expiresAt: now + 120_000, regionId: 'ch-xhttp' };
  const alarms = new Map(); let alarmCreates = 0, notifications = 0, popupOpen = true;
  const local = { selectedRegion: 'ch-xhttp', intentActive: true,
    login: { token: 'tvpn_refresh_123_' + 'r'.repeat(43), expiresAt: now + 86400_000 } };
  const session = { account, lease, connectedAt: now };
  const online = [];
  const api = { runtime: { id: 'own', getURL: path => 'moz-extension://own/' + path, onMessage: event(),
    onInstalled: event(), onStartup: event(), async sendMessage() { notifications++; if (!popupOpen) throw new Error('closed popup'); } },
    storage: { local: store(local), session: store(session) },
    proxy: { onRequest: event(), settings: { async get() { return { levelOfControl: 'controlled_by_this_extension' }; } } },
    alarms: { onAlarm: event(), async get(k) { return alarms.get(k); },
      async create(k, v) { alarmCreates++; alarms.set(k, v); }, async clear(k) { alarms.delete(k); } } };
  const previous = { browser: globalThis.browser, events: globalThis.addEventListener, request: BrowserApi.prototype.request };
  globalThis.browser = api;
  globalThis.addEventListener = (name, fn) => { if (name === 'online') online.push(fn); };
  t.after(() => {
    BrowserApi.prototype.request = previous.request;
    if (previous.browser === undefined) delete globalThis.browser; else globalThis.browser = previous.browser;
    if (previous.events === undefined) delete globalThis.addEventListener; else globalThis.addEventListener = previous.events;
  });
  const counts = {}; let holdPath, release, began = false;
  BrowserApi.prototype.request = async function(path, options = {}) {
    counts[path] = (counts[path] || 0) + 1;
    if (path === holdPath) {
      began = true;
      await new Promise((resolve, reject) => {
        const abort = () => reject(new DOMException('cancelled', 'AbortError'));
        options.signal?.addEventListener('abort', abort, { once: true });
        release = () => { options.signal?.removeEventListener('abort', abort); resolve(); };
        if (options.signal?.aborted) abort();
      });
    }
    if (path === '/subscription') return account.subscription;
    if (path === '/connect') return { ...lease, expiresAt: Date.now() + 120_000 };
    return {};
  };
  await import('../runtime/background.js?lifecycle-stress');
  const send = type => new Promise(resolve => api.runtime.onMessage.listeners[0]({ type },
    { id: 'own', url: api.runtime.getURL('popup.html') }, resolve));
  assert.equal((await send('GET_STATE')).state.status, 'connected');
  assert.equal(alarmCreates, 1);

  holdPath = '/subscription';
  for (let i = 0; i < 1000; i++) online[0]();
  await until(() => began);
  const reads = await Promise.all(Array.from({ length: 250 }, () => send('GET_STATE')));
  assert.ok(reads.every(value => value.ok && value.state.measurement?.kind === 'connect'));
  assert.equal(counts['/subscription'], 1);
  assert.equal(counts['/connect'] || 0, 0);
  release(); holdPath = undefined;
  await until(async () => (await send('GET_STATE')).state.measurement === null);
  assert.equal(counts['/connect'], 1);
  assert.equal((await send('GET_STATE')).state.selectedRegion, 'ch-xhttp');

  // One queued renewal for a thousand alarm events, even with no open popup.
  holdPath = '/subscription'; began = false; popupOpen = false;
  for (let i = 0; i < 1000; i++) api.alarms.onAlarm.listeners[0]({ name: 'templar-renew' });
  await until(() => began);
  assert.equal(counts['/subscription'], 2);
  const stopped = await send('DISCONNECT');
  release(); holdPath = undefined;
  assert.equal(stopped.state.status, 'disconnected');
  assert.equal(stopped.state.active, false);
  assert.equal(counts['/connect'], 1);
  for (let i = 0; i < 1000; i++) online[0]();
  await until(async () => !(await send('GET_STATE')).state.measurement);
  assert.equal(counts['/connect'], 1, 'network availability must respect the explicit Disconnect intent');
  assert.equal(alarms.has('templar-renew'), false);

  // Repeated clicks from several popups reserve exactly one connection job.
  holdPath = '/connect'; began = false;
  const connecting = send('CONNECT'); await until(() => began);
  const duplicates = await Promise.all(Array.from({ length: 1000 }, () => send('CONNECT')));
  assert.ok(duplicates.every(value => value.error === 'MEASUREMENT_BUSY'));
  assert.equal(counts['/connect'], 2);
  const loggedOut = send('LOGOUT');
  assert.equal((await connecting).error, 'MEASUREMENT_CANCELLED');
  const final = await loggedOut;
  release(); holdPath = undefined;
  assert.equal(final.state.active, false); assert.equal(final.state.subscription, null);
  assert.deepEqual(session, {}); assert.equal(local.login, undefined);
  assert.equal(alarms.size, 0);
  assert.equal((await send('GET_STATE')).state.measurement, null);
  for (const secret of [account.token, lease.password, lease.username]) assert.equal(JSON.stringify(final).includes(secret), false);
  t.diagnostic(JSON.stringify({ networkEvents: 2000, alarmEvents: 1000, duplicateClicks: 1000,
    simultaneousReads: 250, subscriptionRequests: counts['/subscription'], connectRequests: counts['/connect'], notifications }));
});
