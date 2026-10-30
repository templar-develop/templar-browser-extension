import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { pacScript, checkedLease, checkedRules, protectedHost, firefoxProxy, authenticationResponse, BLOCK_PROXY } from '../runtime/policy.js';

const now = Date.now();
const lease = { proxy: { host: 'browser-ch.platina300.org', port: 9443 }, username: 'test_user', password: 'secret_lease_password_123456', expiresAt: now + 60_000 };
const options = (mode = 'all', domains = []) => ({ rules: { mode, domains }, lease, controlHost: 'cabinet.templarvpn.com' });
function resolve(mode, domains, host, at = now) {
  const context = { Date: { now: () => at } };
  vm.createContext(context);
  vm.runInContext(pacScript(options(mode, domains)), context);
  return vm.runInContext(`FindProxyForURL('https://example.test/', ${JSON.stringify(host)})`, context);
}

test('exact domain and subdomains match; lookalikes do not', () => {
  const rules = checkedRules({ mode: 'only', domains: ['*.EXAMPLE.com.'] });
  assert.deepEqual(rules.domains, ['example.com']);
  for (const host of ['example.com', 'a.example.com', 'a.b.example.com']) assert.equal(protectedHost(host, rules), true);
  for (const host of ['notexample.com', 'example.com.evil.test']) assert.equal(protectedHost(host, rules), false);
});
test('all mode ignores dormant domain list', () => {
  assert.equal(resolve('all', ['example.com'], 'example.com'), 'HTTPS browser-ch.platina300.org:9443');
});
test('bypass mode is direct only for requested domain and subdomains', () => {
  assert.equal(resolve('bypass', ['example.com'], 'a.example.com'), 'DIRECT');
  assert.equal(resolve('bypass', ['example.com'], 'example.com.evil.test'), 'HTTPS browser-ch.platina300.org:9443');
});
test('only mode with no domains sends no website through VPN', () => {
  assert.equal(resolve('only', [], 'example.com'), 'DIRECT');
});
test('protected requests fail closed after expiry without a direct fallback', () => {
  assert.equal(resolve('all', [], 'example.com', now + 61_000), BLOCK_PROXY);
  assert.equal(resolve('bypass', ['example.com'], 'a.example.com', now + 61_000), 'DIRECT');
});
test('management host remains reachable to refresh/recover the session', () => {
  assert.equal(resolve('all', [], 'cabinet.templarvpn.com', now + 61_000), 'DIRECT');
  assert.equal(resolve('all', [], 'cabinet.templarvpn.com.evil.test'), 'HTTPS browser-ch.platina300.org:9443');
});
test('PAC contains no passwords/tokens and performs no DNS lookups', () => {
  const script = pacScript(options());
  assert.equal(script.includes(lease.password), false);
  assert.equal(script.includes(lease.username), false);
  assert.equal(/dnsResolve|isInNet/.test(script), false);
  assert.equal(script.includes('; DIRECT'), false);
});
test('invalid rules and proxy endpoints are rejected', () => {
  for (const patch of [{ proxy: { host: 'attacker.example', port: 443 } }, { proxy: { host: '127.0.0.1', port: 443 } }, { password: 'bad\r\nheader' }, { expiresAt: now - 1 }, { expiresAt: now + 600_000 }]) {
    assert.throws(() => checkedLease({ ...lease, ...patch }, now));
  }
  assert.throws(() => checkedRules({ mode: 'something', domains: [] }));
  assert.throws(() => checkedRules({ mode: 'all', domains: ["bad');alert(1)//"] }));
});
test('Firefox explicitly prevents the default-browser proxy fallback', () => {
  const result = firefoxProxy('https://example.com/', { ...options(), active: true }, now);
  assert.equal(result.length, 2); assert.equal(result[1], null); assert.equal(result[0].type, 'https');
  assert.equal(atob(result[0].proxyAuthorizationHeader.slice(6)), lease.username + ':' + lease.password);
  const expired = firefoxProxy('https://example.com/', { ...options(), active: true }, now + 60_001);
  assert.equal(expired[0].host, '127.0.0.1'); assert.equal(expired[1], null);
});
test('Firefox explicit disconnect does not override an existing user proxy', () => {
  assert.deepEqual(firefoxProxy('https://example.com/', { ...options(), active: false }, now), []);
});
test('credentials go only to the active proxy challenge, once per request', () => {
  const attempts = new Map();
  const challenge = { isProxy: true, challenger: lease.proxy, requestId: '1' };
  assert.deepEqual(authenticationResponse({ ...challenge, isProxy: false }, lease, attempts, now), {});
  assert.deepEqual(authenticationResponse({ ...challenge, challenger: { host: 'attacker.example', port: 9443 } }, lease, attempts, now), { cancel: true });
  assert.equal(authenticationResponse(challenge, lease, attempts, now).authCredentials.password, lease.password);
  assert.deepEqual(authenticationResponse(challenge, lease, attempts, now), { cancel: true });
  assert.deepEqual(authenticationResponse({ ...challenge, requestId: '2' }, lease, attempts, now + 60_001), { cancel: true });
});

test('RF off bypasses Russian suffixes/services and rejects lookalike matches in both browsers', () => {
  const rules = checkedRules({ mode: 'all', domains: [], rfServices: false });
  for (const host of ['yandex.ru', 'gosuslugi.ru', 'sub.bank.su', 'vk.com', 'music.vk.com', 'xn--e1afmkfd.xn--p1ai']) {
    assert.equal(protectedHost(host, rules), false);
    assert.deepEqual(firefoxProxy('https://' + host + '/', { ...options(), rules, active: true }, now), { type: 'direct' });
  }
  for (const host of ['ru.evil.com', 'vk.com.evil.test', 'notvk.com']) assert.equal(protectedHost(host, rules), true);
  const context = { Date: { now: () => now } }; vm.createContext(context);
  vm.runInContext(pacScript({ ...options(), rules }), context);
  assert.equal(vm.runInContext("FindProxyForURL('https://vk.com/', 'vk.com')", context), 'DIRECT');
  assert.equal(vm.runInContext("FindProxyForURL('https://vk.com.evil.test/', 'vk.com.evil.test')", context), 'HTTPS browser-ch.platina300.org:9443');
});
