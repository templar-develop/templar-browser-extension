import { readFile, writeFile, mkdir, rm, cp, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildConfiguration, extensionManifest } from './build-config.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const { version, repository } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const { apiBase, fixture, channel } = buildConfiguration(process.argv.slice(2));
const artifactRoot = join(root, 'artifacts', ...(channel === 'dev' ? [] : [channel]));
const buildRoot = join(root, 'build', ...(channel === 'dev' ? [] : [channel]));
const html = await readFile(join(root, 'index.html'), 'utf8');
const definitions = html.match(/<svg class="icon-defs"[\s\S]*?<\/svg>/)?.[0];
const header = html.match(/<header class="popup-header">[\s\S]*?<\/header>/)?.[0];
const footer = html.match(/<footer class="popup-footer">[\s\S]*?<\/footer>/)?.[0]
  .replace(/<div class="demo-caption">[\s\S]*?<\/div>/, `<div class="build-caption">${channel === 'release' ? 'Templar VPN' : fixture ? 'Локальный стенд' : 'Тестовая сборка'} · ${version}</div>`);
if (!definitions || !header || !footer) throw new Error('Popup markup not found');
const popup = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Templar VPN</title><link rel="stylesheet" href="site-brand.css"><link rel="stylesheet" href="styles.css"><link rel="stylesheet" href="standalone.css"><script type="module" src="runtime/popup.js"></script></head><body><canvas id="stars" aria-hidden="true"></canvas>${definitions}<main class="popup" id="popup">${header}<div class="screen" id="screen"></div>${footer}</main></body></html>`;
await mkdir(artifactRoot, { recursive: true });

for (const target of ['chrome', 'firefox']) {
  const folder = join(buildRoot, target);
  await rm(folder, { recursive: true, force: true });
  await mkdir(folder, { recursive: true });
  for (const file of ['flags.js', 'site-brand.css', 'styles.css', 'preferences.js', 'profiles.js', 'settings-ui.js', 'onboarding-ui.js', 'speedtest-ui.js', 'motion.js', 'starfield.js', 'i18n.js', 'LICENSE', 'LICENSE_SCOPE.md', 'THIRD_PARTY_NOTICES.md', 'privacy.html']) await cp(join(root, file), join(folder, file));
  for (const directory of ['assets', 'runtime']) await cp(join(root, directory), join(folder, directory), { recursive: true });
  await mkdir(join(folder, 'vendor'), { recursive: true });
  await cp(join(root, 'node_modules/dompurify/dist/purify.es.mjs'), join(folder, 'vendor/purify.es.mjs'));
  await cp(join(root, 'node_modules/dompurify/LICENSE'), join(folder, 'vendor/DOMPurify-LICENSE'));
  await cp(join(root, 'node_modules/dompurify/LICENSE-MPL'), join(folder, 'vendor/DOMPurify-LICENSE-MPL'));
  await cp(join(root, 'node_modules/qrcode-generator/dist/qrcode.mjs'), join(folder, 'vendor/qrcode.mjs'));
  await cp(join(root, 'vendor/QR-Code-LICENSE'), join(folder, 'vendor/QR-Code-LICENSE'));
  await writeFile(join(folder, 'runtime/config.js'), `export const API_BASE = ${JSON.stringify(apiBase)};\nexport const ALLOW_LOCAL_FIXTURE = ${fixture};\nexport const BUILD_VERSION = '${version}';\nexport const SOURCE_CODE_URL = ${JSON.stringify(repository?.url ?? null)};\n`);
  await writeFile(join(folder, 'popup.html'), popup);
  await writeFile(join(folder, 'standalone.css'), 'html,body{width:398px;min-width:398px;margin:0;overflow:hidden}body>.popup{height:600px;border-radius:0;border:0}.build-caption{font-size:9px;color:var(--bone-faint)}');
  const manifest = extensionManifest({ target, version, apiBase, fixture, channel });
  await writeFile(join(folder, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  const archive = join(artifactRoot, `templar-browser-${target}-${version}-${channel}.zip`);
  execFileSync('python3', ['-c', 'import pathlib,zipfile,sys;root=pathlib.Path(sys.argv[1]);archive=pathlib.Path(sys.argv[2]);\nwith zipfile.ZipFile(archive,"w",compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:\n for p in sorted(root.rglob("*")):\n  if p.is_file():\n   info=zipfile.ZipInfo(str(p.relative_to(root)),(2020,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o100644<<16;z.writestr(info,p.read_bytes(),compresslevel=9)', folder, archive]);
  if (target === 'firefox') await cp(archive, archive.replace(/\.zip$/, '.xpi'));
  console.log(`${target}: ${archive}`);
}
console.log(fixture ? 'LOCAL FIXTURE ONLY: isolated build; no production API configured.' : apiBase ? 'Local package built against the first-party API. No deployment, submission or upload was performed.' : 'Offline package: sign-in and connection are disabled.');
