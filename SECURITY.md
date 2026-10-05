# Security policy

## Scope

This repository holds compatibility research: sanitized fixtures, evidence
ledgers and the tools that produce and check them. It contains no service, no
game files and no credentials, and it must stay that way.

## Reporting a vulnerability or a leak

Use GitHub's private vulnerability reporting for this repository (Security tab,
"Report a vulnerability"). Do not open a public issue for:

- a private value that reached the repository or its history (an account or
  platform identifier, a session key, a token, key material, a raw capture);
- a way to make the sanitizer, the evidence validator or the forbidden-artifact
  check pass while a private value is present;
- a weakness in the relay or protocol tooling that could be abused against a
  running service.

Include the file, commit and line. Do not paste the leaked value itself into
the report; say where it is.

If the report concerns a leaked value, treat it as already public: the first
step is revoking or rotating whatever it grants, not removing the commit.

## What will never be accepted here

These are boundaries, not preferences. A change that needs any of them is
closed, whatever it would unblock:

- commercial game binaries or assets, or tooling that fetches them;
- licence, ownership or DRM circumvention, including replaced platform
  libraries and ownership emulation;
- anti-cheat, certificate-pinning or security-verification bypass;
- leaked or decompiled proprietary source, server binaries or vendor keys;
- probing or contacting live vendor infrastructure;
- raw captures, private keys, certificates or credentials.

A path that is blocked by one of these is recorded as blocked, with evidence,
and left alone. See `docs/UP_NEXT_MASTER_SPEC.md` sections 2 and 29.

## Automated checks

`npm run check` runs on every pull request:

- `check:forbidden` scans every publishable file for forbidden artifact types,
  key material, platform identifiers, session keys, tokens, personal paths and
  a hashed list of private terms;
- `check:evidence` validates every evidence document and fixture against its
  schema and refuses fingerprints of raw data;
- `check:state` keeps status in one file.

The checks fail closed. A file that cannot be read, a document of an unknown
kind and an empty scan are all failures. The checks reduce accidents; they do
not replace reading a diff before it is pushed.

## Supported versions

There are no releases. Only the default branch and open pull requests are in
scope.
