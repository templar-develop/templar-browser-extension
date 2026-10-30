// Local standalone source export. No Git history, server files or upload step.
import { lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const sourceRoot = fileURLToPath(new URL('../', import.meta.url));
const sourceTimestamp = [2020, 1, 1, 0, 0, 0];
const sha256 = data => createHash('sha256').update(data).digest('hex');

export function validateSourcePath(path) {
  if (typeof path !== 'string' || !path || path.includes('\\') || path.includes('\0') || isAbsolute(path)
      || path.split('/').some(part => !part || part === '.' || part === '..')
      || /(?:^|\/)(?:\.git|\.env(?:\.[^/]*)?|node_modules|server|build|artifacts|__pycache__|\.DS_Store)(?:\/|$)/i.test(path)
      || /(?:private|credentials?|secrets?)(?:[._-]|$)/i.test(path)
      || /\.(?:pem|key|p12|pfx|log|pyc|dump|sql)$/i.test(path)) throw new Error('SOURCE_PATH_DENIED');
  return path;
}

export function validateSourceBytes(path, bytes) {
  // Binary inputs are only the four reviewed icon PNGs. No archives, EXIF or
  // arbitrary opaque blobs are allowed through this exception.
  if (/^assets\/icons\/(?:16|32|48|128)\.png$/.test(path)) {
    if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('SOURCE_ICON_INVALID');
    let offset = 8; let ended = false;
    while (offset + 12 <= bytes.length) {
      const length = bytes.readUInt32BE(offset); const type = bytes.toString('ascii', offset + 4, offset + 8);
      if (!['IHDR', 'pHYs', 'IDAT', 'IEND'].includes(type) || offset + 12 + length > bytes.length) throw new Error('SOURCE_ICON_METADATA');
      offset += 12 + length;
      if (type === 'IEND') { ended = true; break; }
    }
    if (!ended || offset !== bytes.length) throw new Error('SOURCE_ICON_INVALID');
    return;
  }
  const text = bytes.toString('utf8');
  if (text.includes('\0') || !Buffer.from(text).equals(bytes)) throw new Error('SOURCE_BINARY_DENIED');
  const forbidden = [
    /-----BEGIN (?:[A-Z0-9]+ )?PRIVATE KEY-----/,
    /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/,
    /\bAKIA[0-9A-Z]{16}\b/,
    /\b[1-9][0-9]{5,12}:[A-Za-z0-9_-]{30,}\b/,
    /\b(?:vless|vmess|trojan|ss):\/\/[A-Za-z0-9+/_-]{12,}/i,
    /https:\/\/sub\.templarvpn\.com\/connect\/[A-Za-z0-9_-]{16,}/,
    new RegExp('(?:/Users/|/home/)' + '[A-Za-z0-9_.-]+/'),
    /[A-Za-z]:\\Users\\[A-Za-z0-9_.-]+\\/,
  ];
  if (forbidden.some(pattern => pattern.test(text))) throw new Error('SOURCE_CONTENT_DENIED');
}

export async function collectPublicSource(root = sourceRoot) {
  const realRoot = await realpath(root);
  const manifest = JSON.parse(await readFile(join(root, 'public-source.json'), 'utf8'));
  if (manifest.schema !== 1 || !Array.isArray(manifest.files) || !manifest.files.length
      || new Set(manifest.files).size !== manifest.files.length) throw new Error('SOURCE_MANIFEST_INVALID');
  const files = [];
  for (const path of [...manifest.files].sort()) {
    validateSourcePath(path);
    let cursor = root;
    for (const part of path.split('/')) {
      cursor = join(cursor, part);
      if ((await lstat(cursor)).isSymbolicLink()) throw new Error('SOURCE_SYMLINK');
    }
    if (!(await lstat(cursor)).isFile()) throw new Error('SOURCE_NOT_FILE');
    if (!(await realpath(cursor)).startsWith(realRoot + sep)) throw new Error('SOURCE_OUTSIDE_ROOT');
    const bytes = await readFile(cursor);
    validateSourceBytes(path, bytes);
    files.push({ path, sha256: sha256(bytes), bytes: bytes.length });
  }
  return files;
}

export async function preparePublicSource({ root = sourceRoot, outputDir = join(root, 'artifacts/source') } = {}) {
  const files = await collectPublicSource(root);
  const { version, license } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  if (!/^\d+\.\d+\.\d+$/.test(version) || license !== 'GPL-3.0-only') throw new Error('SOURCE_PACKAGE_METADATA');
  const body = await readFile(join(root, 'LICENSE'), 'utf8');
  if (!body.includes('GNU GENERAL PUBLIC LICENSE') || !body.includes('Version 3, 29 June 2007')) throw new Error('SOURCE_LICENSE_MISSING');
  await mkdir(outputDir, { recursive: true });
  const archive = join(outputDir, `templar-browser-source-${version}.zip`);
  execFileSync('python3', ['-c', `import json,pathlib,sys,zipfile
root=pathlib.Path(sys.argv[1]); out=pathlib.Path(sys.argv[2]); files=json.load(sys.stdin)
with zipfile.ZipFile(out,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
 for row in files:
  data=(root/row['path']).read_bytes()
  import hashlib
  if hashlib.sha256(data).hexdigest()!=row['sha256']: raise ValueError('SOURCE_CHANGED_DURING_EXPORT')
  info=zipfile.ZipInfo(row['path'],(${sourceTimestamp.join(', ')}));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o100644<<16
  z.writestr(info,data,compresslevel=9)
`, root, archive], { input: JSON.stringify(files), stdio: ['pipe', 'pipe', 'pipe'] });
  const archiveHash = sha256(await readFile(archive));
  const metadata = { schema: 1, version, license, published: false, gitHistoryIncluded: false,
    archive: relative(outputDir, archive), sha256: archiveHash, files };
  await writeFile(join(outputDir, 'SOURCE_MANIFEST.json'), JSON.stringify(metadata, null, 2) + '\n');
  return metadata;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2) throw new Error('NO_SOURCE_OPTIONS_SUPPORTED');
  const result = await preparePublicSource();
  console.log(`Local source ZIP: artifacts/source/${result.archive} (${result.files.length} files). No Git history or upload.`);
}
