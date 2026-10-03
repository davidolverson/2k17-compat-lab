# Black-box launcher observation procedure

*Written 2026-10-03. Tooling implemented and control-tested; see "Controls run".*

Procedure for observing **any** third-party 2K17 launcher as a black box and
answering, by measurement, what it does to a machine and where it sends traffic.

---

## ⛔ Two blockers before this can be run at all

**1. There is no client on this machine.** NBA 2K17 is not installed, not
licensed, and delisted. Every step below needs a game directory to snapshot. As of
now `-GamePath` has nothing to point at.

**2. The launcher reportedly will not work with a Steam install anyway.** The
teardown doc records community reports that Revival required a Preserve-installed
build and that the ordinary Steam install did not work. If that also holds for
Back2Back, then even a lawfully purchased copy would not run their launcher, and
this observation produces nothing.

So this procedure is **ready but not runnable**. It is written now so that the
tooling exists and is proven before any opportunity appears — not as a plan for
tomorrow.

## ⚠️ And if it ever is runnable: NOT ON THIS MACHINE

This is a practical warning, separate from any legal question.

This workstation holds live production access for several clients, a self-hosted
CI runner, bank 2FA material, and a long list of service tokens. Threat-intel
indexing of the *Revival* launcher carried a Trojan heuristic classification — not
proof of anything, but it is an unsigned binary from a scene a rightsholder is
actively enforcing against.

Running an unknown launcher here puts all of that in its blast radius. If this
observation ever happens it belongs in a **disposable VM**: no host drive mapping,
no shared clipboard, no saved credentials, snapshot taken beforehand, destroyed
afterwards. The snapshot/compare tooling runs happily inside a VM.

I will not run an unsigned third-party launcher on this host, and I would push
back on doing it even if the client problem were solved.

---

## What the tooling answers

| Question | Answered by |
|---|---|
| Does it modify `NBA2K17.exe`? | `executable` section — SHA-256 + size + PE timestamp + Authenticode |
| Which game files were added / changed / removed? | `files` section — per-file SHA-256 under the hash cap |
| Does it edit the hosts file? | `hosts` section — file hash plus added/removed active entries |
| Does it install a CA? | `certificates` section — by **thumbprint**, across 5 stores |
| Does it write registry keys? | `registry` section — subkey names, one level, under 6 roots |
| Does it spawn helpers? | `processes` section — new identities with path + parent PID |
| Where does traffic go? | `destinations` section + `watch.ps1` + `capture.ps1` (pktmon) |

Note the Authenticode signal: in the control run, appending four bytes to a signed
executable flipped it from `sig=Valid` to `sig=NotSigned`. That is a second
independent tell that a binary was patched, on top of the hash change.

---

## Procedure

### 0. Prepare (in the VM)

```powershell
cd <repo>
git checkout research/revival-back2back-teardown
```

Record the launcher's own fingerprint before running it — the installer is as much
an artifact as the game:

```powershell
Get-FileHash .\launcher.exe -Algorithm SHA256
Get-FileHash .\launcher.exe -Algorithm MD5
Get-AuthenticodeSignature .\launcher.exe | Format-List Status, SignerCertificate
```

### 1. BEFORE snapshot

```powershell
.\scripts\snapshot-client-state.ps1 -Phase before -RunId b2b-01 -GamePath "<game dir>"
```

Read-only. Writes only to `captures\b2b-01\before\`.

If any file in that directory is missing afterwards, **stop**. `compare` refuses
to run on an incomplete baseline, by design: a diff against a partial `before`
reports "unchanged" for everything that was never recorded, which is a confident
false negative.

### 2. Start the live observers

Two separate windows, **before** the launcher runs:

```powershell
.\scripts\capture.ps1 -Action start          # pktmon, packet-level, catches short-lived connections
.\scripts\watch.ps1 -ProcessName NBA2K17     # or the launcher's process name
```

Both matter. The socket table in a snapshot is point-in-time and misses anything
that opens and closes between captures; pktmon does not.

### 3. Run the launcher. Note the wall-clock time of each step.

Timestamps are what let packet captures be correlated with in-game actions later:

```
HH:MM:SS  launcher started
HH:MM:SS  logged in
HH:MM:SS  pressed Play
HH:MM:SS  game window appeared
HH:MM:SS  reached main menu
HH:MM:SS  entered Park
HH:MM:SS  exited
```

### 4. AFTER snapshot

Close the game and launcher first, so file handles are released.

```powershell
.\scripts\capture.ps1 -Action stop
.\scripts\snapshot-client-state.ps1 -Phase after -RunId b2b-01 -GamePath "<game dir>"
```

### 5. Compare

```powershell
.\scripts\compare-client-state.ps1 -RunId b2b-01
```

Writes `captures\b2b-01\comparison.json` and prints a per-section verdict.

### 6. Record observations as evidence, not conclusions

Every hostname, IP and port goes into `research/service-map.md` using the schema
below, tagged with a confidence level. **Nothing observed from a third-party
launcher is a protocol fact about NBA 2K17** — it is a fact about what that
launcher did, which is a different claim.

---

## Service-map record format

```json
{
  "hostname": "",
  "remoteAddress": "",
  "remotePort": 443,
  "protocol": "tcp|udp",
  "addressFamily": "IPv4|IPv6",
  "pid": 0,
  "processName": "",
  "processPath": "",
  "parentPid": 0,
  "firstSeenUtc": "",
  "lastSeenUtc": "",
  "role": "web-api|world|park|matchmaking|cdn|telemetry|unknown",
  "attribution": "game-install-root|launcher|external-helper|unresolved",
  "confidence": "VERIFIED_CLIENT_CAPTURE|VERIFIED_PUBLIC_SOURCE|COMMUNITY_REPORT|INFERENCE|UNKNOWN",
  "notes": ""
}
```

Rules that keep this honest:

- `attribution: unresolved` can never support a claim about who contacted a host.
- `role` starts at `unknown`. A port being 443 does not make something a web API.
- A hostname seen only in a blocklist, a forum post or a disassembly is
  `COMMUNITY_REPORT` or `INFERENCE` — never `VERIFIED_CLIENT_CAPTURE`.
- `processPath` is required for any `game-install-root` attribution, because a
  process *name* is not an identity. A binary named `NBA2K17.exe` in a temp folder
  satisfied an earlier version of our Level B check; the path is what caught it.

---

## Cleanup after any observation

If the launcher changed hosts or installed a certificate, those are **its**
changes, not the lab's, so `cleanup.ps1` will not remove them — it only reverts
what `setup.ps1` recorded. Use the `comparison.json` added-items list to revert by
exact thumbprint and exact hosts line. In a disposable VM, destroying the VM is
the cleaner answer.

---

## Controls run against this tooling

Verified by planting known changes and confirming each was detected, rather than
assuming the diff works:

| Planted | Detected |
|---|---|
| Appended 4 bytes to the "game" exe | `executable` CHANGED, SHA-256 differs, `sig=Valid -> NotSigned` |
| Dropped `Module.dll` into the game dir | `files` `+ Module.dll` |
| Edited `Data\config.ini` | `files` `~ Data\config.ini` |
| Added a hosts entry | `hosts` MODIFIED, `+ 127.0.0.1 ctl-test.example.invalid` |
| Added a certificate | `certificates` CHANGED, caught in **both** `My` and `CA` by thumbprint |

Negative controls equally important — in a second run where hosts, certificates
and processes were **not** touched, all three correctly reported `unchanged`. A
detector that always fires is as useless as one that never does.

Two defects found and fixed during those controls:

1. **Process enumeration had a race.** Using `Get-Process` and then a separate
   `Get-CimInstance Win32_Process` for parent PIDs meant short-lived processes
   present in the first pass had exited by the second, landing in the snapshot with
   a null `parentPid` — 33 of 750 rows. Replaced with a single `Win32_Process`
   query: now 740 of 740.
2. **`pid 0` destinations were reported as new network activity.** Those are
   ownerless TIME_WAIT leftovers that cannot be attributed to any process; they are
   now counted separately and excluded from the attributed list, because noise that
   looks like evidence is worse than no evidence.

Command lines are deliberately **not** captured. They routinely carry tokens and
passwords, and a snapshot of this machine is not a place to put those.
