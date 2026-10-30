import test from 'node:test';
import assert from 'node:assert/strict';
import { TelegramLogin } from '../runtime/telegram-login.js';
function fixture() {
  const data = {}; let now = Date.now(); let linked = false; let accepted = 0; let opened = 0;
  const token = 'x'.repeat(32);
  const session = { async get() { return structuredClone(data); }, async set(v) { Object.assign(data, v); }, async remove(k) { delete data[k]; } };
  const remote = { async request(path, options) {
    assert.equal(options.body.deviceId, 'own-installation');
    if (path === '/auth/telegram') return { url: 'https://t.me/TemplarVPN_bot?start=webauth_' + token, pollToken: token };
    assert.equal(options.body.pollToken, token); return linked ? { session: 'fixture' } : { pending: true };
  } };
  const options = { remote, session, deviceId: async () => 'own-installation', acceptSession: async () => { accepted++; },
    openTab: async () => { assert.ok(data.telegramLogin, 'persist before opening bot'); opened++; }, now: () => now };
  return { data, options, token, link() { linked = true; }, expire() { now += 300001; }, accepted: () => accepted, opened: () => opened };
}
test('closing popup and restarting worker retains bound Telegram confirmation', async () => {
  const f = fixture(); await new TelegramLogin(f.options).start();
  const restarted = new TelegramLogin(f.options);
  assert.equal(await restarted.pending(), true); assert.equal(await restarted.poll(), true);
  f.link(); assert.equal(await restarted.poll(), false); assert.equal(f.accepted(), 1); assert.equal(f.opened(), 1);
  assert.equal(await restarted.pending(), false);
  await assert.rejects(restarted.poll(), /TELEGRAM_EXPIRED/);
});
test('expiry and explicit cancellation remove the challenge; offline polling retains it', async () => {
  const f = fixture(); const login = new TelegramLogin(f.options); await login.start();
  f.options.remote.request = async () => { throw new Error('SERVICE_UNAVAILABLE'); };
  await assert.rejects(login.poll(), /SERVICE_UNAVAILABLE/); assert.equal(await login.pending(), true);
  await login.clear(); assert.equal(await login.pending(), false);
  f.data.telegramLogin = { token: f.token, expiresAt: f.options.now() + 300000 };
  f.expire(); assert.equal(await login.pending(), false); assert.deepEqual(f.data, {});
});
test('untrusted or mismatched bot URLs cannot open a tab or save a challenge', async () => {
  for (const url of ['https://evil.example/?start=webauth_' + 'x'.repeat(32), 'https://t.me/TemplarVPN_bot?start=webauth_' + 'y'.repeat(32)]) {
    const f = fixture(); f.options.remote.request = async () => ({ url, pollToken: f.token });
    await assert.rejects(new TelegramLogin(f.options).start(), /INVALID_RESPONSE/);
    assert.equal(f.opened(), 0); assert.deepEqual(f.data, {});
  }
});
