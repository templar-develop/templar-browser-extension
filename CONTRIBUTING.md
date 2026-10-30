# Contributing

Use Node.js 20+, npm 8+ and Python 3. Install the locked dependencies with `npm ci`,
then run `npm test`. See [VERIFYING.md](VERIFYING.md) for the release build.

Describe the observable problem, resulting behavior and relevant validation.
Keep fixes scoped. Never include real accounts, subscription URLs, tokens, logs
from personal browsers, signing keys or server configuration in a contribution.
The tests use synthetic local values; these do not grant service access.

New original contributions must be compatible with GPL-3.0-only. Preserve
third-party attribution and license files. Do not submit code copied from a
project whose license does not permit its inclusion here.

For private security findings use [SECURITY.md](SECURITY.md). Public issues are
for bugs that do not expose credentials or private information.

Fixture builds are separate from production builds. Keep fail-closed expiry,
revocation and cancellation behavior, explicit Disconnect, exact proxy challenge
binding, bounded API responses and secret-free diagnostics. Changes to these
boundaries need meaningful regression checks.
