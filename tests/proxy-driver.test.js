import test from 'node:test';
import assert from 'node:assert/strict';
import { ProxyDriver } from '../runtime/proxy-driver.js';

function setting() {
  return { level: 'controllable_by_this_extension', sets: [], clears: 0,
    async get() { return { levelOfControl: this.level }; },
    async set(value) { this.sets.push(value); this.level = 'controlled_by_this_extension'; },
    async clear() { this.clears++; this.level = 'controllable_by_this_extension'; } };
}
function fixture() {
  const proxy = setting(), rtc = setting(), prediction = setting();
  const api = { proxy: { settings: proxy }, privacy: { network: { webRTCIPHandlingPolicy: rtc, networkPredictionEnabled: prediction } } };
  const driver = new ProxyDriver(api, 'cabinet.templarvpn.com');
  const lease = { proxy: { host: 'browser-ch.platina300.org', port: 9443 }, username: 'user', password: 'private_lease_password_12345', expiresAt: Date.now() + 60_000 };
  return { api, proxy, rtc, prediction, driver, lease };
}
test('Chrome installs mandatory PAC and restricts non-proxied WebRTC and prediction', async () => {
  const f = fixture(); await f.driver.install({ mode: 'all', domains: [] }, f.lease);
  assert.equal(f.proxy.sets[0].value.pacScript.mandatory, true);
  assert.equal(f.rtc.sets[0].value, 'disable_non_proxied_udp'); assert.equal(f.prediction.sets[0].value, false);
  assert.equal(f.proxy.sets[0].value.pacScript.data.includes(f.lease.password), false);
});

test('repeated lease renewals retain owned privacy protection without rewriting unchanged settings', async () => {
  const f = fixture();
  for (const item of [f.rtc, f.prediction]) {
    item.get = async () => ({ levelOfControl: item.level, value: item.sets.at(-1)?.value });
  }
  const rules = { mode: 'all', domains: [] };
  for (let i = 0; i < 1000; i++) await f.driver.install(rules, { ...f.lease, expiresAt: f.lease.expiresAt + i });
  assert.equal(f.proxy.sets.length, 1000, 'each new lease must still install its PAC deadline');
  assert.equal(f.rtc.sets.length, 1);
  assert.equal(f.prediction.sets.length, 1);
  f.prediction.get = async () => ({ levelOfControl: 'controlled_by_this_extension', value: true });
  await f.driver.install(rules, f.lease);
  assert.equal(f.prediction.sets.length, 2, 'a changed value must be repaired');
  f.rtc.level = 'controlled_by_other_extensions';
  await assert.rejects(f.driver.install(rules, f.lease), /PROXY_CONFLICT/);
  assert.equal(f.rtc.sets.length, 1, 'another extension must never be overwritten');
  await f.driver.clear();
  assert.equal(f.rtc.clears, 0);
  assert.equal(f.prediction.clears, 1);
});
test('a competing extension prevents connection and its settings are not overwritten', async () => {
  const f = fixture(); f.proxy.level = 'controlled_by_other_extensions';
  await assert.rejects(f.driver.install({ mode: 'all', domains: [] }, f.lease), /PROXY_CONFLICT/);
  assert.equal(f.proxy.sets.length, 0); assert.equal(f.rtc.sets.length, 0);
  await f.driver.clear(); assert.equal(f.proxy.clears, 0);
});
test('partial privacy failure restores only settings newly taken over by this extension', async () => {
  const f = fixture(); f.prediction.level = 'controlled_by_other_extensions';
  await assert.rejects(f.driver.install({ mode: 'all', domains: [] }, f.lease));
  assert.equal(f.rtc.clears, 1); assert.equal(f.prediction.clears, 0); assert.equal(f.proxy.sets.length, 0);
});
test('failed proxy installation does not leave new privacy overrides behind', async () => {
  const f = fixture(); f.proxy.set = async () => { throw new Error('failure'); };
  await assert.rejects(f.driver.install({ mode: 'all', domains: [] }, f.lease));
  assert.equal(f.rtc.clears, 1); assert.equal(f.prediction.clears, 1); assert.equal(f.driver.context.active, false);
});

test('disconnect releases Chrome proxy and other privacy settings even if one cleanup fails', async () => {
  const f = fixture(); await f.driver.install({ mode: 'all', domains: [] }, f.lease);
  f.rtc.get = async () => { throw new Error('Privacy setting unavailable'); };
  await f.driver.clear();
  assert.equal(f.proxy.clears, 1); assert.equal(f.prediction.clears, 1);
  assert.equal(f.driver.context.active, false); assert.equal(f.driver.context.lease, null);
});

test('Firefox stops routing synchronously before optional privacy cleanup failure', async () => {
  const f = fixture(); f.api.proxy.onRequest = {}; f.driver = new ProxyDriver(f.api, 'cabinet.templarvpn.com');
  await f.driver.install({ mode: 'all', domains: [] }, f.lease);
  f.rtc.clear = async () => { throw new Error('Privacy setting unavailable'); };
  await f.driver.clear();
  assert.deepEqual(f.driver.resolveFirefox('https://example.com/'), []);
  assert.equal(f.prediction.clears, 1);
});
