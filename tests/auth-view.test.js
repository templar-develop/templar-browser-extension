import test from 'node:test';
import assert from 'node:assert/strict';
import { resumedAuthView, loginCountdown } from '../runtime/auth-view.js';
import { checkedSubscriptionLink } from '../runtime/subscription-link.js';
test('completed link/Telegram login survives popup loss before onboarding completion', () => {
  assert.deepEqual(resumedAuthView({ subscription: {} }, { firstRun: true, rfServices: true }), { view: 'rf-question' });
  assert.deepEqual(resumedAuthView({ subscription: {} }, { firstRun: false, rfServices: true }), { view: 'home' });
  assert.deepEqual(resumedAuthView({ telegramPending: true }, { firstRun: true }), { view: 'home', auth: 'telegram' });
  assert.equal(resumedAuthView({}, { firstRun: true }), null);
});
test('subscription import accepts cabinet JSON links and safe Happ add wrappers', () => {
  const link = 'https://sub.templarvpn.com/connect/example_key_123/json';
  for (const input of [link, ' '+link+' ', 'happ://add/'+link, 'happ://add/'+encodeURIComponent(link)]) assert.equal(checkedSubscriptionLink(input), link);
  for (const input of ['https://evil.test/connect/example_key_123', 'happ://add/https://evil.test/connect/example_key_123',link+'?x=1', link+'#x',link+'?',link+'#','https://a:b@sub.templarvpn.com/connect/example_key_123', 'happ://crypt/opaque']) assert.throws(() => checkedSubscriptionLink(input), /INVALID_LINK/);
});

test('QR countdown keeps its absolute deadline after popup reopening, delays and expiry', () => {
  const created = 1_800_000_000_000;
  const deadline = created + 300_000;
  assert.deepEqual(loginCountdown(deadline, created), { expired: false, text: '05:00' });
  assert.deepEqual(loginCountdown(deadline, created + 1_000), { expired: false, text: '04:59' });
  // A popup reopened after 72 seconds and a delayed timer tick must not restart.
  assert.equal(loginCountdown(deadline, created + 72_000).text, '03:48');
  assert.equal(loginCountdown(deadline, deadline - 1).text, '00:01');
  for (const now of [deadline, deadline + 90_000]) assert.deepEqual(loginCountdown(deadline, now), { expired: true, text: '00:00' });
  for (const bad of [undefined, null, NaN, 'later']) assert.deepEqual(loginCountdown(bad, created), { expired: true, text: '00:00' });
});

test('background progress and renewals do not count as a new cabinet login', async () => {
  const { authCompleted } = await import('../runtime/auth-view.js');
  assert.equal(authCompleted({ subscription: {} }, { subscription: {}, measurement: { kind: 'speedtest' } }), false);
  assert.equal(authCompleted({ subscription: {} }, { subscription: {}, measurement: null }), false);
  assert.equal(authCompleted({ cabinetLogin: {} }, { subscription: {} }), true);
  assert.equal(authCompleted({}, {}), false);
});

test('connection clock crosses the hour, day and delayed-popup boundaries without wrapping', async () => {
  const { connectionElapsed } = await import('../runtime/auth-view.js');
  const start = 1_800_000_000_000;
  for (const [seconds, text] of [[0,'00:00'],[59,'00:59'],[3599,'59:59'],[3600,'1:00:00'],[3661,'1:01:01'],[36000,'10:00:00'],[86400,'24:00:00'],[90061,'25:01:01']]) {
    assert.equal(connectionElapsed(start, start + seconds * 1000), text);
  }
  assert.equal(connectionElapsed(start, start - 1000), '00:00');
  for (const bad of [null, undefined, NaN, '1000']) assert.equal(connectionElapsed(bad, start), null);
});
