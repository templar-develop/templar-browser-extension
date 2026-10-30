import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectPublicSource, preparePublicSource, validateSourceBytes, validateSourcePath } from '../scripts/public-source.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

test('standalone source export is reproducible, licensed and excludes unlisted private data', async () => {
  const outputDir = await mkdtemp(join(tmpdir(), 'templar-source-export-'));
  try {
    const first = await preparePublicSource({ outputDir });
    const bytes = await readFile(join(outputDir, first.archive));
    const second = await preparePublicSource({ outputDir });
    assert.equal(first.sha256, second.sha256);
    assert.deepEqual(bytes, await readFile(join(outputDir, second.archive)));
    assert.equal(first.license, 'GPL-3.0-only');
    assert.equal(first.published, false);
    assert.equal(first.gitHistoryIncluded, false);
    const names = JSON.parse(execFileSync('python3', ['-c',
      'import json,sys,zipfile;print(json.dumps(zipfile.ZipFile(sys.argv[1]).namelist()))', join(outputDir, first.archive)], { encoding: 'utf8' }));
    for (const name of ['LICENSE', 'LICENSE_SCOPE.md', '.gitignore', 'package-lock.json', 'runtime/background.js',
      'VERIFYING.md', 'SECURITY.md', 'tests/public-source.test.js', 'scripts/public-source.mjs', 'public-source.json']) assert.ok(names.includes(name));
    assert.ok(!names.some(name => /(?:^|\/)(?:server|\.git|artifacts|node_modules|build)(?:\/|$)/.test(name)));
    assert.deepEqual(names, first.files.map(row => row.path));
    assert.ok((await readFile(join(root, 'LICENSE'), 'utf8')).includes('Version 3, 29 June 2007'));
  } finally { await rm(outputDir, { recursive: true, force: true }); }
});

test('source export rejects private files, traversal, credential formats and local user paths', () => {
  for (const path of ['../outside.js', 'runtime/../../outside.js', '/absolute.js', '.env', '.env.example',
    'server/pilot.py', 'runtime/session-private.json', 'credentials.json', 'assets/key.pem', 'folder\\escape.js']) {
    assert.throws(() => validateSourcePath(path));
  }
  const samples = [
    ['-----BEGIN ', 'PRIVATE KEY-----'].join(''),
    'gh' + 'p_' + 'a'.repeat(36),
    ['123456789', ':', 'a'.repeat(35)].join(''),
    ['vless', '://', '12345678-1234-1234-1234-123456789abc'].join(''),
    ['https://sub.templarvpn.com/connect/', 'a'.repeat(32)].join(''),
    ['/', 'Users', '/', 'personal-user', '/project'].join(''),
  ];
  for (const text of samples) assert.throws(() => validateSourceBytes('runtime/example.js', Buffer.from(text)));
  assert.doesNotThrow(() => validateSourceBytes('runtime/example.js', Buffer.from('const token = "synthetic_fixture_value";')));
  assert.throws(() => validateSourceBytes('assets/icons/128.png', Buffer.from('not a PNG')));
});

test('source export does not traverse a symlinked directory or include an unlisted file', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'templar-source-boundary-'));
  try {
    await mkdir(join(temporary, 'actual'));
    await writeFile(join(temporary, 'actual/file.js'), 'export const local = true;');
    await writeFile(join(temporary, 'unlisted.js'), 'not in export');
    await writeFile(join(temporary, 'public-source.json'), JSON.stringify({ schema: 1, files: ['actual/file.js'] }));
    assert.deepEqual((await collectPublicSource(temporary)).map(row => row.path), ['actual/file.js']);
    await symlink(join(temporary, 'actual'), join(temporary, 'linked'));
    await writeFile(join(temporary, 'public-source.json'), JSON.stringify({ schema: 1, files: ['linked/file.js'] }));
    await assert.rejects(collectPublicSource(temporary), /SOURCE_SYMLINK/);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});
