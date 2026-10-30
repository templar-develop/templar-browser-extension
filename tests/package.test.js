import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

test('release archives are reproducible and contain only the isolated production configuration', () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const { version } = JSON.parse(readFileSync(join(root, 'package.json')));
  const build = () => execFileSync(process.execPath, ['scripts/build.mjs', '--channel=release',
    '--api=https://cabinet.templarvpn.com/api/browser/v1'], { cwd: root, stdio: 'pipe' });
  const files = ['chrome', 'firefox'].map(target => join(root, 'artifacts/release', `templar-browser-${target}-${version}-release.zip`));
  const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
  build(); const first = files.map(hash);
  build(); assert.deepEqual(files.map(hash), first);
  for (const [index, target] of ['chrome', 'firefox'].entries()) {
    const data = JSON.parse(execFileSync('python3', ['-c',
      'import zipfile,json,sys;z=zipfile.ZipFile(sys.argv[1]);print(json.dumps({"names":z.namelist(),"manifest":json.loads(z.read("manifest.json")),"config":z.read("runtime/config.js").decode(),"privacy":z.read("privacy.html").decode()}))',
      files[index]], { encoding: 'utf8' }));
    assert.equal(data.manifest.name, 'Templar VPN');
    assert.equal(data.manifest.version, version);
    assert.ok(data.config.includes('ALLOW_LOCAL_FIXTURE = false'));
    assert.ok(data.config.includes('https://cabinet.templarvpn.com/api/browser/v1'));
    assert.ok(!data.config.includes('127.0.0.1'));
    assert.ok(!data.manifest.content_security_policy.extension_pages.includes('127.0.0.1'));
    assert.equal(data.manifest.externally_connectable, undefined);
    assert.equal(data.manifest.content_scripts, undefined);
    assert.equal(data.manifest.web_accessible_resources, undefined);
    assert.ok(data.manifest.content_security_policy.extension_pages.includes("script-src 'self'"));
    assert.ok(data.manifest.content_security_policy.extension_pages.includes("object-src 'none'"));
    assert.ok(!/unsafe-eval|unsafe-inline/.test(data.manifest.content_security_policy.extension_pages));
    assert.ok(!data.names.some(name => /(?:^|\/)(?:\.env|node_modules|tests|scripts|build|artifacts)(?:[/.]|$)/.test(name)));
    assert.ok(!data.names.includes('app.js') && !data.names.includes('index.html'));
    for (const name of ['privacy.html', 'vendor/purify.es.mjs', 'vendor/DOMPurify-LICENSE', 'vendor/DOMPurify-LICENSE-MPL']) assert.ok(data.names.includes(name));
    assert.ok(data.privacy.includes('Cloudflare'));
    if (target === 'firefox') assert.equal(hash(files[index].replace(/\.zip$/, '.xpi')), first[index]);
  }
});
