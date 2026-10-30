// Entirely local. No signing, store upload, deployment or API request.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { preparePublicSource } from './public-source.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
if (process.argv.length !== 2) throw new Error('NO_RELEASE_OPTIONS_SUPPORTED');
const { version } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
execFileSync(process.execPath, ['scripts/build.mjs', '--channel=release', '--api=https://cabinet.templarvpn.com/api/browser/v1'], { cwd: root, stdio: 'inherit' });
execFileSync(process.execPath, ['scripts/lint-firefox.mjs', 'build/release/firefox'], { cwd: root, stdio: 'inherit' });
const folder = join(root, 'artifacts/release');
const sourceName = `templar-browser-source-${version}.zip`;
// Use the same reviewed file manifest as the standalone GitHub export.
await preparePublicSource({ root, outputDir: folder });
const names = [sourceName, `templar-browser-chrome-${version}-release.zip`,
  `templar-browser-firefox-${version}-release.zip`, `templar-browser-firefox-${version}-release.xpi`];
const hashes = [];
for (const name of names) hashes.push(`${createHash('sha256').update(await readFile(join(folder, name))).digest('hex')}  ${name}`);
await writeFile(join(folder, 'SHA256SUMS'), hashes.join('\n') + '\n');
await writeFile(join(folder, 'LOCAL_ONLY.json'), JSON.stringify({ version, published: false, deployed: false, firefoxSigned: false,
  node: process.version, note: 'Local review candidates only. Store publication and signing submission remain paused. Required browser API/gateway fixes are deployed separately.' }, null, 2) + '\n');
console.log(`Local review kit: ${folder}. Firefox XPI is unsigned. Nothing uploaded or deployed.`);
