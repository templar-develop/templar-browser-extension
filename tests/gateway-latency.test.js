import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { measureGateway, measureGateways, checkedLatencyHost } from '../runtime/gateway-latency.js';
import { pingMarkup, measurementStatus } from '../runtime/measurement-ui.js';
import { pacScript, firefoxProxy } from '../runtime/policy.js';

test('gateway RTT discards TLS warm-up and never sends account credentials', async () => {
  let clock = 0; const timings = [500, 40, 60];
  const result = await measureGateway('browser-ch.platina300.org', { now: () => clock, fetcher: async (raw, opts) => {
    const url = new URL(raw); assert.equal(url.port, '9442'); assert.equal(url.pathname, '/latency');
    assert.match(url.searchParams.get('nonce'), /^[a-f0-9-]{36}$/); assert.equal(opts.credentials, 'omit');
    assert.equal(opts.redirect, 'error'); assert.equal(opts.headers, undefined); clock += timings.shift();
    return new Response(null, { status: 204 });
  } });
  assert.equal(result, 50);
  for (const host of ['127.0.0.1', 'browser-ch.platina300.org.evil.test', 'browser-ch.platina300.org:80', 'x.platina300.org', 'user@browser-ch.platina300.org']) assert.throws(() => checkedLatencyHost(host));
});
test('latency error/redirect/timeout does not turn into a fabricated measurement', async () => {
  await assert.rejects(measureGateway('browser-ch.platina300.org', { fetcher: async () => new Response(null, { status: 302 }) }));
  let calls = 0;
  const abort = new AbortController(); abort.abort();
  await assert.rejects(measureGateways([{ id: 'ch', latencyHost: 'browser-ch.platina300.org' }], { signal: abort.signal, probe: async () => { calls++; } }), /MEASUREMENT_CANCELLED/);
  assert.equal(calls, 0);
});
test('the direct diagnostic exception is exact in both browser policies, including blocked mode', () => {
  const ctx = { rules: { mode: 'all', domains: [], rfServices: true }, active: true, forceBlocked: true, controlHost: 'cabinet.templarvpn.com' };
  const sandbox = {}; vm.runInNewContext(pacScript(ctx), sandbox);
  const allowed = 'https://browser-ch.platina300.org:9442/latency?nonce=12345678-1234-1234-1234-123456789abc';
  assert.equal(sandbox.FindProxyForURL(allowed, 'browser-ch.platina300.org'), 'DIRECT');
  assert.deepEqual(firefoxProxy(allowed, ctx), { type: 'direct' });
  for (const url of [allowed + '&secret=x', allowed.replace('/latency?', '/other?'), allowed.replace(':9442', ':9443'), allowed.replace('https:', 'http:'), allowed.replace('.org:', '.org.evil.test:')]) {
    assert.equal(sandbox.FindProxyForURL(url, new URL(url).hostname), 'PROXY 127.0.0.1:9');
    assert.equal(firefoxProxy(url, ctx)[0].port, 9);
  }
});
test('ping progress occupies only pending ping numbers and obeys reduced motion CSS', () => {
  const job = { kind: 'ping', stage: 'measuring', pendingRegions: ['ch'] };
  assert.equal(measurementStatus(job), '');
  assert.match(pingMarkup('ch', { ch: 42 }, job), /ping-dots/);
  assert.equal((pingMarkup('ch', {}, job).match(/<i>/g) || []).length, 3);
  assert.match(pingMarkup('se', { se: 70 }, job), /70 мс/);
  assert.equal(pingMarkup('se', { se: 70 }, job).includes('ping-dots'), false);
});

test('diagnostics are built from an allowlist and cannot copy account tokens, custom domains, identity or raw errors', async () => {
  const { diagnosticReport } = await import('../runtime/diagnostics.js');
  const report = diagnosticReport({ status: 'blocked', active: true, selectedRegion: 'ch', account: { token: 'private_token' },
    login: { token: 'refresh_secret' }, lastError: 'SECRET_FROM_THROW', rules: { mode: 'only', domains: ['private.internal'] }, subscription: { email: 'private@example.com' } }, '0.4.1');
  for (const secret of ['private_token', 'refresh_secret', 'SECRET_FROM_THROW', 'private.internal', 'private@example.com']) assert.equal(report.includes(secret), false);
});
