# Publishing Templar VPN in extension stores

[Русский — основной](PUBLISHING.md) · **English** · [Back to the project](../README.en.md)

Checked against official store documentation on **30 October 2026**. There are
no published Templar VPN listings yet. The README's “Soon” buttons link here.
Source publication does not authorize store submission: uploads, signing and
store release remain paused pending the owner's separate decision.

## Current preparation

| Material | Status |
| --- | --- |
| Public source | Standalone GitHub history, GPL-3.0-only |
| Documentation | Russian primary README and separate English version |
| Packages | Local Chrome ZIP and unsigned Firefox ZIP/XPI candidates |
| Validation | 105 JS tests; builds and Firefox lint with one reviewed DOMPurify warning |
| Listing copy and permissions | RU/EN drafts in [STORE_DRAFT.md](STORE_DRAFT.md) |
| Privacy information | Bundled [privacy.html](../privacy.html); the public store-policy URL still needs confirmation |
| Store accounts | Chrome developer registration is unconfirmed; an AMO account has not been prepared |

## Chrome Web Store

1. Prepare a project Google account with two-step verification, register a
   developer and accept the store terms. A one-time registration fee applies;
   Google currently documents **USD 5**. Confirm the final amount and payment
   availability during registration.
   [Registration](https://developer.chrome.com/docs/webstore/register),
   [fee](https://developer.chrome.com/blog/cws-role-expansion-developer-dashboard),
   [two-step verification](https://developer.chrome.com/docs/webstore/using-api).
2. Set the publisher name to **Templar** and verify the contact email. Google
   requires a physical address for items offering purchases or subscriptions.
   Check required profile fields and their public visibility before registering;
   a separate GitHub account does not remove publisher requirements.
   [Account setup](https://developer.chrome.com/docs/webstore/set-up-account).
3. Prepare Russian listing copy and an English translation, clearly stating
   the browser-only purpose and active subscription requirement. Supply a
   128×128 PNG icon and at least one current screenshot; check final formats
   against the [image requirements](https://developer.chrome.com/docs/webstore/images).
4. Complete Privacy practices, justify each permission and disclose actual
   data transmission with a public HTTPS privacy-policy URL. Include proxy,
   privacy, storage, alarms, all-URL and Chromium webRequest permissions.
   [Privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy).
5. Once submission is authorized, upload the **Chrome release ZIP**, complete
   Store listing, Privacy, Distribution and private Test instructions. Provide
   a dedicated reviewer subscription, submit for review and choose deferred
   publication if needed. Approval and review duration are not guaranteed.
   [Publishing workflow](https://developer.chrome.com/docs/webstore/publish).

## Firefox Add-ons

1. Connect a Mozilla Account to AMO Developer Hub, enable developer-required
   two-factor authentication and keep recovery codes private. Review the
   Developer Agreement and Add-on Policies.
   [Submission](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/),
   [2FA](https://blog.mozilla.org/addons/2021/03/11/two-factor-authentication-required-for-extension-developers/).
2. Select **On this site** for a store listing. Use the Firefox release ZIP/XPI
   with the permanent ID `templar-browser@templarvpn.com`, not the development
   ID. Supply Russian primary copy, English localization, support, GPL-3.0-only,
   privacy information and the paid-service requirement. Put reviewer access in
   private Notes for Reviewers.
3. Recheck `data_collection_permissions`. Built-in data consent is mandatory
   for new add-ons. Our manifest declares `authenticationInfo`,
   `personallyIdentifyingInfo`, `browsingActivity` and `websiteContent`; verify
   these against actual account and proxy transmission.
   [Firefox consent](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/).
4. Attach the matching **source ZIP**, lockfile, tool versions and exact build
   commands to the version. Our custom builder generates popup/configuration
   files. Explain the unchanged DOMPurify library and its reviewed linter warning.
   [Source requirements](https://extensionworkshop.com/documentation/publish/source-code-submission/).
5. Complete AMO validation/review and obtain a signed file. Test permanent
   installation and a full restart in ordinary Firefox. Temporary unsigned
   installation does not cover that check. Mozilla controls signing/review;
   signing is not a guarantee that all vulnerabilities have been found.
   [Firefox signing](https://support.mozilla.org/en-US/kb/add-on-signing-in-firefox).

## Remaining Templar work

- [ ] Confirm both publisher accounts, contact details and two-factor protection.
- [ ] Publish a stable project-domain HTTPS privacy policy and verify it against
  actual retention, deletion and subprocessors. Do not claim “no transmission”:
  account and proxy traffic are transmitted; measurements use Google/Cloudflare.
  A bundled HTML file is not a public store-policy URL.
- [ ] Capture final RU/EN sign-in, connected, locations and settings screenshots;
  check permission explanations and only claim platforms actually tested.
- [ ] Prepare a dedicated reviewer subscription. Share access only in private
  store fields and revoke it afterwards; never include it in public source,
  screenshots or listings.
- [ ] Select a final version/commit, build matching packages and retain SHA256.
  Increment versions for updates and preserve each store's extension identity.
- [ ] Complete remaining signed-Firefox restart, OS sleep/wake, network handover,
  long-duration operation and claimed-platform checks.
- [ ] Obtain the owner's decision to submit/sign and complete store procedures.
- [ ] Replace both README and website placeholders with the exact live listing
  URLs after the listings exist.

## Local package preparation

From a clean checkout of the chosen version, using Node.js 20+, npm 8+ and Python 3:

```sh
npm ci
npm test
npm run release:prepare
```

The local `artifacts/release/` directory contains the Chrome release ZIP,
unsigned Firefox release ZIP/XPI, matching source ZIP and `SHA256SUMS`. Current
filenames use `0.4.5`; the builder updates them when the version changes.
Nothing is uploaded or signed by this command. See [VERIFYING.md](../VERIFYING.md)
for comparison details. Store tokens, private keys, passwords and recovery codes
must stay outside the repository.
