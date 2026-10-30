# First-party browser API contract — 0.4.7

Base: https://cabinet.templarvpn.com/api/browser/v1. JSON only, no redirects,
no cookies, bounded 4 KiB request / 128 KiB response. Timestamps are Unix ms.
Origins are explicit first-party or valid extension origins; no credentialed
CORS. Server-side authorization, quotas, device ledger and route allowlists are
mandatory. Administrative credentials and private VLESS profiles never reach
the extension. Public region IDs and flags are discovered dynamically.

| Method/path | Credentials/input | Result |
| --- | --- | --- |
| POST /session | {subscriptionUrl,deviceId} | Session |
| POST /auth/cabinet | {deviceId} | Public QR URL, confirmation code and private poll secret |
| POST /auth/cabinet/poll | {code,pollToken,deviceId} | {pending:true} or Session |
| POST /auth/cabinet/cancel | {code,pollToken,deviceId} | {} |
| POST /auth/telegram | {deviceId} | {url,pollToken} for the owned bot |
| POST /auth/telegram/poll | {pollToken,deviceId} | {pending:true} or Session |
| POST /auth/remember | Bearer access, {deviceId} | Session; upgrade an existing login |
| POST /auth/refresh | {refreshToken,deviceId} | Session; fresh short access token |
| POST /auth/revoke | {refreshToken,deviceId} | {}; durably revoke remembered login |
| GET /subscription | Bearer access | Subscription |
| POST /connect | Bearer access, {region,rfServices} | Lease |
| POST /disconnect | Bearer access | {}; close this token's lease |
| DELETE /session | Bearer access | {}; revoke access and close its lease |

Session: {token,sessionExpiresAt,subscription,refresh:{token,expiresAt}}.
Access is opaque browser-scoped, maximum 24h (default 1h), short proxy leases
maximum 5m (target 120s), bounded by session/subscription end. Refresh is a
separate opaque credential, fixed lifetime <=30 days/subscription end. It is
bound to device, installation and subscription; only its HMAC and deadline are
stored server-side. Refresh revalidates authoritative status, devices and traffic,
rotates access, keeps its original deadline, and cannot authorize traffic itself.
A fresh login replaces the refresh credential. Online logout revokes both;
expired access can still revoke its owned refresh credential. Delayed old logout
cannot revoke a fresh replacement. A revoked/removed installation cannot refresh.
Existing-login upgrade requires its active access token and exact installation.

Subscription: {status:"ACTIVE",expiresAt,trafficLimitBytes,trafficUsedBytes,
devices:{used,limit},regions:[{id,name,flag,transport,load?,latencyHost?}]}.
Finite limits are positive safe integers; null traffic limit is unlimited.
Each TCP/XHTTP profile keeps its issued name/order and unique region ID. Only
permitted profiles are returned. Unsupported Hysteria is excluded. Device
registration is atomic in the existing database/shared HWID ledger; changing a
client field cannot increase limits. Subscription links are verified owned
hosts/paths and exact database matches; never arbitrary server-side fetch URLs.

Lease: {regionId,proxy:{host,port},username,password,expiresAt}.
Manual requested region must match the response. A fresh profile/account/device
check precedes and follows allocation. One device cannot fill multiple nodes
with rotated sessions. The regional gateway uses the existing authenticated
VLESS inbound, accounting and outbound policies. Paris only controls leases.
No direct/freedom exit, silent DIRECT fallback or customer-account probe is
allowed. Server watchdog expiry closes existing tunnels independently of PAC.

The registry supplies latencyHost only for verified operator-owned regional
hosts. POST /latency accepts {regions:[issued IDs]} and the access bearer.
One fresh private profile snapshot and current device/subscription authorization
prepare distinct TCP/XHTTP fixed-site tickets. Device/IP rate limits and node
capacity apply; profile URLs/addresses cannot come from the browser. The result
is {probes:{regionId:{regionId,host,ticket,expiresAt}|null}}. Tickets are never
persisted or included in publicState; they last <=15 seconds / access / subscription
expiry, authorize only three requests and cannot open a general proxy.

The browser calls https://HOST:9441/site-latency?nonce=UUID with that ticket,
no cookies, no redirects. The responder waits for a validated HTTPS 204 from
https://www.gstatic.com/generate_204 through the exact issued VLESS profile and
its existing accounted inbound. It returns no site content. One warm request is
discarded; two subsequent full request times are averaged. TCP/XHTTP are separate,
up to eight probes run concurrently under a 3.5-second per-profile browser budget.
Auto checks only TCP candidates and reuses site measurements for <=60 seconds.
Unknown/failed values remain unknown, never gateway RTT displayed as site ping.

This is a fixed-site HTTPS response time, not ICMP or a promise of the latency to
every website. It includes the restricted gateway responder's processing overhead.
Active browser leases, routing and connected timers never change for a probe.
A loopback-only diagnostic worker permits only the fixed site on TCP 443 and
retains subscription identity, accounting and expiry. Capacity is separate from
the public lease pool (8 diagnostic workers per node), with a 32-connection limit.
Anonymous/wrong tickets, arbitrary URLs, CONNECT, cookies, duplicate headers,
bodies and proxy credentials cannot use the public endpoint. This is separate
from the existing static 9442 RTT responder, which still has no upstream access.

Chromium PAC receives sanitized HTTPS paths, so both diagnostics use narrowly
scoped operator-host/port exceptions. The server enforces their paths and scope;
Firefox also checks the full nonce URL. Other protected requests fail closed.
Fresh RF preferences default to No/direct; explicit saved choices remain intact.
Cloudflare speed tests retain four-stream sampling and complete-byte/shared-wall-
clock calculation with their own latency endpoint. These sources are not identical.

Connect/Auto/Refresh and measurement jobs reserve before joining the mutation
queue. Reads and cancellation bypass it. Disconnect/Logout cancel queued/inflight
work and renewal; late responses cannot reinstall credentials. Startup restores
remembered login and prior VPN intent, but explicit disconnect stays off. Missing/
expired credentials block before restoration. Online/network change events and
active renewal alarms provide retry triggers; actual browser scheduling varies.
A failed restore retains a retryable login only for temporary errors. Public
state, PAC, diagnostic export and errors never include credentials/identities.

Protocol validation/recovery/native evidence and remaining release limits:
[audit](../../../docs/audits/2026-10-29-browser-fast-recovery.md).

Primary API references checked 29 October 2026:
- https://developer.chrome.com/docs/extensions/reference/api/storage
- https://developer.chrome.com/docs/extensions/reference/api/alarms
- https://developer.chrome.com/docs/extensions/reference/api/proxy
- https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/runtime/onStartup
- https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/proxy/onRequest

## Cabinet approval (0.4.7)

Email/password entry happens in the cabinet only. Extension 0.4.7 has no
password form or email-login command and rejects `/auth/email` before fetch.
The server keeps that legacy endpoint for existing 0.4.6 installations.

POST `/auth/cabinet` creates a five-minute request bound to the installation.
The QR/link contains only the public request identifier in a URL fragment.
The independent 256-bit poll secret stays in trusted extension session storage.
POST `/auth/cabinet/poll` requires the identifier, secret and installation ID.
An authenticated cabinet user must compare the displayed code and approve the
request using the separate `/cabinet/browser-login` API. Approval/consumption
are atomic in shared Redis, one-use and fail closed. Password/account identity
changes or cabinet logout before redemption invalidate the pending approval.
No cabinet JWT/cookie is handed to the extension. Normal browser session,
refresh, subscription eligibility and device accounting remain authoritative.
Popup closure retains the request; browser restart requires a new QR until
sign-in finishes. After successful sign-in normal remembered-login applies.
