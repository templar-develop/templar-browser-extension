import test from 'node:test';
import assert from 'node:assert/strict';
import { buildConfiguration, extensionManifest } from '../scripts/build-config.mjs';
import { BrowserApi } from '../runtime/api.js';

const api = 'https://cabinet.templarvpn.com/api/browser/v1';
const local = 'http://127.0.0.1:4189/api/browser/v1';

test('build channels reject ambiguous, empty and unexpected arguments', () => {
  for (const args of [['--api='], ['--fixture='], ['--channel='], ['--channel=fixture'],
    ['--api=' + api, '--fixture=' + local], ['--api=', '--fixture=' + local],
    ['--api=' + api, '--api=' + api], ['--fixture=' + local, '--fixture=' + local],
    ['--channel=dev', '--channel=dev'], ['--api'], ['--upload=true'], ['--channel=release']]) {
    assert.throws(() => buildConfiguration(args), undefined, JSON.stringify(args));
  }
});

test('local fixture credentials and insecure API origins cannot enter a release', () => {
  for (const base of [local, 'https://evil.test/api/browser/v1', api + '?x=1',
    'https://user:secret@cabinet.templarvpn.com/api/browser/v1', api + '/']) {
    assert.throws(() => buildConfiguration(['--channel=release', '--api=' + base]));
  }
  assert.throws(() => buildConfiguration(['--channel=release', '--fixture=' + local]));
  assert.throws(() => new BrowserApi(local));
  for (const base of [api, local.replace('127.0.0.1', 'localhost'), local.replace(':4189', ''),
    local.replace('127.0.0.1', '192.168.1.2')]) {
    assert.throws(() => buildConfiguration(['--fixture=' + base]));
  }
  assert.deepEqual(buildConfiguration(['--fixture=' + local]), { apiBase: local, fixture: true, channel: 'fixture' });
  assert.deepEqual(buildConfiguration(['--channel=release', '--api=' + api]), { apiBase: api, fixture: false, channel: 'release' });
  assert.equal(buildConfiguration([]).apiBase, null);
});

test('release and fixture manifests keep separate identity and CSP boundaries', () => {
  const release = extensionManifest({ target: 'firefox', version: '0.4.2', ...buildConfiguration(['--channel=release', '--api=' + api]) });
  const fixture = extensionManifest({ target: 'firefox', version: '0.4.2', ...buildConfiguration(['--fixture=' + local]) });
  assert.notEqual(release.browser_specific_settings.gecko.id, fixture.browser_specific_settings.gecko.id);
  assert.equal(release.incognito, 'not_allowed');
  assert.equal(release.browser_specific_settings.gecko.strict_min_version, '142.0');
  assert.deepEqual(release.browser_specific_settings.gecko.data_collection_permissions.required,
    ['authenticationInfo', 'personallyIdentifyingInfo', 'browsingActivity', 'websiteContent']);
  assert.ok(!release.content_security_policy.extension_pages.includes('127.0.0.1'));
  assert.ok(!fixture.content_security_policy.extension_pages.includes('cabinet.templarvpn.com'));
  assert.ok(!fixture.content_security_policy.extension_pages.includes('cloudflare'));
  assert.equal(release.content_scripts, undefined);
  assert.equal(release.externally_connectable, undefined);
  assert.throws(() => extensionManifest({ target: 'safari' }));
});
