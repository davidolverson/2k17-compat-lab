# Environment Audit -- Phase 0

**Audited:** 2026-10-03 00:40 EDT
**Machine:** David\David on `David`
**Method:** read-only PowerShell inspection. Nothing was modified during this audit.

Confidence tags used throughout: **FACT** (directly observed this session),
**INFERENCE** (derived from observed data), **ASSUMPTION** (not yet verified).

---

## Verdict

**Phase 1 onward cannot start.** NBA 2K17 is not installed on this machine, and
the existing probe described in the brief does not exist on this machine either.
Both are prerequisites that this session cannot satisfy on its own.

Details in `docs/live-status.md`.

---

## 1. Operating system and shell

| Item | Value | Confidence |
|---|---|---|
| OS | Microsoft Windows 11 Home | FACT |
| Version / Build | 10.0.26200 / 26200 | FACT |
| Architecture | 64-bit | FACT |
| PowerShell | 5.1.26100.9444 (Desktop edition) | FACT |
| PowerShell 7 (`pwsh`) | **NOT installed** | FACT |
| Administrator | **Yes** -- session is elevated | FACT |

Consequence of PS 5.1 only: no `&&`/`||` chaining, no ternary, no
`ConvertFrom-Json -AsHashtable`. All lab scripts are written for 5.1.

## 2. Storage

| Drive | Type | Size | Free | Label |
|---|---|---|---|---|
| C: | Fixed | 930.5 GB | **120.8 GB** | Windows |

Only one fixed drive. **FACT.**

NBA 2K17's listed install size is ~70 GB, so it fits on current free space, but
not with much margin. **INFERENCE** -- size figure is from public store data, not
measured here.

## 3. Steam

| Item | Value | Confidence |
|---|---|---|
| Install path | `C:\Program Files (x86)\Steam` | FACT |
| Library folders | **one** -- `C:\Program Files (x86)\Steam` | FACT |
| Logged-in account | `olversond` / persona `actuvas` / SteamID64 `765611997********` (masked) | FACT |
| `userdata` dir | `1795772977` | FACT |

### Installed apps (complete list, from `appmanifest_*.acf`)

| AppID | Name |
|---|---|
| 228980 | Steamworks Common Redistributables |
| 271590 | Grand Theft Auto V Legacy |
| 3240220 | Grand Theft Auto V Enhanced |

### NBA 2K17 (AppID 385760)

| Check | Result | Confidence |
|---|---|---|
| `appmanifest_385760.acf` exists | **No** | FACT |
| Directory under `steamapps\common` | **No** -- only GTA V x2, Steam Controller Configs, Steamworks Shared | FACT |
| `385760` in any `localconfig.vdf` / `sharedconfig.vdf` | **No reference at all** | FACT |
| `nba2k17` or `NBA 2K17` in `appcache\appinfo.vdf` (383 KB) | **No** | FACT |
| Partial download in `steamapps\downloading` or `depotcache` | **No** | FACT |
| Entry in any Uninstall registry hive matching `NBA|2K|Visual Concepts|Take-Two` | **None** | FACT |
| Non-Steam install dir under `Program Files`, `Program Files (x86)`, `C:\Games` | **None** | FACT |
| `Documents\2K`, `Documents\My Games`, `AppData\*\2K` | **None exist** | FACT |

**NBA 2K17 has never been installed or launched on this machine.** INFERENCE,
but from six independent negative checks including play-history config, which
would retain a reference even after uninstall.

**Ownership is UNKNOWN.** Local Steam files do not reliably record ownership for
never-installed apps, and the account's public profile games list requires login.
This is the one fact that decides whether the project can proceed at all.

(The full SteamID64 is masked in this file deliberately. The probe's own redaction
rules treat a SteamID64 as a secret, and the brief forbids committing Steam
identifiers unsanitized -- it would be inconsistent to redact it in captured
traffic and then write it into a tracked document. The unmasked value is readable
any time from `Steam\config\loginusers.vdf`.)

### Store availability

| Check | Result | Confidence |
|---|---|---|
| `store.steampowered.com/api/appdetails?appids=385760` | `success: true`, name "NBA 2K17", released Sep 20 2016, carries the notice *"NBA 2K17 online servers will shut down on 12/31/18"* | FACT |
| Purchasable on Steam today | **No** -- delisted; existing owners can still download | INFERENCE (community sources, not a transaction attempt) |

The app page still returns metadata, which is **not** the same as being for sale.
Delisted titles keep their appdetails entry.

## 4. Existing probe -- NOT FOUND

Searched `Downloads`, `Desktop`, `Documents`, user profile root, and the common
project roots (depth 3) for `*2k17*` and `*probe*`:

**Zero hits.** FACT.

`2k17-probe-windows.zip`, `2k17-probe.exe`, and `2k17-probe` are not on this
machine. No ZIP was attached to the request either.

**Therefore the three "known probe bugs" in the brief were never reviewed by this
session -- there was no code to review.** The lab's probe is written fresh, with
those three failure modes designed out from the start. That is a different and
weaker claim than "audited and repaired the existing probe", and it is recorded
here so it is not later misread as a code review that happened.

## 5. Capture and build tooling

| Tool | Status | Path |
|---|---|---|
| `pktmon` | **Available** | `C:\WINDOWS\system32\PktMon.exe` |
| `netsh` | **Available** | `C:\WINDOWS\system32\netsh.exe` |
| `git` | Available | `C:\Program Files\Git\cmd\git.exe` |
| `gh` | Available, authed as `davidolverson`, scopes `gist, read:org, repo, workflow` | `C:\Program Files\GitHub CLI\gh.exe` |
| `node` | Available | `C:\Program Files\nodejs\node.exe` |
| `python` | Available (3.10) | `...\Python310\python.exe` |
| Wireshark / `tshark` | **NOT installed** | -- |
| `openssl` | **NOT installed** | -- |
| Sysinternals Procmon | **NOT found** | -- |
| `dumpbin`, `strings` | **NOT found** | -- |

Consequences:
- Passive capture uses **`pktmon`** (built in, per-process filterable). No third-party install needed, no budget spend.
- Certificate generation uses **`New-SelfSignedCertificate`** (built in), not `openssl`. This is the better choice regardless: it returns the Windows thumbprint directly, which is exactly the identifier the exact-certificate cleanup requires.
- The probe reads a **PFX** exported from the store, so no PEM conversion tool is needed.

## 6. Network preconditions

| Check | Result | Confidence |
|---|---|---|
| TCP 443 listener | **FREE** -- no process bound | FACT |
| hosts file | `C:\WINDOWS\System32\drivers\etc\hosts` | FACT |
| hosts SHA-256 | `4E561C8EC66E8976936577D1125F04CF70A45923A5FE92FB4C3C511CDD1A6C0F` | FACT |
| hosts line count | 27 | FACT |
| hosts last write (UTC) | 2026-06-01 19:12:58 | FACT |
| hosts entries mentioning `2k` | **none** | FACT |
| `nba2k17-ws.2ksports.com` resolves | **Yes -- A 192.81.242.208** | FACT |

Two things follow.

**The hostname still has live DNS.** That IP was **not** contacted, port-scanned,
or probed, and must not be: the brief forbids touching Take-Two infrastructure
and that rule stands. Its only use here is to prove DNS resolution works today,
which matters because a hosts override has to beat a real answer, not fill a void.

**The hosts file currently has no 2K entry**, so Problem 1 from the brief (cleanup
eating a pre-existing user entry) has no live instance on this machine right now.
The guard is still implemented -- the next run might not be this clean, and a
snapshot-and-restore design costs nothing.

## 7. Certificate store baseline

Captured by `scripts/setup.ps1` immediately before any import, not here, so the
baseline is recorded in the same transaction as the change it protects. Recording
it during a read-only audit would let it go stale between audit and run.

---

## What this audit did NOT do

- Did not modify the hosts file.
- Did not create, import, or trust any certificate.
- Did not bind any port.
- Did not launch any game.
- Did not contact `192.81.242.208` or any 2K/Take-Two host.
- Did not recursively scan the whole disk (a wider profile scan was started, found nothing in the Downloads/Desktop/Documents targets already covered, and was stopped).
