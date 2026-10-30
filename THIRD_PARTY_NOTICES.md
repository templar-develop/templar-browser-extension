# Emoji flags

The unmodified SVG emoji flags in `assets/emoji/` are Twemoji graphics by Twitter
and other contributors, maintained by the jdecked/twemoji project.

- Source: https://github.com/jdecked/twemoji
- Revision: `b6b55fef1e8636b540a6d016a4729ca8cdf2e60b`
- Files: `assets/svg/1f1f7-1f1fa.svg` (Russia), `1f1e8-1f1ed.svg` (Switzerland),
  `1f1f8-1f1ea.svg` (Sweden), `1f1f3-1f1f1.svg` (Netherlands),
  `1f1ea-1f1fa.svg` (European Union), `1f1f5-1f1f1.svg` (Poland).
- Graphics license: CC BY 4.0, https://creativecommons.org/licenses/by/4.0/
- Full license: `assets/emoji/LICENSE-GRAPHICS`.

No Twemoji script is included. Images are bundled locally, with no CDN requests.
The Templar logo is copied from this project's public landing, not from Twemoji.

# DOMPurify

`vendor/purify.es.mjs` in generated packages is the unmodified DOMPurify 3.4.17
ES module by Cure53 and contributors, https://github.com/cure53/DOMPurify.
It sanitizes popup HTML locally; it does not send data or load remote code.
The exact npm version and integrity are locked in package-lock.json. The full
dual Apache-2.0 / MPL-2.0 license is bundled as `vendor/DOMPurify-LICENSE`.

# Firefox development tooling

The development-only `web-ext` / `addons-linter` dependency uses deepmerge 4.3.1.
GHSA-gcqx-w48m-w2h4 has no upstream patched release at the time of this audit.
`scripts/harden-build-deps.mjs` applies an own-data-property fix to its three
JavaScript entry points, during installation and before Firefox linting. It
rejects unexpected versions/source layouts; `tests/build-deps.test.js` exercises
the original prototype-poisoning payload and ordinary merge behavior.
The npm advisory still identifies the locked upstream version. This tooling
and its patch do not enter the installed extension packages.

## QR Code Generator

The extension bundles qrcode-generator 2.0.4 by Kazuhiko Arase under the MIT
license. Its license is included in `vendor/QR-Code-LICENSE` in packaged builds.
QR codes are generated locally; no third-party QR service receives login links.
Source: https://github.com/kazuhikoarase/qrcode-generator .
