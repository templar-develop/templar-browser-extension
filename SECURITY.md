# Reporting security issues

Report vulnerabilities privately to **support@templarvpn.com**, with the subject
`Extension security report`. Include the extension version, browser, impact and
minimal reproduction using an account you own. A coordinated fix is preferable
to posting working credentials or exploit details in a public issue.

Never send passwords, live subscription links, account/proxy/refresh tokens,
private keys or a full browser-profile directory. The extension's About page
provides a deliberately restricted diagnostic report you can review and share.

Please keep testing bounded and use your own accounts. Do not disrupt other
customers, attempt payments with others' data, or scan third-party/internal
systems. This document does not grant permission to attack other systems.
There is no promised bounty, response deadline or claim of complete security.

## What this source lets you inspect

The popup, browser proxy policy, API client, storage, authentication recovery,
measurements and local build/test tools are included. Runtime code is bundled
locally; the extension does not download executable application code. The sole
bundled npm library is locked DOMPurify.

The separate Templar API, gateway deployment and service operations are outside
this source distribution. Open client code does not independently prove server
behavior, retention practices or the absence of vulnerabilities. This extension
protects supported browser traffic; it is not a system-wide device VPN.

## Verify a package

Follow [VERIFYING.md](VERIFYING.md) to build the exact source and compare unsigned
Chrome/Firefox packages. A checksum published beside a binary checks integrity;
without comparing a source build it does not prove what source produced it.
