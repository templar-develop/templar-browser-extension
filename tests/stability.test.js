import test from 'node:test';
import assert from 'node:assert/strict';
import { Controller } from '../runtime/controller.js';
import { firefoxProxy, protectedHost } from '../runtime/policy.js';

function storage() {
  return { data: {}, async get(keys) { return Object.fromEntries(keys.map(k => [k, structuredClone(this.data[k])])); },
    async set(values) { Object.assign(this.data, structuredClone(values)); }, async remove(key) { delete this.data[key]; },
    async clear() { this.data = {}; } };
}

function fixture() {
  const start = Date.now();
  const clock = { value: start };
  const local = storage(), session = storage();
  const stats = { calls: {}, installs: 0, clears: 0, rotations: 0 };
  const login = { token: 'tvpn_refresh_123_' + 'r'.repeat(43), expiresAt: start + 7 * 86400_000 };
  const subscription = { status: 'ACTIVE', expiresAt: start + 8 * 86400_000, trafficLimitBytes: null,
    trafficUsedBytes: 0, devices: { used: 1, limit: 3 }, regions: [
      { id: 'ch', name: 'CH', flag: 'ch', transport: 'tcp' },
      { id: 'ch-xhttp', name: 'CH XHTTP', flag: 'ch', transport: 'xhttp' },
      { id: 'se', name: 'SE', flag: 'se', transport: 'tcp' }] };
  const server = { failure: null, malformed: false, access: null, lease: null, generation: 0 };
  const driver = { context: { active: false }, async install(rules, lease, forceBlocked = false) {
    stats.installs++; this.context = { rules, lease, forceBlocked, active: true, controlHost: 'cabinet.templarvpn.com' };
  }, async clear() { stats.clears++; this.context = { ...this.context, active: false, lease: null }; } };
  const account = () => {
    stats.rotations++;
    server.access = { token: 'synthetic_access_token_' + String(stats.rotations).padStart(12, '0'),
      sessionExpiresAt: clock.value + 900_000, subscription: structuredClone(subscription), refresh: login };
    return structuredClone(server.access);
  };
  const api = { base: 'synthetic', async request(path, options = {}) {
    stats.calls[path] = (stats.calls[path] || 0) + 1;
    if (server.failure?.path === path) throw new Error(server.failure.code);
    if (path === '/auth/refresh' || path === '/auth/email') return account();
    if (path === '/subscription') return structuredClone(subscription);
    if (path === '/connect') {
      const { region, rfServices } = options.body;
      const continuing = server.lease?.expiresAt > clock.value && server.lease.regionId === region && server.rf === rfServices;
      if (!continuing) server.generation++;
      const value = { proxy: { host: 'browser-ch.platina300.org', port: 9443 },
        username: 'synthetic_worker_' + server.generation, password: 'synthetic_proxy_secret_' + server.generation,
        expiresAt: Math.min(clock.value + 120_000, server.access.sessionExpiresAt), regionId: region };
      server.rf = rfServices; server.lease = value;
      return server.malformed ? { ...value, regionId: 'unknown' } : structuredClone(value);
    }
    if (path === '/disconnect') server.lease = null;
    return {};
  } };
  const make = () => new Controller({ api, driver, local, session, now: () => clock.value });
  return { clock, local, session, stats, server, driver, api, make, core: make(), login };
}

function invariant(f) {
  const state = f.core.publicState();
  const visible = JSON.stringify(state), persistent = JSON.stringify(f.local.data);
  for (const marker of ['synthetic_access_token_', 'synthetic_proxy_secret_', 'synthetic_worker_']) {
    assert.equal(visible.includes(marker), false);
    assert.equal(persistent.includes(marker), false);
  }
  assert.equal(visible.includes(f.login.token), false);
  assert.ok(Buffer.byteLength(persistent) < 2048);
  assert.ok(Object.keys(f.session.data).length <= 9);
  assert.equal(Boolean(f.local.data.intentActive), state.active);
  if (state.status === 'connected') {
    assert.ok(f.core.lease.expiresAt > f.clock.value);
    assert.ok(f.core.account.sessionExpiresAt > f.clock.value);
    assert.deepEqual(f.driver.context.lease, f.core.lease);
    assert.equal(f.driver.context.forceBlocked, false);
  }
  const host = 'example.com';
  const route = firefoxProxy('https://' + host + '/', f.driver.context, f.clock.value);
  if (state.active && protectedHost(host, state.rules)) {
    if (state.status === 'connected') assert.equal(route[0].type, 'https');
    else if (state.status === 'blocked') assert.equal(route[0].port, 9);
  }
  if (!state.active) assert.deepEqual(route, []);
}

test('72-hour accelerated lifecycle: 8640 renewals, transient outages and repeated worker/browser restarts', async t => {
  const f = fixture();
  await f.core.authenticate('/auth/email', {}); await f.core.select('ch-xhttp'); await f.core.connect();
  let outages = 0, workerRestarts = 0, browserRestarts = 0;
  for (let i = 1; i <= 8640; i++) {
    f.clock.value += 30_000;
    if (i % 137 === 0) {
      const before = structuredClone(f.core.lease), token = f.core.account.token;
      f.server.failure = { path: '/subscription', code: i % 2 ? 'SERVICE_UNAVAILABLE' : 'RATE_LIMITED' };
      await assert.rejects(f.core.refresh(), /SERVICE_UNAVAILABLE|RATE_LIMITED/);
      if (token === f.core.account.token && before.expiresAt > f.clock.value) {
        assert.deepEqual(f.core.lease, before);
        assert.equal(f.core.publicState().status, 'connected');
      }
      f.server.failure = null; outages++;
    }
    await f.core.refresh();
    if (i % 211 === 0) {
      f.core = f.make(); await f.core.init(); workerRestarts++;
    }
    if (i % 997 === 0) {
      await f.session.clear(); f.core = f.make(); await f.core.init();
      assert.equal(f.core.publicState().status, 'blocked');
      await f.core.refresh(); browserRestarts++;
    }
    assert.equal(f.core.selectedRegion, 'ch-xhttp');
    invariant(f);
  }
  assert.equal(f.clock.value - (f.login.expiresAt - 7 * 86400_000), 72 * 3600_000);
  assert.ok(f.stats.rotations > 250);
  await f.core.logout(); invariant(f);
  assert.deepEqual(f.session.data, {}); assert.equal(f.local.data.login, undefined);
  t.diagnostic(JSON.stringify({ renewals: 8640, simulatedHours: 72, outages, workerRestarts, browserRestarts, rotations: f.stats.rotations }));
});

test('2048 seeded user actions preserve routing, cancellation boundaries and bounded persisted state', async t => {
  const counts = Array(10).fill(0);
  for (let seed = 1; seed <= 16; seed++) {
    const f = fixture(); let random = seed;
    await f.core.authenticate('/auth/email', {}); await f.core.select('ch');
    for (let step = 0; step < 128; step++) {
      random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
      const action = random % 10; counts[action]++;
      switch (action) {
        case 0: await f.core.select(['ch', 'se', 'ch-xhttp'][random % 3]); break;
        case 1: await f.core.connect(); break;
        case 2: await f.core.disconnect(); break;
        case 3: await f.core.refresh(); break;
        case 4: await f.core.updateRules({ mode: ['all', 'only', 'bypass'][random % 3], domains: ['example.com'], rfServices: Boolean(random & 16) }); break;
        case 5:
          f.server.failure = { path: '/subscription', code: 'SERVICE_UNAVAILABLE' };
          await assert.rejects(f.core.refresh(), /SERVICE_UNAVAILABLE/); f.server.failure = null; break;
        case 6: f.clock.value += 121_000; await f.core.refresh(); break;
        case 7:
          if (random & 16) await f.session.clear();
          f.core = f.make(); await f.core.init();
          await f.core.refresh(); break;
        case 8:
          await f.core.logout(); await f.core.authenticate('/auth/email', {}); break;
        case 9:
          f.server.malformed = true;
          await assert.rejects(f.core.connect(), /INVALID_REGION/);
          assert.equal(f.core.publicState().status, 'blocked');
          f.server.malformed = false; await f.core.refresh(); break;
      }
      invariant(f);
    }
    await f.core.logout(); invariant(f);
  }
  assert.ok(counts.every(count => count > 150));
  t.diagnostic(JSON.stringify({ seeds: 16, actions: 2048, actionCounts: counts }));
});

test('early refresh denial or malformed rotation still blocks a valid old lease and never extends credentials', async () => {
  for (const code of ['ACCESS_DENIED', 'DEVICE_LIMIT_REACHED', 'INVALID_RESPONSE']) {
    const f = fixture();
    await f.core.authenticate('/auth/email', {}); await f.core.select('ch'); await f.core.connect();
    f.core.account.sessionExpiresAt = f.core.lease.expiresAt;
    f.clock.value = f.core.lease.expiresAt - 45_000;
    f.server.failure = { path: '/auth/refresh', code };
    await assert.rejects(f.core.refresh(), new RegExp(code));
    assert.equal(f.core.publicState().status, 'blocked');
    assert.equal(f.core.lease, null); invariant(f);
    if (code !== 'INVALID_RESPONSE') assert.equal(f.local.data.login, undefined);
  }
});
