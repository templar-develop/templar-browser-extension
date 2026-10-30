import test from 'node:test';
import assert from 'node:assert/strict';
import { Controller } from '../runtime/controller.js';

const event = () => ({ listeners: [], addListener(fn) { this.listeners.push(fn); } });
const store = data => ({ async get(keys) { return Object.fromEntries(keys.map(k => [k, structuredClone(data[k])])); },
  async set(v) { Object.assign(data, structuredClone(v)); }, async remove(k) { delete data[k]; }, async clear() {} });

test('a second popup can read and stop a running test; disconnect skips restoration and duplicate tests are rejected', async t => {
  const originalBrowser = globalThis.browser;
  const originalMeasure = Controller.prototype.measureRegions;
  const originalRefresh = Controller.prototype.refresh; let renewals = 0;
  Controller.prototype.refresh = async () => { renewals++; };
  const now = Date.now();
  const account = { token: 'private_session_token_1234567890', sessionExpiresAt: now + 600000,
    subscription: { status: 'ACTIVE', expiresAt: now + 3600000, regions: [{ id: 'ch', name: 'CH', flag: 'ch', transport: 'tcp' }],
      trafficLimitBytes: null, trafficUsedBytes: 0, devices: { used: 1, limit: 3 } } };
  const alarms = new Map();
  const api = { runtime: { id: 'own', getURL: p => 'moz-extension://own/' + p, onMessage: event(), onInstalled: event(), onStartup: event(), async sendMessage() {} },
    storage: { local: store({ selectedRegion: 'ch', intentActive: true }), session: store({ account, lease: { proxy: { host: 'browser-ch.platina300.org', port: 9443 }, username: 'own_user', password: 'own_password_1234567890', expiresAt: now + 120000 } }) },
    proxy: { onRequest: event(), settings: { async get() { return { levelOfControl: 'controlled_by_this_extension' }; } } },
    alarms: { onAlarm: event(), async get(k) { return alarms.get(k); }, async create(k, v) { alarms.set(k, v); }, async clear(k) { alarms.delete(k); } } };
  globalThis.browser = api;
  t.after(() => { Controller.prototype.measureRegions = originalMeasure; Controller.prototype.refresh = originalRefresh; if (originalBrowser === undefined) delete globalThis.browser; else globalThis.browser = originalBrowser; });
  let started;
  let restore;
  const began = new Promise(resolve => { started = resolve; });
  Controller.prototype.measureRegions = async function (options = {}) {
    started();
    await new Promise(resolve => options.signal?.addEventListener('abort', resolve, { once: true }));
    restore = options.shouldRestore();
    throw new Error('MEASUREMENT_CANCELLED');
  };
  await import('../runtime/background.js?measurement-queue-regression');
  const message = type => new Promise(resolve => api.runtime.onMessage.listeners[0]({ type }, { id: 'own', url: api.runtime.getURL('popup.html') }, resolve));
  await message('GET_STATE');
  const pending = message('PING');
  await began;
  const state = await Promise.race([message('GET_STATE'), new Promise(resolve => setTimeout(() => resolve(null), 100))]);
  assert.ok(state, 'GET_STATE must not wait for the measurement');
  assert.equal(state.state.measurement.kind, 'ping');
  assert.equal((await message('PING')).error, 'MEASUREMENT_BUSY');
  const denied = await new Promise(resolve => api.runtime.onMessage.listeners[0]({ type: 'CANCEL_MEASUREMENT' }, { id: 'foreign', url: api.runtime.getURL('popup.html') }, resolve));
  assert.equal(denied.error, 'ACCESS_DENIED');
  assert.equal((await message('GET_STATE')).state.measurement.cancelling, false);
  api.alarms.onAlarm.listeners[0]({ name: 'templar-renew' });
  const disconnected = message('DISCONNECT');
  assert.equal((await pending).error, 'MEASUREMENT_CANCELLED');
  assert.equal((await disconnected).state.status, 'disconnected');
  assert.equal(restore, false);
  assert.equal(renewals, 0, 'a queued renewal must be cancelled before Disconnect reaches the queue');
  assert.equal((await message('GET_STATE')).state.measurement, null);
  const beganAgain = new Promise(resolve => { started = resolve; });
  const pendingAgain = message('PING'); await beganAgain;
  await message('CANCEL_MEASUREMENT');
  assert.equal((await pendingAgain).error, 'MEASUREMENT_CANCELLED');
  assert.equal(restore, true);
});

test('queued cancellation never runs work and a later disconnect overrides a restore request', async () => {
  const { MeasurementJob } = await import('../runtime/measurement-job.js');
  const jobs = new MeasurementJob(); const job = jobs.start('ping');
  jobs.cancel(); assert.equal(job.restoreAbort.signal.aborted, false);
  jobs.cancel(true); assert.equal(job.restoreAbort.signal.aborted, true);
  let ran = false;
  await assert.rejects(jobs.run(job, async () => { ran = true; }), /MEASUREMENT_CANCELLED/);
  assert.equal(ran, false); assert.equal(jobs.snapshot(), null);
});

test('progress UI bounds values and never renders arbitrary stage contents', async () => {
  const { measurementStatus } = await import('../runtime/measurement-ui.js');
  const ru = measurementStatus({ kind: 'ping', stage: 'measuring', total: 9, completed: 2 }, { active: true });
  assert.equal(ru, '', 'ping must not put a status panel above the screen');
  const en = measurementStatus({ kind: 'speedtest', stage: '<script>private</script>', completed: 999, total: 999 }, { locale: 'en' });
  assert.match(en, /Stop test/); assert.match(en, /max="64" value="64"/); assert.equal(en.includes('private'), false);
});

test('stored speed results reject invalid timestamps, routes and values and strip extra properties', async () => {
  const { checkedSpeedRecord } = await import('../runtime/speed-result.js');
  const now = Date.now(); const sub = { regions: [{ id: 'ch' }] };
  const valid = { regionId: 'ch', measuredAt: now, method: 'https-4-streams', download: 70, upload: 40, latency: 50, bytes: 10000000, durationMs: 12000 };
  assert.deepEqual(checkedSpeedRecord({ ...valid, token: 'secret' }, sub, now), valid);
  for (const patch of [{ measuredAt: now + 1 }, { measuredAt: NaN }, { regionId: 'attacker' }, { download: '<script>' }, { upload: Infinity }, { bytes: 200000000 }]) {
    assert.equal(checkedSpeedRecord({ ...valid, ...patch }, sub, now), null);
  }
});
