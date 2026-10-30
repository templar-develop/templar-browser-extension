# Separate GitHub account and first publication

The owner requested a new GitHub account with public display name **Templar**.
The new account `templar-develop` was created and its email verified on
30 October 2026. Its public display name is Templar. Email privacy and blocking
pushes that expose the private email are enabled. Its verified GitHub commit
address is `350194269+templar-develop@users.noreply.github.com`.
The extension/store publication pause still applies.

Create the account at https://github.com/signup using an email address controlled
for the project. Enter its password and email verification directly on GitHub,
not in an issue, source file, terminal log or chat. Enable two-factor
authentication and store recovery codes privately. Do not reuse a personal
profile photo, biography, public email or personal social links.

In GitHub Settings → Emails, enable **Keep my email addresses private** and
**Block command line pushes that expose my email**. Copy the exact GitHub
`ID+LOGIN@users.noreply.github.com` address displayed for the new account.

Start from the reviewed standalone source export in a new empty directory.
Do not fork, mirror, push or change the visibility of the existing service
repository: its Git history and author metadata are not part of this export.
Do not import the current Git configuration or personal signing key.

When account creation is complete, configure identity only in that new checkout:

```sh
git init -b main
git config --local user.name Templar
git config --local user.email 'ID+LOGIN@users.noreply.github.com'
git config --local commit.gpgsign false
git config --local tag.gpgsign false
```

Replace the example noreply value with the exact new-account value before any
commit. Also check environment overrides and the final author/committer with
`git var GIT_AUTHOR_IDENT` and `git var GIT_COMMITTER_IDENT`. Do not change global
Git identity for other projects. Authenticate the new repository using only the
new account, and review the exact remote owner before pushing.

Review the complete source manifest, LICENSE and staged diff, create a fresh
initial commit and inspect its author/committer metadata. Link the eventual
public repo and version tags from the extension release materials only after
the actual public URL is known. Do not invent a GitHub URL or mark the source
as published while it is only a local ZIP.

The existing About screen has a source-code link slot. Once the repository is
public and verified, set `repository.url` in package.json to its HTTPS GitHub
URL and rebuild. Until then the link is hidden; the account profile is not a
substitute for the source repository.

This separates public project identity from personal commit metadata. It cannot
guarantee anonymity from GitHub itself or prevent correlation with information
already published elsewhere. Existing required third-party attribution stays.

References:

- https://docs.github.com/en/account-and-profile/how-tos/email-preferences/setting-your-commit-email-address
- https://docs.github.com/en/account-and-profile/how-tos/email-preferences/blocking-command-line-pushes-that-expose-your-personal-email-address
