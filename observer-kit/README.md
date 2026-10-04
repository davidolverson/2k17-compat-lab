# Observer kit — portable, read-only

Copy this whole folder to the disposable VM. It contains **only** observation
tooling. Nothing in here modifies hosts, certificates, game files, launcher files,
network routing, or the registry.

Build it with:

```powershell
.\scripts\package-observer-kit.ps1 -Destination <path>
```

## Use

```powershell
.\BEFORE.ps1  -RunId b2b-01 -GamePath "<game dir, or omit if none yet>"
#   ... run the launcher / do the test ...
.\AFTER.ps1   -RunId b2b-01 -GamePath "<same path>"
.\COMPARE.ps1 -RunId b2b-01
```

Output lands in `captures\<RunId>\{before,after}\` plus `comparison.json`.

## What it will and will not tell you

**Will:** whether an executable changed (SHA-256, PE timestamp, Authenticode),
which files were added/removed/changed, hosts edits, certificates added/removed by
thumbprint, registry subkey deltas, new processes with paths and parent PIDs, and
new attributed network destinations.

**Will not:** decrypt TLS, see inside a packed binary, catch a connection that
opened and closed between the two snapshots, or see a registry *value* change
(only subkey names, one level). Run `capture.ps1 -Action start` and `watch.ps1`
alongside for the live network picture — the snapshot socket table is
point-in-time and **absence in it is not evidence of absence**.

## Non-negotiables

- If a download turns out to contain the full copyrighted game, **stop** and record
  `UNAUTHORIZED_GAME_PAYLOAD_PRESENT`. Do not acquire it.
- Do not run an unsigned third-party launcher on a host that has credentials,
  tokens, SSH keys, browser passwords or production access on it. That is what the
  disposable VM is for.
- Observation only. If you find yourself about to change something to make a test
  work, stop and write down what blocked you instead.
