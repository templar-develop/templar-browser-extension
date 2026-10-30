# Build and verify

This project uses plain JavaScript modules. There is no transpiler, code
obfuscation or remote runtime loader. Build steps copy the source and locked
DOMPurify, generate the popup/manifest/API configuration and create deterministic
ZIP files. Inspect `scripts/build.mjs` and `scripts/build-config.mjs`.

## From a standalone source archive

Extract into an empty directory. Node.js 20+, npm 8+ and Python 3 with `zipfile`
are required. Use the same Node/npm/Python and platform when comparing builds;
ZIP compression can vary across zlib/tool versions.

```sh
npm ci
npm test
npm run build -- --channel=release --api=https://cabinet.templarvpn.com/api/browser/v1
npm run lint:firefox -- build/release/firefox
```

The release build is a local operation: it does not log in, use customer
credentials, submit to a store, sign or publish. An active service subscription
is needed only for actually connecting through Templar. Omitting `--api` in a
development build deliberately produces an offline extension.

Compare the SHA-256 of the matching source-built unsigned ZIP with the
distributed unsigned ZIP. On macOS use `shasum -a 256`; on Linux use `sha256sum`.
The local filenames are:

- `artifacts/release/templar-browser-chrome-0.4.5-release.zip`
- `artifacts/release/templar-browser-firefox-0.4.5-release.zip`
- `artifacts/release/templar-browser-firefox-0.4.5-release.xpi`

The unsigned XPI is byte-identical to the Firefox ZIP. Mozilla/store signing
adds or changes files, so byte equality with a signed store download is not
claimed. Compare its extension file contents against the unsigned build while
accounting explicitly for signature/store-generated metadata; do not ignore
unexplained runtime differences. There is no signed/published store release yet.

`npm run release:prepare` runs build/lint and creates a source ZIP, package hashes
and `LOCAL_ONLY.json`. `npm run source:prepare` creates only a standalone source
ZIP and its file manifest under `artifacts/source`; it has no upload step.

## What source export contains

`public-source.json` explicitly names every allowed file. The exporter rejects
symlinks and common credential/private-path patterns and writes fixed ZIP
timestamps/permissions. It never copies Git history, backend/server directories,
environment files, personal profiles, logs, reports or node_modules. New files
must be deliberately added to the manifest after review. This pattern scan is
an aid to review, not a guarantee that arbitrary secrets can always be detected.

The tests and loopback browser fixture are included. `npm ci` downloads locked
dependencies from the npm registry; this is not a fully offline build.
`scripts/harden-build-deps.mjs` applies a reviewed fix to development-only
deepmerge during installation. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
The Firefox linter permits only the exact documented DOMPurify vendor warning.

Pre-generated icon PNGs and brand colors are source inputs. No access to another
repository is required to build. Optional icon regeneration needs separately
installed `sharp`; optional brand syncing needs an explicitly supplied landing
directory. Neither runs during build or `npm ci`.
