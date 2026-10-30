import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { checkedSiteProbe, measureSite, measureSites } from '../runtime/site-latency.js';
import { pacScript, firefoxProxy, checkedRules } from '../runtime/policy.js';
import { readPreferences } from '../preferences.js';

const region = { id: 'ch', latencyHost: 'browser-ch.platina300.org' };
const ticket = () => ({ regionId: region.id, host: region.latencyHost, ticket: 'bp_' + 'a'.repeat(43), expiresAt: Date.now() + 15000 });

test('site ping warms the route and measures fixed-site replies; only a scoped ticket leaves the browser', async () => {
  let time = 0; const timings = [600, 70, 90]; const value = ticket();
  const ms = await measureSite(value, { now: () => time, fetcher: async (url, options) => {
    assert.match(url, /^https:\/\/browser-ch\.platina300\.org:9441\/site-latency\?nonce=[a-f0-9-]{36}$/);
    assert.deepEqual(options.headers, { Authorization: 'Bearer ' + value.ticket });
    assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'error');
    time += timings.shift(); return new Response(null, { status: 204 });
  } });
  assert.equal(ms, 80);
  await assert.rejects(measureSite(value, { fetcher: async () => new Response(null, { status: 302 }) }), /SERVICE_UNAVAILABLE/);
});

test('probe responses cannot redirect a ticket, swap a profile or extend its lifetime', () => {
  for (const change of [{ host: 'browser-se.platina300.org' }, { host: 'evil.test' }, { regionId: 'se' },
    { ticket: 'account_token' }, { expiresAt: Date.now() + 18000 }, { expiresAt: Date.now() - 1 }, { url: 'http://127.0.0.1' }]) {
    assert.throws(() => checkedSiteProbe({ ...ticket(), ...change }, region));
  }
});

test('TCP and XHTTP on the same node have independent parallel results; a failed route has no invented ping', async () => {
  const regions = [region, { ...region, id: 'ch-xhttp' }];
  const probes = { ch: ticket(), 'ch-xhttp': { ...ticket(), regionId: 'ch-xhttp' } };
  const results = {}; let active = 0; let max = 0;
  await measureSites(regions, probes, { probe: async value => {
    max = Math.max(max, ++active); await new Promise(resolve => setImmediate(resolve)); active--;
    if (value.regionId.endsWith('xhttp')) throw new Error('unavailable');
    return 71;
  }, onResult: async ([id], ms) => { results[id] = ms; } });
  assert.equal(max, 2); assert.deepEqual(results, { ch: 71, 'ch-xhttp': null });
});

test('fixed-site diagnostic exceptions cannot bypass normal blocked browsing', () => {
  const ctx = { rules: checkedRules({ mode: 'all', domains: [], rfServices: true }), active: true, forceBlocked: true, controlHost: 'cabinet.templarvpn.com' };
  const sandbox = {}; vm.runInNewContext(pacScript(ctx), sandbox);
  const url = 'https://browser-ch.platina300.org:9441/site-latency?nonce=12345678-1234-1234-1234-123456789abc';
  assert.equal(sandbox.FindProxyForURL(url, region.latencyHost), 'DIRECT');
  assert.deepEqual(firefoxProxy(url, ctx), { type: 'direct' });
  for (const bad of [url.replace(':9441', ':9443'), url + '&url=https://example.com', url.replace('/site-latency?', '/proxy?'), 'https://www.gstatic.com/generate_204']) {
    assert.equal(sandbox.FindProxyForURL(bad, new URL(bad).hostname), 'PROXY 127.0.0.1:9');
    assert.equal(firefoxProxy(bad, ctx)[0].port, 9);
  }
});

test('RF bypass is the default while explicit saved choices remain intact', () => {
  assert.equal(readPreferences({ getItem: () => null }).rfServices, false);
  assert.equal(readPreferences({ getItem: () => '{"rfServices":true}' }).rfServices, true);
  assert.equal(checkedRules({ mode: 'all', domains: [] }).rfServices, false);
});
