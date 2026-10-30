import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import './harden-build-deps.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = resolve(root, process.argv[2] || 'build/firefox');
const result = spawnSync(process.execPath, [join(root, 'node_modules/web-ext/bin/web-ext.js'),
  'lint', '--source-dir', source, '--output', 'json'], { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 });
if (result.error || !result.stdout) throw result.error || new Error(result.stderr || 'LINTER_FAILED');
const report = JSON.parse(result.stdout);
const hash = createHash('sha256').update(await readFile(join(source, 'vendor/purify.es.mjs'))).digest('hex');
// The linter does not yet recognize this upstream version. Its one warning is
// the sanitizer's own detached-document parser fallback, before sanitization.
// Pin the exact reviewed, unmodified file; every first-party warning is fatal.
const reviewed = hash === '60c5d5ccbb466de3de3ba863461a92bf134f8c156cef7992da43e0f659bc5cbd'
  && report.warnings.length <= 1 && report.warnings.every(warning => warning.code === 'UNSAFE_VAR_ASSIGNMENT'
    && warning.file === 'vendor/purify.es.mjs' && warning.line === 1845 && warning.column === 5);
console.log(JSON.stringify({ summary: report.summary, warnings: report.warnings, reviewedVendorHash: hash }, null, 2));
if (result.status !== 0 || report.errors.length || !reviewed) process.exitCode = 1;
else if (report.warnings.length) console.log('Reviewed vendor warning: DOMPurify 3.4.17 detached parser fallback. No first-party warnings.');
