import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { BrowserApi, checkedApiBase, checkedSession, checkedSubscription } from '../runtime/api.js';

const subscription = () => ({ status: 'ACTIVE', expiresAt: Date.now() + 3600_000, regions: [{ id: 'ch', name: 'Швейцария', flag: 'ch', transport: 'tcp' }], trafficUsedBytes: 0, trafficLimitBytes: 33554432, devices: { used: 1, limit: 1 } });
test('API allowlist rejects arbitrary origins and embedded credentials', () => {
  for (const base of ['https://attacker.example/api/browser/v1', 'https://cabinet.templarvpn.com.evil.test/api/browser/v1', 'https://u:p@cabinet.templarvpn.com/api/browser/v1', 'http://cabinet.templarvpn.com/api/browser/v1', 'https://cabinet.templarvpn.com/api/browser/v1?token=abc']) assert.throws(() => checkedApiBase(base));
  assert.equal(checkedApiBase('https://cabinet.templarvpn.com/api/browser/v1'), 'https://cabinet.templarvpn.com/api/browser/v1');
});
test('unconfigured builds do not make network requests', async () => {
  let calls = 0;
  const api = new BrowserApi(null, { fetcher: () => { calls++; } });
  await assert.rejects(api.request('/session', { method: 'POST' }), { code: 'SERVICE_NOT_CONFIGURED' });
  assert.equal(calls, 0);
});
test('the default browser fetch keeps its required global receiver', async t => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async function () {
    assert.equal(this, globalThis);
    return new Response(JSON.stringify(subscription()), { headers: { 'Content-Type': 'application/json' } });
  };
  const api = new BrowserApi('https://cabinet.templarvpn.com/api/browser/v1');
  assert.equal((await api.request('/subscription')).status, 'ACTIVE');
});
test('session validation rejects expired, exhausted and disabled subscriptions', () => {
  for (const patch of [{ status: 'DISABLED' }, { expiresAt: Date.now() - 1 }, { trafficUsedBytes: 33554432 }, { regions: [] }, { devices: undefined }, { devices: { used: 2, limit: 1 } }]) assert.throws(() => checkedSubscription({ ...subscription(), ...patch }));
  assert.throws(() => checkedSession({ token: 'short', subscription: subscription(), sessionExpiresAt: Date.now() + 60_000 }));
});
test('TCP and XHTTP remain separate profiles; missing/unsupported transport is rejected', () => {
  const tcp = subscription().regions[0];
  const xhttp = { ...tcp, id: 'ch-xhttp', name: 'Швейцария — Дополнительный', transport: 'xhttp' };
  const profiles = checkedSubscription({ ...subscription(), regions: [tcp, xhttp] }).regions;
  assert.deepEqual(profiles, [{ ...tcp, load: null }, { ...xhttp, load: null }]);
  for (const transport of [undefined, 'hysteria', 'ws', 'TCP']) {
    assert.throws(() => checkedSubscription({ ...subscription(), regions: [{ ...tcp, transport }] }), { code: 'INVALID_RESPONSE' });
  }
  assert.throws(() => checkedSubscription({ ...subscription(), regions: [tcp, { ...xhttp, id: tcp.id }] }));
});
test('HTTP fixture verifies JSON, status handling, size bound and no redirect following', async t => {
  let mode = 'ok'; let redirectsFollowed = 0;
  const server = createServer((request, response) => {
    if (request.url.endsWith('/unexpected')) redirectsFollowed++;
    if (mode === 'redirect') { response.writeHead(302, { Location: '/unexpected' }).end(); return; }
    if (mode === 'denied') { response.writeHead(403).end('private-secret-in-error-body'); return; }
    response.writeHead(200, { 'Content-Type': mode === 'html' ? 'text/html' : 'application/json' });
    response.end(mode === 'large' ? JSON.stringify({ content: 'x'.repeat(160_000) }) : JSON.stringify(subscription()));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const api = new BrowserApi(`http://127.0.0.1:${server.address().port}/api/browser/v1`, { allowLocalFixture: true });
  assert.equal((await api.request('/subscription')).status, 'ACTIVE');
  mode = 'redirect'; await assert.rejects(api.request('/subscription'), { code: 'SERVICE_UNAVAILABLE' }); assert.equal(redirectsFollowed, 0);
  mode = 'denied'; await assert.rejects(api.request('/subscription'), error => error.code === 'ACCESS_DENIED' && !error.message.includes('private-secret'));
  for (const invalid of ['html', 'large']) { mode = invalid; await assert.rejects(api.request('/subscription'), { code: 'INVALID_RESPONSE' }); }
});

test('login errors expose only bounded known codes for their matching status', async () => {
  for (const [status, error, expected] of [[401, 'INVALID_LOGIN', 'INVALID_LOGIN'], [403, 'EMAIL_UNVERIFIED', 'EMAIL_UNVERIFIED'],
    [409, 'DEVICE_LIMIT_REACHED', 'DEVICE_LIMIT_REACHED'], [403, 'SUBSCRIPTION_REQUIRED', 'SUBSCRIPTION_REQUIRED'],
    [403, 'secret-account-data', 'ACCESS_DENIED'], [503, 'INVALID_LOGIN', 'SERVICE_UNAVAILABLE']]) {
    const api = new BrowserApi('https://cabinet.templarvpn.com/api/browser/v1', { fetcher: async () => new Response(JSON.stringify({ error }), { status, headers: { 'Content-Type': 'application/json' } }) });
    await assert.rejects(api.request('/auth/email'), { code: expected });
  }
});

test('an explicit cancellation interrupts an API response body without exposing transport errors', async t => {
  let started;
  const began = new Promise(resolve => { started = resolve; });
  const server = createServer((request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' }); response.write('{'); started();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const client = new BrowserApi(`http://127.0.0.1:${server.address().port}/api/browser/v1`, { allowLocalFixture: true });
  const abort = new AbortController(); const request = client.request('/subscription', { signal: abort.signal });
  await began; abort.abort(); await assert.rejects(request, /MEASUREMENT_CANCELLED/);
});

for (const status of [404, 405, 501]) test(`unsupported optional latency API (${status}) has a distinct error, other endpoints still fail`, async () => {
  const api = new BrowserApi('https://cabinet.templarvpn.com/api/browser/v1', { fetcher: async () => new Response('{}', { status, headers: { 'Content-Type': 'application/json' } }) });
  await assert.rejects(api.request('/latency'), { code: 'LATENCY_UNAVAILABLE' });
  await assert.rejects(api.request('/connect'), { code: 'SERVICE_UNAVAILABLE' });
});
