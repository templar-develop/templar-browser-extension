import test from 'node:test';
import assert from 'node:assert/strict';

function event() {
  return { listeners: [], addListener(fn) { this.listeners.push(fn); } };
}
function store(data) {
  return { async get(keys) { return Object.fromEntries(keys.map(key => [key, structuredClone(data[key])])); },
    async set(values) { Object.assign(data, structuredClone(values)); }, async remove(key) { delete data[key]; }, async clear() { for (const key of Object.keys(data)) delete data[key]; } };
}

test('popup reads preserve renewal deadline; a failed background renewal publishes only safe state', async t => {
  const now = Date.now();
  const account = { token: 'private_session_token_1234567890', sessionExpiresAt: now + 600_000,
    subscription: { status: 'ACTIVE', expiresAt: now + 3600_000, regions: [{ id: 'ch', name: 'Швейцария', flag: 'ch', transport: 'tcp' }], trafficLimitBytes: null, trafficUsedBytes: 0, devices: { used: 1, limit: 1 } } };
  const lease = { proxy: { host: 'browser-ch.platina300.org', port: 9443 }, username: 'private_user', password: 'private_proxy_password_123456789', expiresAt: now + 120_000, regionId: 'ch' };
  const alarms = new Map(); let creates = 0;
  let notify;
  const published = new Promise(resolve => { notify = resolve; });
  const previous = globalThis.browser;
  const api = { runtime: { id: 'own', getURL: path => 'moz-extension://own/' + path, onMessage: event(), onInstalled: event(), onStartup: event(),
    async sendMessage(message) { notify(message); } },
    storage: { local: store({ intentActive: true, selectedRegion: 'ch' }), session: store({ account, lease, connectedAt: now, telegramLogin: { token: 'z'.repeat(32), expiresAt: now + 300000 } }) },
    proxy: { onRequest: event(), settings: { async get() { return { levelOfControl: 'controlled_by_this_extension' }; } } },
    alarms: { onAlarm: event(), async get(name) { return alarms.get(name); },
      async create(name, options) { creates++; alarms.set(name, { ...options, scheduledTime: now + 30000 + creates }); }, async clear(name) { alarms.delete(name); } } };
  globalThis.browser = api;
  t.after(() => { if (previous === undefined) delete globalThis.browser; else globalThis.browser = previous; });
  await import('../runtime/background.js?renewal-regression');
  const message = type => new Promise(resolve => api.runtime.onMessage.listeners[0]({ type }, { id: 'own', url: api.runtime.getURL('popup.html') }, resolve));
  assert.equal((await message('GET_STATE')).state.status, 'connected');
  await t.test('web pages, foreign extensions and non-popup contexts cannot read state or issue commands', async () => {
    for (const sender of [
      { id: 'foreign-extension', url: api.runtime.getURL('popup.html') },
      { id: 'own', url: 'https://attacker.example/popup.html' },
      { id: 'own', url: api.runtime.getURL('other.html') },
      { id: 'own', url: api.runtime.getURL('popup.html') + '?spoofed=1' },
      { id: 'own' },
      {},
    ]) for (const type of ['GET_STATE', 'CONNECT', 'DISCONNECT', 'LOGIN_EMAIL', 'RULES', 'LOGOUT']) {
      let response;
      const asynchronous = api.runtime.onMessage.listeners[0]({ type }, sender, value => { response = value; });
      assert.equal(asynchronous, false);
      assert.deepEqual(response, { ok: false, error: 'ACCESS_DENIED' });
    }
    assert.equal((await message('GET_STATE')).state.status, 'connected');
  });
  assert.equal((await message('GET_STATE')).state.telegramPending, true);
  assert.equal(JSON.stringify((await message('GET_STATE')).state).includes('z'.repeat(32)), false);
  const scheduled = alarms.get('templar-renew').scheduledTime;
  for (let i = 0; i < 10; i++) assert.equal((await message('GET_STATE')).state.status, 'connected');
  assert.equal(creates, 2);
  assert.equal(alarms.get('templar-renew').scheduledTime, scheduled);
  // The source build intentionally has no network API. A renewal must block
  // and inform an open popup even though it did not initiate a command.
  api.alarms.onAlarm.listeners[0]({ name: 'templar-renew' });
  const notification = await published;
  assert.equal(notification.type, 'STATE_UPDATED');
  assert.equal(notification.state.status, 'blocked');
  assert.equal(notification.state.active, true);
  const visible = JSON.stringify(notification);
  for (const secret of [account.token, lease.username, lease.password, 'z'.repeat(32)]) assert.equal(visible.includes(secret), false);
  api.runtime.sendMessage = async () => { throw new Error('popup closed'); };
  api.alarms.onAlarm.listeners[0]({ name: 'templar-renew' });
  assert.ok(['blocked', 'connecting'].includes((await message('GET_STATE')).state.status), 'a read during retry may see restoration, but never a connected stale lease');
  assert.equal((await message('DISCONNECT')).state.status, 'disconnected');
  assert.equal(alarms.has('templar-renew'), false);
  assert.equal(alarms.has('templar-login'), true);
  await message('LOGOUT');
  assert.equal(alarms.size, 0);
});
