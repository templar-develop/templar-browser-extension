// GHSA-gcqx-w48m-w2h4 has no upstream fixed release. The Firefox linter's
// deepmerge must create own data properties, never invoke __proto__ setters.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const root = dirname(require.resolve('deepmerge/package.json'));
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
if (pkg.version !== '4.3.1') throw new Error('Review deepmerge hardening for the installed version');
const marker = 'TEMPLAR_DEEPMERGE_OWN_PROPERTIES';
for (const name of ['index.js', 'dist/cjs.js', 'dist/umd.js']) {
  const file = join(root, name);
  let source = readFileSync(file, 'utf8');
  if (source.includes(marker)) continue;
  let changes = 0;
  source = source.replace(/destination\[key\] = ([^\n;]+);?/g, (_, value) => {
    changes++;
    return `Object.defineProperty(destination, key, { value: ${value}, enumerable: true, configurable: true, writable: true });`;
  });
  if (changes !== 3) throw new Error(`Unexpected deepmerge source: ${name}`);
  writeFileSync(file, `// ${marker}\n${source}`);
}
console.log('Firefox build dependency own-property guard applied');
