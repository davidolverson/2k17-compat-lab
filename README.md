# 2k17-compat-lab

A feasibility experiment, not a server. One question:

> Can the legitimate NBA 2K17 PC client be made to talk to independently written
> replacement infrastructure, after 2K shut its services down on 2018-12-31?

**Status lives in one place: [`project-state.json`](project-state.json).** It is
the single machine-readable source of truth for the active milestone, each
acceptance condition, the current frontier and the open blockers. This README
and the documents under `docs/` do not restate status; `npm run check:state`
fails if they start to. `docs/live-status.md` is a dated record of 2026-10-03.

Contract documents: [`docs/UP_NEXT_MASTER_SPEC.md`](docs/UP_NEXT_MASTER_SPEC.md)
(product, security and evidence rules) and
[`docs/milestone-001-online.md`](docs/milestone-001-online.md) (the active
milestone). Before contributing read [`CONTRIBUTING.md`](CONTRIBUTING.md) and
[`SECURITY.md`](SECURITY.md).

```
npm test         # unit, gate and sanitizer tests
npm run check    # project state, evidence schema, forbidden artifacts
```

---

## The gate

Nothing larger gets built until this chain is observed end to end:

```
NBA2K17.exe
  -> attempts a real service interaction
  -> traffic reaches software we control
  -> we identify the real request
  -> we send a controlled response
  -> the client visibly changes behavior or moves to its next dependency
```

Success levels: **A** TCP/TLS reaches our listener. **B** our HTTP handler
receives a request (minimum viable evidence). **C** the request format is
deterministic. **D** a controlled response changes client behavior. **E** the
client advances and asks for the next service.

No databases, dashboards, progression, matchmaking, Park, VC, accounts or
production infrastructure before level D/E. That restraint is the point.

### What does not count

A `curl` reaching the probe proves nothing. Nor does a browser, nor a synthetic
client, nor our own self-test. **Only traffic attributable to the `NBA2K17.exe`
PID counts**, which is why `watch.ps1` exists and why `verify.ps1` says so out
loud every time it passes.

---

## Rules that are not negotiable

Work only against the local legitimate client, our own localhost services, public
documentation, public repositories, and passive observation of this machine.

Never: pirated copies, leaked Take-Two source or server binaries, anyone else's
private keys or credentials, probing live 2K infrastructure, brute force, DRM
defeat, anti-cheat tampering, certificate-pinning bypass, patching security
verification to force compatibility, or redistributing NBA/2K assets.

If an avenue needs a security mechanism defeated, it is marked
`BLOCKED_SECURITY_BOUNDARY`, documented with evidence, and abandoned in favour of
another legitimate path. A blocked finding is a result, not a failure.

`nba2k17-ws.2ksports.com` currently resolves to a live IP. It is never contacted.

---

## Layout

```
probe/      probe.js  -- loopback HTTPS diagnostic instrument
            responses.json -- Phase 6 response control, re-read per request
scripts/    setup / run / verify / status / cleanup / watch / export-sanitized
research/   reference-findings, service-map, baseline-network, timeline
docs/       environment-audit, live-status
captures/   raw capture files                 [gitignored]
logs/       raw probe JSONL, unredacted       [gitignored]
experiment-state/  state.json, probe-config   [gitignored]
sanitized-fixtures/  the ONLY shareable probe output
```

Key material never enters this tree. The PFX and its passphrase are written to
`%USERPROFILE%\.2k17-lab\`, outside the repo, because an exact-name `.gitignore`
rule protects nothing that merely looks like it -- a `leaf.pfx.bak-20261003`
slips past a rule written for `leaf.pfx`.

---

## Usage

Run elevated. PowerShell 5.1.

```powershell
.\scripts\setup.ps1            # snapshot, certs, trust, hosts entry  (one click: see below)
.\scripts\run.ps1              # start the probe
.\scripts\watch.ps1            # SECOND window, BEFORE launching the game
.\scripts\verify.ps1           # self-test -> PROBE_SELF_TEST_PASS
.\scripts\status.ps1           # read-only: what is true right now
.\scripts\cleanup.ps1          # undo exactly what was recorded; verifies afterward
.\scripts\export-sanitized.ps1 # produce the shareable fixture
```

`setup.ps1` defaults to `-TrustScope CurrentUser`, the narrowest option. Windows
**always** shows a "Security Warning" consent dialog for a user root store, even
elevated and non-interactive, and that dialog is deliberately not suppressed:
trusting a CA is the machine owner's call. The script will block until answered,
and declining is a valid answer. Use `-TrustScope LocalMachine` for unattended
runs, where elevation is the authorization. Either way the CA is removed by exact
thumbprint at cleanup, and cleanup verifies removal.

### Safety properties, each verified against a planted control

- Cleanup removes **only** its own marker-delimited hosts block. Proven by
  planting a decoy pre-existing user entry for the same hostname and confirming
  it survived.
- Cleanup removes **only** the exact certificate it created, matched by
  thumbprint *and* SHA-256. Proven by planting a CA with a byte-identical subject
  and confirming it was left alone.
- hosts is restored **byte-exactly**, including its UTF-8 BOM.
- Cleanup is idempotent, and reports `CLEANUP_INCOMPLETE` with reasons rather
  than claiming success it cannot verify.
- A check that cannot inspect its target **fails**. It never reports clean.
