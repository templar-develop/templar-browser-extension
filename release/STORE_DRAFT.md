# Local store materials — draft only

The owner paused publication on 29 October 2026. Do not submit, sign, upload or
deploy this kit. No developer AMO account is available yet. A release-channel
directory is a local candidate, not evidence of publication or approval.

## Russian listing

Name: Templar VPN

Short description: Ваша подписка Templar VPN в браузере: выбор локации,
автоподключение и правила сайтов.

Подключайте этот браузер через действующую подписку Templar VPN. Входите по
подписочной ссылке, через личный кабинет или Telegram. Выбирайте локацию вручную
либо используйте автовыбор. Настраивайте правила сайтов и подключение российских
сервисов, проверяйте задержку до сайта через VPN и скорость через VPN. Отзывной локальный
ключ позволяет сохранять вход после перезапуска. Отключение VPN и выход из
аккаунта — отдельные действия. Нужна активная подписка. Другие приложения и
приватные окна не подключаются. Диагностика остаётся на компьютере, пока вы
сами её не скопируете. Скорость зависит от сети и выбранной локации.

## English listing

Name: Templar VPN

Short description: Use your Templar VPN subscription in your browser, with
location selection, Auto and site rules.

Route selected browser traffic through your Templar VPN subscription. Sign in
with your subscription link, account or Telegram. Choose a location or use
Auto, manage site rules and test HTTPS site latency through VPN or throughput. A locally
stored, revocable key can restore sign-in after restart. Requires an active
subscription. Other apps and private windows are outside this extension's
scope. Diagnostics stay local unless you share them.

## Permission justification

| Permission | Required behavior |
| --- | --- |
| proxy | Apply the user's browser routing choice and block protected requests when the lease expires. |
| storage | Save preferences, installation identity, connection intent and a scoped refresh key. Short access/proxy credentials stay in session storage. |
| alarms | Renew active leases and poll a user-started Telegram challenge after popup closure. |
| privacy | Prevent unproxied WebRTC UDP and disable network prediction while VPN is active. Restore settings owned by the extension on disconnect. |
| webRequest, webRequestAuthProvider (Chromium) | Answer authentication challenges only from the exact current proxy host/port; refuse website challenges and expired credentials. |
| all URLs | Route arbitrary user-selected websites, receive the required proxy auth events and discover gateway hosts dynamically. No content scripts, history API, remote code or page scraping. |

Firefox's required data categories are authenticationInfo,
personallyIdentifyingInfo, browsingActivity and websiteContent. Account sign-in
uses user-supplied credentials and installation identity. Proxy transmission
necessarily handles destination addresses and unencrypted HTTP traffic; HTTPS
content stays encrypted end to end. Ping checks a fixed Google HTTPS endpoint through the regional gateways; the
user-started speed test contacts Cloudflare. There is no optional analytics.

## Before a future authorized submission

Publish a stable HTTPS privacy-policy URL on an owned site after review; the
bundled privacy.html is available locally but is not a public store-policy URL.
Review the store privacy questionnaire against actual service retention and
subprocessors rather than treating this extension page as a service-wide legal
policy. Supply reviewer access through a private store channel with an owned
non-customer account; never put credentials in this source kit or listing.
Capture current RU/EN screenshots and review each store's image requirements.

Firefox source: source ZIP, npm ci, then the explicit release build command in
README.md. No transpilation or remote runtime is used; DOMPurify is copied
unchanged from its locked npm package. The included lint script reports one
reviewed vendor warning rather than concealing it. AMO remains the authority for
review/signing. No signing secrets or automatic signing command are included.

The pilot and future release use different Firefox IDs. Moving from the
development ID to the release ID is a new installation and requires sign-in;
do not promise migration of saved keys. An unsigned XPI is temporary-only in
ordinary release Firefox. Safari needs a separate implementation/distribution
stage; Windows/Linux, mobile and private-window behavior are not covered by the
macOS native checks.
