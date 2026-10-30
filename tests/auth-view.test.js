import test from 'node:test';
import assert from 'node:assert/strict';
import { resumedAuthView } from '../runtime/auth-view.js';
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
