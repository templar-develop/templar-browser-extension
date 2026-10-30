# Templar VPN for Chrome / Firefox

Version 0.4.5, 29 October 2026. Unsigned development candidate. Required API and
regional gateway fixes are deployed under the owner’s current authorization.
Store publication and signing submission remain paused. Paris is the control
plane; browser traffic enters the selected regional TLS gateway and the node's
existing authenticated VLESS inbound. All subscription/device/traffic/exit rules
remain shared with Happ. This protects this browser, not other applications.

## Open source

The original extension code is **GPL-3.0-only**, copyright 2026 Templar
contributors. See [LICENSE](LICENSE), [LICENSE_SCOPE.md](LICENSE_SCOPE.md) and
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). The source repository is
[templar-develop/templar-browser-extension](https://github.com/templar-develop/templar-browser-extension).
Signed store releases are not yet available.
The separate backend, cabinet and bot are outside this source distribution.

[VERIFYING.md](VERIFYING.md) explains building from an empty directory and
comparing unsigned packages. [SECURITY.md](SECURITY.md) covers private reporting
and trust boundaries. [CONTRIBUTING.md](CONTRIBUTING.md) describes contributions.
`npm run source:prepare` exports the reviewed files listed in `public-source.json`
without Git history, backend/pilot files, environment state or generated reports.
Separate-account publication instructions are in
[release/ACCOUNT_SETUP.md](release/ACCOUNT_SETUP.md).

## Build and install

    npm ci
    npm test
    npm run build -- --api=https://cabinet.templarvpn.com/api/browser/v1
    npm run lint:firefox

Chrome: chrome://extensions → Developer mode → Load unpacked → build/chrome.
After rebuilding/replacing files, click Reload on the existing extension in
chrome://extensions. Restarting Chrome alone can retain the old background
module graph while the popup/manifest already shows the new version. ZIP packages
must be unpacked before loading them.
Firefox: about:debugging#/runtime/this-firefox → Load Temporary Add-on →
artifacts/templar-browser-firefox-0.4.5-dev.xpi. A temporary add-on disappears on
browser restart. Permanent installation requires Mozilla signing.
Source builds without --api deliberately cannot sign in/connect. The preview
index.html does not change browser networking.

Build tools: Node 20+, npm 8+, Python 3 with zipfile. The only bundled npm
library is pinned DOMPurify, copied unchanged with its licenses. Firefox now
requires 142+ and declares the required built-in data-consent categories.
Private/incognito windows are explicitly unsupported. The existing About page
links to the source repository and the bundled data/connection explanation.

`npm run release:prepare` creates **local files only** in artifacts/release:
Chrome ZIP, unsigned Firefox ZIP/XPI, reproducible source ZIP and SHA256SUMS.
There is no signing, deployment or upload step. The future Firefox release ID
differs from the development ID; switching IDs requires a new sign-in.
Store copy, permission justification and remaining submission prerequisites are
in release/STORE_DRAFT.md. No account or signing secrets are included.

The Mozilla linter reports one reviewed warning in unmodified DOMPurify's
detached-document parser fallback. scripts/lint-firefox.mjs checks the exact
file hash and warning location; errors and any other warning fail the check.
Current npm audit: no bundled/runtime advisories; three low dev-tool findings
in the web-ext → addons-linter → deepmerge chain remain upstream. Do not use
`npm audit fix --force` to downgrade to an obsolete web-ext. These tools and
their dependency tree are not included in extension packages.

## Local native tests

`tests/e2e/native_local.py` launches Selenium with a separate temporary profile
and loopback-only API, HTTPS proxy, ping responder and target website. It tests
browser behavior against the real extension; it does not emulate production
Xray/accounting or verify real gateway capacity. Ports 9441/9442/9443 must be free.
Run sequentially using Python 3.11+ with Selenium and OpenSSL. Firefox also
requires certutil (NSS tools); only its temporary profile trusts the fixture CA.
Chromium pins only the fixture key, with acceptInsecureCerts=false. No system
certificate store, personal browser profile or customer account is modified.

From this extension directory, using a Python environment with Selenium:

    TEMPLAR_TEST_BINARY=/absolute/path/to/browser TEMPLAR_TEST_DRIVER=/absolute/path/to/driver TEMPLAR_TEST_OUT=/tmp/templar-local-results python3 tests/e2e/native_local.py chrome

Targets: chrome, firefox, edge, opera, brave, yandex. Use the matching official
driver; Yandex requires YandexDriver matching its product version. Branded
Chromium versions can restrict debugging installation; use Chrome for Testing
for a reproducible Chrome run. The harness records failures as failures rather
than treating successful browser launch as a VPN pass. Fixture builds are
isolated under build/fixture and artifacts/fixture, have a separate name/Firefox
ID and cannot be combined with --channel=release. The fixture proxy can tunnel
only to its own local target, never to an arbitrary client-selected URL.

For vendors that restrict WebDriver, tests/e2e/manual_local.py keeps the same
fixture available for native UI checks. Set TEMPLAR_TEST_BINARY and
TEMPLAR_TEST_OUT. Use only the displayed temporary test window and synthetic
local credentials. The control file can switch the fixture API offline or
shorten leases. A failed test-certificate request does not establish a
production TLS failure or successful compatibility. Current Yandex coverage
is limited; see the audit.

## Connection and measurements

Link, email/password and Telegram sign-in use the existing account and one
shared device slot per installation. Repeat sign-in reuses the slot. Issued
names/order, TCP/XHTTP profiles and load indicators follow the subscription.
New nodes appear dynamically after mandatory gateway/accounting verification.

Auto compares HTTPS site response times through primary TCP profiles in parallel,
then connects to the fastest available candidate. Temporary connection failures
can try the next candidates (at most three); denial/invalid credentials never
cause a fallback. A previously resolved Auto node is preferred during renewal.
After its lease
expires, an unavailable node no longer pins Auto forever: up to two other
candidates may be tried, subject to the gateway’s conservative device reservation.
A still-valid tunnel is preserved during a control API outage. Manual XHTTP
selection remains unchanged. A site-ping snapshot is reused for 60 seconds.
Missing results remain unknown.

Refresh ping checks https://www.gstatic.com/generate_204 through every issued
TCP/XHTTP profile independently, with up to eight concurrent requests. A separate
15-second/three-request ticket lets the regional gateway perform only this fixed
HTTPS check through the subscription's accounted inbound. No arbitrary URL, open
relay, browser account bearer or proxy credential is exposed at that endpoint.
One cold sample is discarded; two warm response times are averaged under a
3.5-second profile budget. It does not replace an active VPN lease/routing/timer.
Inline animated dots replace pending ping values without a top status panel.
This is HTTPS site latency including bounded responder overhead, not ICMP ping.
The existing port 9442 service remains a separate static gateway RTT diagnostic.

The coordinated `/latency` API, fixed-site responders on all five nodes and
trusted localPort metadata are deployed. Legacy pinned DNS names are normalized
through the same regional catalog as numeric endpoints. If site latency is
temporarily unavailable, Auto privately ranks bounded gateway RTT instead, then
requests an authorized lease. These fallback RTTs are never shown as site ping. Unknown pings
stay as a dash. Authorization/lease failures still block protected traffic.

To restore ordinary internet while VPN recovery is unavailable, use the explicit
“Отключить VPN” button on the blocked screen or the power button. Disconnect clears
the extension proxy locally even when the service is offline; an optional privacy
cleanup failure does not keep VPN intent active. Removing the extension is not
required. A competing proxy policy is never overwritten.
New RF preferences default to No/direct; an explicit saved setting is preserved.

Connect/Auto/Refresh, ping and speed jobs are serialized and cancellable.
State reads bypass network jobs. Disconnect/Logout cancel in-flight work;
late responses cannot install a cancelled lease. Popup closure does not cancel
background work. During connecting, the power button cancels the connection.

## Sign-in and recovery

Short access tokens and proxy credentials stay in trusted storage.session.
Only a separate, scoped refresh credential is persisted in local extension
storage, bound to the installation, subscription and browser device. It expires
at the earlier of 30 days and subscription expiry. The service stores its HMAC,
not plaintext. Fresh login replaces it. Logout revokes it and clears local data;
offline revocation is best effort. Passwords and subscription links are never
persisted, synchronized or included in diagnostics.

Local extension storage is not an OS keychain or protection against someone
who can read the browser profile. TRUSTED_CONTEXTS is used when supported; no
content scripts/external message handlers are installed. See the audit limits.

Existing unexpired 0.4.0 logins upgrade through an authenticated, installation-
bound endpoint; expired old logins still require authentication. A full browser
restart restores sign-in and prior VPN intent. Explicit disconnect stays off.
Expired credentials block protected traffic until confirmed recovery. Startup,
online/connection changes where supported, and the active 30-second renewal
alarm retry recovery. Temporary API timeouts/rate limits preserve an existing
authorized tunnel only until its original deadline, without extending access
locally. Authorization denial, invalid responses, identity replacement and RF
route replacement still block. A pinned node’s explicit missing-worker response
allows immediate replacement after fresh authorization; an uncertain timeout
never permits duplicate device workers. Browser sleep does not keep a server lease alive; after
wake the next event/alarm restores it. Alarms are checked at startup because
browser implementations differ in persistence. No idle sign-in/network polling
runs while disconnected, apart from a user-started Telegram challenge.

About → Show diagnostics produces an allowlisted local report: build version,
connection/region state, route mode and safe error code. It omits tokens,
passwords, subscription URLs, identities and the custom domain list. Nothing is
sent to support automatically.

## Provisioning and evidence

Every future location must install its own gateway, private-destination guard,
restricted SSH control, TLS renewal, the bounded 9442 TLS RTT responder and
9441 fixed-site responder. The onboarding probe verifies the responders and authenticated VLESS transfer,
accounting, renew/revoke before publishing the catalog. No extension update or
hardcoded country list is needed. See AGENTS.md and ops/browser-gateway/README.md.

Current 0.4.5 deployment and native/live evidence: docs/audits/2026-10-29-browser-readiness.md.
Earlier packaging/browser evidence: docs/audits/2026-10-29-browser-release-preparation.md.
Production 0.4.1 evidence: docs/audits/2026-10-29-browser-fast-recovery.md.
Previous regional rollout/security: docs/audits/2026-10-29-browser-regional-gateways.md.
Signing/store review, full Firefox permanent-install restart, long-duration
capacity, actual OS sleep/real network handover and untested platforms remain
release checks. Native smoke tests do not establish every Chromium fork's support.
