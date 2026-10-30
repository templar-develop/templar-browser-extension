import test from 'node:test';
import assert from 'node:assert/strict';
import { Controller } from '../runtime/controller.js';
import { BrowserApi } from '../runtime/api.js';

function store(initial = {}) {
  const data = structuredClone(initial);
  return { data, async get(keys) { return Object.fromEntries(keys.map(key => [key, structuredClone(data[key])])); },
    async set(values) { Object.assign(data, structuredClone(values)); }, async remove(key) { delete data[key]; }, async clear() { for (const key of Object.keys(data)) delete data[key]; } };
}
function tickets(regions) {
  return { probes: Object.fromEntries(regions.map(r => [r.id, { regionId: r.id, host: r.latencyHost, ticket: 'bp_' + 't'.repeat(43), expiresAt: Date.now() + 15000 }])) };
}
function fixture() {
  const now = Date.now();
  const account = { token: 'private_session_token_1234567890', sessionExpiresAt: now + 600_000,
    subscription: { status: 'ACTIVE', expiresAt: now + 3600_000, regions: [{ id: 'ch', name: 'Швейцария', flag: 'ch', transport: 'tcp', latencyHost: 'browser-ch.platina300.org' }, { id: 'se', name: 'Швеция', flag: 'se', transport: 'tcp', latencyHost: 'browser-se.platina300.org' }], trafficLimitBytes: null, trafficUsedBytes: 0, devices: { used: 1, limit: 1 } } };
  const lease = { proxy: { host: 'browser-ch.platina300.org', port: 9443 }, username: 'private_user', password: 'private_proxy_password_123456789', expiresAt: now + 120_000, regionId: 'ch' };
  const driver = { calls: [], async install(rules, lease, blocked) { this.calls.push({ rules, lease, blocked }); }, async clear() { this.calls.push({ clear: true }); } };
  const local = store(); const session = store();
  const api = { base: 'fixture', async request(path) { if (path === '/session') return account; if (path === '/connect') return lease; if (path === '/subscription') return account.subscription; if (path === '/latency') return tickets(account.subscription.regions); return {}; } };
  return { now, account, lease, driver, local, session, api, core: Object.assign(new Controller({ api, driver, local, session, now: () => now, gatewayProbe: async () => null }), { selectedRegion: 'ch' }) };
}
test('a transient remembered-login refresh failure keeps the original still-authorized route until its deadline', async () => {
  for (const failure of ['SERVICE_UNAVAILABLE', 'RATE_LIMITED']) {
    const f = fixture();
    f.account.sessionExpiresAt = f.now + 90_000;
    f.lease.expiresAt = f.now + 75_000;
    await f.core.acceptSession({ ...f.account, refresh: { token: 'tvpn_refresh_123_' + 'r'.repeat(43), expiresAt: f.now + 86400_000 } });
    await f.core.connect();
    const original = structuredClone(f.core.lease), connectedAt = f.core.connectedAt;
    const installs = f.driver.calls.length;
    f.core.now = () => f.now + 40_000;
    const request = f.api.request.bind(f.api);
    f.api.request = async (path, options) => {
      if (path === '/auth/refresh') throw new Error(failure);
      return request(path, options);
    };
    await assert.rejects(f.core.refresh(), new RegExp(failure));
    assert.equal(f.core.publicState().status, 'connected');
    assert.deepEqual(f.core.lease, original);
    assert.equal(f.core.connectedAt, connectedAt);
    assert.equal(f.driver.calls.length, installs, 'a temporary auth outage must not replace the valid browser route');
    f.core.now = () => original.expiresAt + 1;
    await assert.rejects(f.core.refresh(), new RegExp(failure));
    assert.equal(f.core.publicState().status, 'blocked');
    assert.equal(f.driver.calls.at(-1).blocked, true);
  }
});
test('connect, selected-region renewal and safe public state', async () => {
  const f = fixture(); await f.core.authenticate('/session', {}); await f.core.select('ch'); await f.core.connect();
  assert.equal(f.core.publicState().status, 'connected'); await f.core.refresh(); assert.equal(f.core.publicState().selectedRegion, 'ch');
  assert.ok(Number.isSafeInteger(f.core.publicState().connectedAt));
  await f.core.disconnect(); assert.equal(f.core.publicState().connectedAt, null);
  const visible = JSON.stringify(f.core.publicState());
  for (const secret of [f.account.token, f.lease.password, f.lease.username]) assert.equal(visible.includes(secret), false);
  assert.equal(JSON.stringify(f.local.data).includes(f.account.token), false);
});
test('an invalid replacement cannot remove a connected current subscription', async () => {
  const f = fixture(); await f.core.authenticate('/session', {}); await f.core.connect();
  f.api.request = async () => ({ ...f.account, subscription: { ...f.account.subscription, status: 'DISABLED' } });
  await assert.rejects(f.core.authenticate('/session', {})); assert.equal(f.core.status, 'connected'); assert.equal(f.core.account.token, f.account.token);
});
test('a new valid subscription disconnects before replacing the session', async () => {
  const f = fixture(); await f.core.authenticate('/session', {}); await f.core.select('ch'); await f.core.connect();
  f.api.request = async path => path === '/session' ? { ...f.account, token: 'another_private_session_token_123456' } : {};
  await f.core.authenticate('/session', {}); assert.equal(f.core.status, 'disconnected'); assert.equal(f.core.selectedRegion, 'ch');
});
test('a manual region cannot be silently changed by the server', async () => {
  const f = fixture(); await f.core.authenticate('/session', {}); await f.core.select('se');
  await assert.rejects(f.core.connect(), /INVALID_REGION/); assert.equal(f.core.status, 'blocked');
});
test('renewal preserves the selected XHTTP profile and refuses a TCP replacement', async () => {
  const f = fixture();
  f.account.subscription.regions.push({ id: 'ch-xhttp', name: 'Швейцария — Дополнительный', flag: 'ch', transport: 'xhttp' });
  const selected = [];
  f.api.request = async (path, options) => {
    if (path === '/session') return f.account;
    if (path === '/subscription') return f.account.subscription;
    if (path === '/latency') return tickets(f.account.subscription.regions.filter(r => r.transport === 'tcp'));
    if (path === '/connect') { selected.push(options.body.region); return { ...f.lease, regionId: options.body.region }; }
    return {};
  };
  await f.core.authenticate('/session', {}); await f.core.select('ch-xhttp'); await f.core.connect(); await f.core.refresh();
  assert.deepEqual(selected, ['ch-xhttp', 'ch-xhttp']);
  assert.equal(f.local.data.selectedRegion, 'ch-xhttp');
  f.api.request = async () => f.lease;
  await assert.rejects(f.core.connect(), /INVALID_REGION/);
  assert.equal(f.core.selectedRegion, 'ch-xhttp');
});
test('revoked/failed refresh blocks protected requests and preserves active intent', async () => {
  const f = fixture(); await f.core.authenticate('/session', {}); await f.core.connect();
  f.api.request = async () => { throw new Error('ACCESS_DENIED'); };
  await assert.rejects(f.core.refresh()); assert.equal(f.core.status, 'blocked'); assert.equal(f.driver.calls.at(-1).blocked, true); assert.equal(f.local.data.intentActive, true);
});
test('temporary subscription and renewal failures preserve a live tunnel only until its original deadline', async () => {
  for (const path of ['/subscription', '/connect']) {
    const f = fixture(); await f.core.authenticate('/session', {}); await f.core.connect();
    const before = structuredClone(f.core.lease), connectedAt = f.core.connectedAt;
    const installs = f.driver.calls.length, request = f.api.request.bind(f.api);
    f.api.request = async (next, options) => { if (next === path) throw new Error('SERVICE_UNAVAILABLE'); return request(next, options); };
    await assert.rejects(f.core.refresh(), /SERVICE_UNAVAILABLE/);
    assert.equal(f.core.publicState().status, 'connected');
    assert.deepEqual(f.core.lease, before);
    assert.equal(f.driver.calls.length, installs);
    assert.equal(f.core.connectedAt, connectedAt);
    f.core.now = () => before.expiresAt + 1;
    await assert.rejects(f.core.refresh(), /SERVICE_UNAVAILABLE/);
    assert.equal(f.core.publicState().status, 'blocked');
    assert.equal(f.driver.calls.at(-1).blocked, true);
    f.api.request = request; f.core.now = () => f.now + 5000;
    await f.core.refresh();
    assert.equal(f.core.publicState().status, 'connected');
  }
});
test('a temporary error never restores a lease after access-token replacement', async () => {
  const f = fixture(); await f.core.acceptSession({ ...f.account, sessionExpiresAt: f.now + 30_000,
    refresh: { token: 'tvpn_refresh_123_' + 'r'.repeat(43), expiresAt: f.now + 86400_000 } });
  f.core.lease = f.lease; f.core.active = true; f.core.status = 'connected';
  f.api.request = async path => {
    if (path === '/auth/refresh') return { ...f.account, token: 'rotated_private_session_token_123456', refresh: f.core.login };
    throw new Error('SERVICE_UNAVAILABLE');
  };
  await assert.rejects(f.core.refresh(), /SERVICE_UNAVAILABLE/);
  assert.equal(f.core.publicState().status, 'blocked');
  assert.equal(f.core.lease, null);
});
test('worker restart with expired lease keeps a valid account but installs a blocking route', async () => {
  const f = fixture(); await f.local.set({ intentActive: true, selectedRegion: 'ch' });
  await f.session.set({ account: f.account, lease: { ...f.lease, expiresAt: f.now - 1 } });
  await f.core.init(); assert.equal(f.core.status, 'blocked'); assert.ok(f.core.account); assert.equal(f.driver.calls.at(-1).blocked, true);
});
test('explicit logout works when API is offline and clears private session data', async () => {
  const f = fixture(); await f.core.authenticate('/session', {}); await f.core.connect();
  f.api.request = async () => { throw new Error('offline'); };
  await f.core.logout(); assert.equal(f.core.account, null); assert.equal(f.core.active, false); assert.deepEqual(f.session.data, {}); assert.equal(f.local.data.intentActive, false);
});

test('editing domain routes preserves RF bypass and renewal until explicitly changed', async () => {
  const f = fixture();
  const connections = [];
  const request = f.api.request.bind(f.api);
  f.api.request = async (path, options) => {
    if (path === '/connect') connections.push(options.body.rfServices);
    return request(path, options);
  };
  await f.core.authenticate('/session', {});
  await f.core.updateRules({ mode: 'all', domains: [], rfServices: false });
  await f.core.connect();
  for (const change of [
    { mode: 'bypass', domains: [] },
    { mode: 'bypass', domains: ['example.com'] },
    { mode: 'only', domains: ['example.com'] },
    { mode: 'only', domains: [] },
  ]) {
    await f.core.updateRules(change);
    assert.equal(f.core.publicState().rules.rfServices, false);
    assert.equal(f.driver.calls.at(-1).rules.rfServices, false);
    assert.equal(f.local.data.rules.rfServices, false);
  }
  await f.core.refresh();
  assert.deepEqual(connections, [false, false]);
  await f.core.updateRules({ mode: 'all', domains: [], rfServices: true });
  assert.equal(f.core.publicState().rules.rfServices, true);
  assert.deepEqual(connections, [false, false, true]);
});
test('default development configuration cannot authenticate or claim connection', async () => {
  const f = fixture(); const core = new Controller({ api: new BrowserApi(null), driver: f.driver, local: f.local, session: f.session });
  await assert.rejects(core.authenticate('/session', {})); assert.equal(core.publicState().status, 'disconnected'); assert.equal(core.publicState().serviceConfigured, false);
});
test('expired lease is not displayed as connected while an alarm is delayed', async () => {
  const f = fixture(); await f.core.authenticate('/session', {}); await f.core.connect();
  f.core.now = () => f.now + 121_000;
  assert.equal(f.core.publicState().status, 'blocked');
});
test('logout revokes private state even if browser proxy removal fails', async () => {
  const f = fixture(); await f.core.authenticate('/session', {}); await f.core.connect();
  f.driver.clear = async () => { throw new Error('browser failure'); };
  await assert.rejects(f.core.logout());
  assert.equal(f.core.account, null); assert.equal(f.core.lease, null); assert.deepEqual(f.session.data, {});
  assert.equal(f.core.publicState().status, 'blocked'); assert.equal(f.driver.context.forceBlocked, true);
});

test('auto ranks parallel site latency, connects only to the winner and keeps it on renewal', async () => {
  const f = fixture();
  f.account.subscription.regions.push({ id: 'ch-xhttp', name: 'Дополнительный', flag: 'ch', transport: 'xhttp', latencyHost: 'browser-ch.platina300.org' });
  const requested = [];
  f.api.request = async (path, options) => {
    if (path === '/session') return f.account;
    if (path === '/subscription') return f.account.subscription;
    if (path === '/latency') return tickets(f.account.subscription.regions.filter(r => r.transport === 'tcp'));
    if (path === '/connect') {
      requested.push(options.body.region);
      return { ...f.lease, regionId: options.body.region };
    }
    return {};
  };
  f.core.siteProbe = async probe => probe.host.includes('-ch.') ? 120 : 40;
  await f.core.authenticate('/session', {});
  await f.core.select('auto');
  await f.core.connect();
  assert.equal(f.core.resolvedRegion, 'se');
  assert.deepEqual(f.core.publicState().latencies, { ch: 120, se: 40 });
  const connectedAt = f.core.connectedAt;
  await f.core.refresh();
  assert.deepEqual(requested, ['se', 'se']);
  assert.equal(f.core.connectedAt, connectedAt);
  assert.equal(f.core.selectedRegion, 'auto');
});

test('when all measured TCP routes fail auto preserves blocking intent', async () => {
  const f = fixture();
  f.api.request = async (path, options) => path === '/session' ? f.account : path === '/connect' ? { ...f.lease, regionId: options.body.region } : path === '/latency' ? tickets(f.account.subscription.regions) : {};
  f.core.siteProbe = async () => { throw new Error('unavailable'); };
  const request = f.api.request; f.api.request = async (path, options) => { if (path === '/connect') throw new Error('SERVICE_UNAVAILABLE'); return request(path, options); };
  await f.core.authenticate('/session', {}); await f.core.select('auto');
  await assert.rejects(f.core.connect(), /SERVICE_UNAVAILABLE/);
  assert.equal(f.core.publicState().status, 'blocked');
  assert.equal(f.driver.calls.at(-1).blocked, true);
  assert.equal(f.local.data.intentActive, true);
});

test('Auto keeps a live tunnel through a control outage, then can leave an unavailable resolved node after expiry', async () => {
  const f = fixture(); const requested = [];
  const request = f.api.request.bind(f.api);
  f.api.request = async (path, options) => {
    if (path === '/connect') { requested.push(options.body.region); return { ...f.lease, regionId: options.body.region }; }
    return request(path, options);
  };
  f.core.siteProbe = async probe => probe.regionId === 'ch' ? 10 : 20;
  await f.core.authenticate('/session', {}); await f.core.select('auto'); await f.core.connect();
  assert.equal(f.core.resolvedRegion, 'ch');
  const liveRequest = f.api.request;
  f.api.request = async (path, options) => {
    if (path === '/connect' && options.body.region === 'ch') { requested.push('ch'); throw new Error('SERVICE_UNAVAILABLE'); }
    return liveRequest(path, options);
  };
  await assert.rejects(f.core.refresh(), /SERVICE_UNAVAILABLE/);
  assert.equal(f.core.publicState().status, 'connected');
  assert.deepEqual(requested, ['ch', 'ch']);
  f.core.now = () => f.now + 121_000;
  // Supply renewed deadlines, while keeping the issued region identity exact.
  const unavailable = f.api.request;
  f.api.request = async (path, options) => {
    if (path === '/latency') return { probes: {} };
    const result = await unavailable(path, options);
    return path === '/connect' ? { ...result, expiresAt: f.now + 200_000 } : result;
  };
  await f.core.refresh();
  assert.equal(f.core.publicState().status, 'connected');
  assert.equal(f.core.selectedRegion, 'auto');
  assert.equal(f.core.resolvedRegion, 'se');
  assert.deepEqual(requested, ['ch', 'ch', 'ch', 'se']);
});

test('lost RF replacement response blocks a retired lease and restores previous rules on recovery', async () => {
  const f = fixture();
  await f.core.authenticate('/session', {}); await f.core.updateRules({ mode: 'all', domains: [], rfServices: true }); await f.core.connect();
  const original = f.api.request.bind(f.api);
  f.api.request = async (path, options) => {
    if (path === '/connect') throw new Error('SERVICE_UNAVAILABLE'); // Server may already have retired the old worker.
    return original(path, options);
  };
  await assert.rejects(f.core.updateRules({ mode: 'all', domains: [], rfServices: false }), /SERVICE_UNAVAILABLE/);
  assert.equal(f.core.publicState().status, 'blocked');
  assert.equal(f.core.publicState().rules.rfServices, true);
  assert.equal(f.core.lease, null);
  assert.equal(f.session.data.lease, undefined);
  assert.equal(f.driver.calls.at(-1).blocked, true);
  assert.equal(f.driver.calls.at(-1).lease, null);
  assert.equal(f.local.data.intentActive, true);
  assert.equal(f.core.account.token, f.account.token);
  f.api.request = original; f.core.now = () => f.now + 5000;
  await f.core.refresh();
  assert.equal(f.core.publicState().status, 'connected');
  assert.equal(f.core.publicState().rules.rfServices, true);
  assert.equal(f.core.connectedAt, f.now + 5000);
});

test('invalid renewal cannot leave the active connection displayed as connected', async () => {
  const f = fixture(); await f.core.authenticate('/session', {}); await f.core.connect();
  f.api.request = async () => ({ ...f.lease, regionId: 'se' });
  await assert.rejects(f.core.connect(), /INVALID_REGION/);
  assert.equal(f.core.publicState().status, 'blocked');
  assert.equal(f.driver.calls.at(-1).blocked, true);
  assert.equal(f.session.data.lease, undefined);
});

test('recovery after an expired server lease starts a new connection duration', async () => {
  const f = fixture(); await f.core.authenticate('/session', {}); await f.core.connect();
  const original = f.api.request.bind(f.api);
  f.core.now = () => f.now + 121_000;
  f.api.request = async (path, options) => path === '/connect'
    ? { ...f.lease, expiresAt: f.core.now() + 120_000 } : original(path, options);
  await f.core.refresh();
  assert.equal(f.core.publicState().status, 'connected');
  assert.equal(f.core.connectedAt, f.core.now());
});

test('parallel ping measures TCP/XHTTP separately without touching a live lease, timer or routing', async () => {
  const f = fixture();
  f.account.subscription.regions.push({ id: 'ch-xhttp', name: 'Additional', flag: 'ch', transport: 'xhttp', latencyHost: 'browser-ch.platina300.org' });
  await f.core.authenticate('/session', {}); await f.core.connect();
  const since = f.core.connectedAt; const lease = f.core.lease;
  const calls = f.driver.calls.length;
  f.api.request = async path => { if (path === '/latency') return tickets(f.account.subscription.regions); throw new Error('A ping must not acquire/revoke a lease'); };
  const hosts = []; let inFlight = 0; let max = 0;
  f.core.siteProbe = async probe => {
    const host = probe.host;
    hosts.push(host); max = Math.max(max, ++inFlight);
    await new Promise(resolve => setImmediate(resolve)); inFlight--;
    if (host.includes('-se.')) throw new Error('unreachable');
    return 55;
  };
  await f.core.measureRegions();
  assert.equal(max, 3); assert.equal(hosts.length, 3);
  assert.deepEqual(f.core.latencies, { ch: 55, 'ch-xhttp': 55, se: null });
  assert.equal(f.core.lease, lease); assert.equal(f.core.connectedAt, since);
  assert.equal(f.driver.calls.length, calls); assert.equal(f.core.status, 'connected');
});

for (const active of [true, false]) test(`cancel parallel ping preserves ${active ? 'active' : 'inactive'} routing without restoration`, async () => {
  const f = fixture(); await f.core.authenticate('/session', {});
  if (active) await f.core.connect();
  const lease = f.core.lease; const since = f.core.connectedAt; const calls = f.driver.calls.length;
  const abort = new AbortController();
  f.core.siteProbe = async () => { abort.abort(); throw new Error('cancelled'); };
  await assert.rejects(f.core.measureRegions({ signal: abort.signal }), /MEASUREMENT_CANCELLED/);
  assert.equal(f.core.lease, lease); assert.equal(f.core.connectedAt, since);
  assert.equal(f.driver.calls.length, calls); assert.equal(f.core.active, active);
});

test('warm Auto uses recent RTT without another scan; failed first gateway falls back to the next TCP route', async () => {
  const f = fixture(); await f.core.authenticate('/session', {}); await f.core.select('auto');
  f.core.latencies = { ch: 20, se: 60 }; f.core.latencyUpdatedAt = f.now;
  f.core.siteProbe = async () => { throw new Error('must use fresh cache'); };
  const request = f.api.request; const attempted = [];
  f.api.request = async (path, options) => {
    if (path === '/connect') {
      attempted.push(options.body.region);
      if (options.body.region === 'ch') throw new Error('SERVICE_UNAVAILABLE');
      return { ...f.lease, regionId: 'se' };
    }
    return request(path, options);
  };
  await f.core.connect(); assert.deepEqual(attempted, ['ch', 'se']); assert.equal(f.core.resolvedRegion, 'se');
});

test('cancelled connect cannot install a delayed lease or leave active intent', async () => {
  const f = fixture(); await f.core.authenticate('/session', {});
  const abort = new AbortController(); const request = f.api.request;
  f.api.request = async (path, options) => {
    if (path === '/connect') { abort.abort(); return f.lease; }
    return request(path, options);
  };
  await assert.rejects(f.core.connect({ signal: abort.signal }), /MEASUREMENT_CANCELLED/);
  assert.equal(f.core.lease, null); assert.equal(f.core.active, false);
  assert.equal(f.driver.calls.some(c => c.lease), false); assert.equal(f.local.data.intentActive, false);
});

test('speed results survive a worker restart only for their measured route and disappear on logout', async () => {
  const f = fixture(); await f.core.authenticate('/session', {}); await f.core.connect();
  await f.core.rememberSpeedTest({ download: 70, upload: 40, latency: 60, bytes: 10000000, durationMs: 12000, method: 'https-4-streams', token: 'never_store_extra_fields' });
  const restarted = new Controller({ api: f.api, driver: f.driver, local: f.local, session: f.session, now: () => f.now });
  await restarted.init(); assert.equal(restarted.publicState().speedtest.download, 70);
  assert.equal(JSON.stringify(f.session.data.speedtest).includes('never_store'), false);
  await restarted.select('se'); assert.equal(restarted.publicState().speedtest, null);
  await restarted.select('ch'); assert.equal(restarted.publicState().speedtest.download, 70);
  await restarted.logout(); assert.equal(restarted.publicState().speedtest, null); assert.deepEqual(f.session.data, {});
});

test('persistent login restores after session storage is erased and never persists a password/access lease', async () => {
  const f = fixture();
  const login = { token: 'tvpn_refresh_123_' + 'r'.repeat(43), expiresAt: f.now + 86400_000 };
  await f.core.acceptSession({ ...f.account, refresh: login });
  assert.deepEqual(f.local.data.login, login);
  assert.equal(JSON.stringify(f.local.data).includes(f.account.token), false);
  await f.session.clear();
  const request = f.api.request;
  f.api.request = async (path, options) => {
    if (path === '/auth/refresh') {
      assert.equal(options.body.refreshToken, login.token);
      assert.equal(options.body.deviceId, f.local.data.installationId);
      return { ...f.account, refresh: login };
    }
    return request(path, options);
  };
  const restarted = new Controller({ ...f, now: () => f.now });
  await restarted.init(); await restarted.ensureAccount();
  assert.equal(restarted.account.token, f.account.token);
  assert.equal(restarted.active, false);
  assert.equal(JSON.stringify(restarted.publicState()).includes(login.token), false);
  await restarted.logout(); assert.equal(f.local.data.login, undefined);
});

test('temporary restoration failure retains saved sign-in, while a revoked refresh removes it', async () => {
  const f = fixture(); const login = { token: 'tvpn_refresh_123_' + 'r'.repeat(43), expiresAt: f.now + 86400_000 };
  await f.local.set({ login, intentActive: true, selectedRegion: 'ch' });
  await f.core.init();
  f.api.request = async () => { throw new Error('SERVICE_UNAVAILABLE'); };
  await assert.rejects(f.core.refresh(), /SERVICE_UNAVAILABLE/);
  assert.deepEqual(f.local.data.login, login); assert.equal(f.core.status, 'blocked');
  f.api.request = async () => { throw new Error('ACCESS_DENIED'); };
  await assert.rejects(f.core.refresh(), /ACCESS_DENIED/);
  assert.equal(f.local.data.login, undefined); assert.equal(f.core.account, null); assert.equal(f.core.status, 'blocked');
});

test('refresh credentials cannot be silently extended or replaced by an unexpected response', async () => {
  const f = fixture(); const login = { token: 'tvpn_refresh_123_' + 'r'.repeat(43), expiresAt: f.now + 86400_000 };
  await f.local.set({ login }); await f.core.init();
  f.api.request = async () => ({ ...f.account, refresh: { ...login, expiresAt: login.expiresAt + 1 } });
  await assert.rejects(f.core.ensureAccount(), /INVALID_RESPONSE/); assert.equal(f.core.account, null);
});

test('a legacy session upgrade blocks before changing identity and never advertises the retired lease as connected', async () => {
  const f = fixture(); await f.core.authenticate('/session', {}); await f.core.connect();
  const request = f.api.request;
  f.api.request = async (path, options) => {
    if (path === '/auth/remember') {
      assert.equal(options.token, f.account.token);
      assert.equal(f.core.publicState().status, 'connecting');
      assert.equal(f.driver.calls.at(-1).blocked, true);
      return { ...f.account, token: 'replacement_private_access_token_123456789',
        refresh: { token: 'tvpn_refresh_123_' + 'r'.repeat(43), expiresAt: f.now + 86400_000 } };
    }
    return request(path, options);
  };
  await f.core.ensureAccount({ remember: true });
  assert.equal(f.core.publicState().status, 'connecting');
  await f.core.refresh(); assert.equal(f.core.publicState().status, 'connected');
  assert.ok(f.core.login);
});

test('ping after an idle access-token expiry restores saved login without asking for credentials or opening a VPN lease', async () => {
  const f = fixture(); const login = { token: 'tvpn_refresh_123_' + 'r'.repeat(43), expiresAt: f.now + 86400000 };
  await f.core.acceptSession({ ...f.account, refresh: login });
  f.core.account = { ...f.core.account, sessionExpiresAt: f.now - 1 };
  f.api.request = async path => {
    if (path === '/auth/refresh') return { ...f.account, refresh: login };
    if (path === '/subscription') return f.account.subscription;
    if (path === '/latency') return tickets(f.account.subscription.regions.filter(r => r.transport === 'tcp'));
    throw new Error('unexpected lease operation');
  };
  f.core.siteProbe = async () => 40;
  await f.core.measureRegions();
  assert.deepEqual(f.core.latencies, { ch: 40, se: 40 });
  assert.equal(f.core.active, false); assert.equal(f.core.lease, null);
});

test('cancel during an RF replacement reverts rules without reinstalling a proxy after disconnect', async () => {
  const f = fixture(); await f.core.authenticate('/session', {}); await f.core.updateRules({ mode: 'all', domains: [], rfServices: true }); await f.core.connect();
  const abort = new AbortController(); const request = f.api.request;
  f.api.request = async (path, options) => {
    if (path === '/connect') { abort.abort(); return f.lease; }
    return request(path, options);
  };
  await assert.rejects(f.core.updateRules({ mode: 'all', domains: [], rfServices: false }, { signal: abort.signal }), /MEASUREMENT_CANCELLED/);
  assert.equal(f.core.active, false); assert.equal(f.core.rules.rfServices, true);
  assert.equal(f.driver.calls.at(-1).clear, true);
});

for (const code of ['LATENCY_UNAVAILABLE', 'SERVICE_UNAVAILABLE', 'RATE_LIMITED', 'INVALID_RESPONSE']) test(`Auto still connects when optional site diagnostics fail with ${code}`, async () => {
  const f = fixture();
  const connects = [];
  const original = f.api.request.bind(f.api);
  f.api.request = async (path, options) => {
    if (path === '/latency') throw new Error(code);
    if (path === '/connect') { connects.push(options.body.region); return { ...f.lease, regionId: options.body.region }; }
    return original(path, options);
  };
  // Internal fallback ranks gateway responsiveness, never displays it as site ping.
  f.core.gatewayProbe = async host => host.includes('-se.') ? 20 : 80;
  await f.core.authenticate('/session', {}); await f.core.select('auto');
  await f.core.connect();
  assert.equal(f.core.publicState().status, 'connected');
  assert.deepEqual(connects, ['se']);
  assert.deepEqual(f.core.publicState().latencies, { ch: null, se: null });
  assert.equal(f.core.publicState().lastError, null);
});

test('Auto cannot hide denied authorization behind optional diagnostics fallback', async () => {
  const f = fixture(); let connects = 0;
  const original = f.api.request.bind(f.api);
  f.api.request = async (path, options) => {
    if (path === '/latency') throw new Error('ACCESS_DENIED');
    if (path === '/connect') connects++;
    return original(path, options);
  };
  await f.core.authenticate('/session', {}); await f.core.select('auto');
  await assert.rejects(f.core.connect(), /ACCESS_DENIED/);
  assert.equal(connects, 0); assert.equal(f.core.publicState().status, 'blocked');
});

test('connection start survives over an hour of renewals, worker reopening and subscription refresh', async () => {
  const f = fixture(); let now = f.now;
  f.core.now = () => now;
  f.account.sessionExpiresAt = now + 86400000;
  f.account.subscription.expiresAt = now + 86400000;
  const request = f.api.request.bind(f.api);
  f.api.request = async (path, options) => path === '/connect' ? { ...f.lease, expiresAt: now + 120000 } : request(path, options);
  await f.core.authenticate('/session', {}); await f.core.connect(); const original = f.core.connectedAt;
  for (let i = 0; i < 122; i++) { now += 30000; await f.core.refresh(); assert.equal(f.core.connectedAt, original); }
  const restarted = new Controller({ api: f.api, driver: f.driver, local: f.local, session: f.session, now: () => now });
  await restarted.init(); assert.equal(restarted.publicState().connectedAt, original);
  const { connectionElapsed } = await import('../runtime/auth-view.js');
  assert.equal(connectionElapsed(restarted.publicState().connectedAt, now), '1:01:00');
  await restarted.disconnect(); assert.equal(restarted.publicState().connectedAt, null);
});

test('speed test renews a near-expiry lease without resetting the connection clock or bypassing routing', async () => {
  const f = fixture(); await f.core.acceptSession(f.account); await f.core.connect();
  const started = f.core.connectedAt;
  const requests = [];
  const request = f.api.request.bind(f.api);
  f.api.request = async (path, options) => {
    requests.push(path);
    if (path === '/connect') return { ...f.lease, expiresAt: f.core.now() + 120_000 };
    return request(path, options);
  };
  await f.core.prepareSpeedTest(); assert.deepEqual(requests, []);
  f.core.now = () => f.now + 45_000;
  await f.core.prepareSpeedTest();
  assert.deepEqual(requests, ['/connect']);
  assert.equal(f.core.connectedAt, started);
  assert.equal(f.core.lease.expiresAt, f.now + 165_000);
  f.core.rules = { mode: 'only', domains: ['example.com'], rfServices: false };
  await assert.rejects(f.core.prepareSpeedTest(), /SPEEDTEST_ROUTE_EXCLUDED/);
  assert.deepEqual(requests, ['/connect']);
  f.core.rules = { mode: 'all', domains: [], rfServices: false };
  f.core.now = () => f.now + 100_000;
  f.api.request = async () => { throw new Error('ACCESS_DENIED'); };
  await assert.rejects(f.core.prepareSpeedTest(), /ACCESS_DENIED/);
  assert.equal(f.core.publicState().status, 'blocked');
  await f.core.disconnect();
  await assert.rejects(f.core.prepareSpeedTest(), /ACCESS_DENIED/);
});
