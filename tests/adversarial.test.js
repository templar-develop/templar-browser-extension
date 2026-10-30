import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { pacScript, firefoxProxy, checkedRules, authenticationResponse } from '../runtime/policy.js';
import { escapeHTML } from '../preferences.js';

const lease = { proxy: { host: 'edge.platina300.org', port: 9443 }, username: 'U'.repeat(24), password: 'P'.repeat(32), expiresAt: Date.now() + 60000 };

test('adversarial PAC/Firefox parity: suffix confusion, encodings, hostile domains and expired leases', () => {
  const hosts = ['example.com', 'sub.example.com', 'evil-example.com', 'example.com.attacker.test', 'EXAMPLE.COM', 'example.com.', 'evilru', 'ru.attacker.test', 'foo.ru', 'foo.xn--p1ai', 'vk.com.evil.test', 'vk.com', 'cabinet.templarvpn.com.evil.test', '127.0.0.1', '[::1]'];
  let comparisons = 0;
  for (let i = 0; i < 150; i++) hosts.push(`n${i}.example.com`, `example.com.n${i}.test`, `n${i}.ru`);
  for (const mode of ['all', 'bypass', 'only']) for (const rfServices of [true, false]) for (const expired of [true, false]) {
    const rules = checkedRules({ mode, rfServices, domains: ['example.com'] });
    const context = { rules, lease, controlHost: 'cabinet.templarvpn.com', active: true };
    const sandbox = { Date: { now: () => expired ? lease.expiresAt + 1 : lease.expiresAt - 1 } };
    vm.createContext(sandbox); vm.runInContext(pacScript(context), sandbox);
    for (const host of hosts) {
      const url = `https://${host}/`;
      const normalized = new URL(url).hostname;
      const pac = sandbox.FindProxyForURL(url, normalized);
      const firefox = firefoxProxy(url, context, sandbox.Date.now());
      const outcome = firefox?.type === 'direct' ? 'DIRECT' : firefox[0].host === '127.0.0.1' ? 'BLOCK' : 'VPN';
      assert.equal(pac === 'DIRECT' ? 'DIRECT' : pac.includes('127.0.0.1:9') ? 'BLOCK' : 'VPN', outcome, `${mode} ${rfServices} ${host}`);
      comparisons++;
    }
  }
  assert.equal(comparisons, 5580);
});

test('injected PAC/HTML payloads and credential challenge spoofing are rejected', () => {
  for (const payload of ['a.com\";return \'DIRECT\';//', '</script><img src=x onerror=alert(1)>', 'a.com\nDIRECT', 'a.com/@evil', 'a.com:443', '__proto__', 'a.com\\evil']) {
    assert.throws(() => checkedRules({ mode: 'all', domains: [payload] }));
    assert.equal(escapeHTML(payload).includes('<'), false);
  }
  for (const challenger of [{ host: 'edge.platina300.org.evil.test', port: 9443 }, { host: 'edge.platina300.org', port: 80 }, { host: '127.0.0.1', port: 9443 }]) {
    assert.deepEqual(authenticationResponse({ isProxy: true, challenger, requestId: 'attack' }, lease, new Map()), { cancel: true });
  }
  assert.deepEqual(authenticationResponse({ isProxy: false, challenger: lease.proxy, requestId: 'site-401' }, lease, new Map()), {});
});
