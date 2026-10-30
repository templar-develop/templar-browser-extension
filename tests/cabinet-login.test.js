import test from 'node:test';
import assert from 'node:assert/strict';
import { CabinetLogin } from '../runtime/cabinet-login.js';
import { resumedAuthView } from '../runtime/auth-view.js';

function fixture() {
  const data = {}; let now = Date.now(); let approved = false; let accepted = 0; const opened = []; const cancelled = [];
  const challenge = { code: 'x'.repeat(32), pollToken: 'y'.repeat(43), confirmationCode: 'ABCD2345', expiresAt: now + 299000, interval: 5 };
  challenge.url = 'https://cabinet.templarvpn.com/extension-login#' + challenge.code;
  const session = { async get() { return structuredClone(data); }, async set(v) { Object.assign(data, structuredClone(v)); }, async remove(k) { delete data[k]; } };
  const remote = { async request(path, { body }) {
    assert.equal(body.deviceId, 'own-device');
    if (path === '/auth/cabinet') return structuredClone(challenge);
    assert.equal(body.pollToken, challenge.pollToken);
    if (path.endsWith('/cancel')) { cancelled.push(body.code); return {}; }
    return approved ? { token: 'synthetic_issued_session' } : { pending: true };
  } };
  const options = { remote, session, deviceId: async () => 'own-device', acceptSession: async () => { accepted++; },
    openTab: async url => opened.push(url), now: () => now };
  return { data, options, challenge, opened, cancelled, approve() { approved = true; }, expire() { now += 300001; }, accepted: () => accepted };
}

test('QR approval resumes after popup and background closure without exposing redemption secret', async () => {
  const f = fixture(); await new CabinetLogin(f.options).start();
  const restarted = new CabinetLogin(f.options);
  const visible = await restarted.publicState();
  assert.equal(JSON.stringify(visible).includes(f.challenge.pollToken), false);
  assert.deepEqual(resumedAuthView({ cabinetLogin: visible }, { firstRun: true }), { view: 'home', auth: 'cabinet' });
  await restarted.open(); assert.deepEqual(f.opened, [f.challenge.url]);
  assert.equal(await restarted.poll(), true);
  f.approve(); assert.equal(await restarted.poll(), false); assert.equal(f.accepted(), 1);
  assert.equal(await restarted.publicState(), null);
  await assert.rejects(restarted.poll(), /CABINET_EXPIRED/);
});

test('expiry, cancellation and terminal denial clear pending state; transient failures retain it', async () => {
  const f = fixture(); const login = new CabinetLogin(f.options); await login.start();
  const request = f.options.remote.request;
  f.options.remote.request = async () => { throw new Error('SERVICE_UNAVAILABLE'); };
  await assert.rejects(login.poll(), /SERVICE_UNAVAILABLE/); assert.ok(await login.publicState());
  f.options.remote.request = request;
  await login.clear(); assert.deepEqual(f.cancelled, [f.challenge.code]); assert.equal(await login.publicState(), null);
  await login.start(); f.options.remote.request = async () => { throw new Error('CABINET_DENIED'); };
  await assert.rejects(login.poll(), /CABINET_DENIED/); assert.equal(await login.publicState(), null);
  f.options.remote.request = request; await login.start(); f.expire(); assert.equal(await login.publicState(), null);
  await assert.rejects(login.open(), /CABINET_EXPIRED/); assert.equal(f.opened.length, 0);
});

test('foreign URLs, unexpected paths, poll secrets in QR and excessive expiry never reach UI or tabs', async () => {
  const f = fixture();
  for (const patch of [
    { url: 'https://attacker.test/#' + f.challenge.code },
    { url: f.challenge.url + '?pollToken=' + f.challenge.pollToken },
    { url: 'https://cabinet.templarvpn.com.attacker.test/extension-login#' + f.challenge.code },
    { expiresAt: f.options.now() + 300001 }, { interval: 1 }, { code: 'bad' },
  ]) {
    f.options.remote.request = async () => ({ ...f.challenge, ...patch });
    await assert.rejects(new CabinetLogin(f.options).start(), /INVALID_RESPONSE/);
    assert.deepEqual(f.data, {}); assert.equal(f.opened.length, 0);
  }
});
