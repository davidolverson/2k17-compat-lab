# Live capture checklist

Short on purpose. Follow it during the test; write the real clock time in the right
column as each thing happens. Those timestamps are the only thing that lets a
packet capture be matched to a UI event afterwards.

**Use UTC or note your offset.** Mixing local and UTC across a capture is how two
hours of evidence becomes unreadable.

---

## Setup (before anything else)

| | Done |
|---|---|
| Running inside the **disposable VM**, not the host | ☐ |
| No host drive mapped, no shared clipboard, no credentials in the VM | ☐ |
| VM snapshot taken (so it can be rolled back) | ☐ |
| Observer kit copied in | ☐ |
| Launcher's own hash recorded **before running it** | ☐ |

```powershell
Get-FileHash .\<launcher>.exe -Algorithm SHA256
Get-AuthenticodeSignature .\<launcher>.exe | Format-List Status, SignerCertificate
```

```powershell
.\BEFORE.ps1 -RunId b2b-01 -GamePath "<game dir>"
.\scripts\capture.ps1 -Action start
.\scripts\watch.ps1 -ProcessName NBA2K17        # second window
```

---

## Event log — fill this in as it happens

| Event | Time | Notes |
|---|---|---|
| LAUNCHER OPENED | | |
| LOGIN ATTEMPT | | account created, or existing? |
| LOGIN RESULT | | success / failure / error text |
| GAME LAUNCHED | | did the launcher start it, or Steam? |
| MAIN MENU | | |
| MYCAREER OPENED | | |
| PARK REQUESTED | | the moment you selected Park |
| PARK ENTERED | | world actually loaded |
| PLAYER MOVEMENT | | first input that moved the avatar |
| GAME STARTED | | first actual match |
| GAME ENDED | | |
| CLIENT CLOSED | | |

Also note anything unexpected, verbatim: error dialogs, a Steam prompt, a UAC
prompt, a certificate warning, a "verifying files" step. **An error message is
evidence.** Copy the exact text — paraphrased errors are nearly useless later.

---

## Teardown

```powershell
.\scripts\capture.ps1 -Action stop
# close launcher AND game first, or locked files leave gaps in the diff
.\AFTER.ps1   -RunId b2b-01 -GamePath "<game dir>"
.\COMPARE.ps1 -RunId b2b-01
```

---

## The questions this run should answer

Write the answer and the evidence line next to each. `UNKNOWN` is an acceptable
answer; a guess is not.

| Question | Answer | Evidence |
|---|---|---|
| Was `NBA2K17.exe` modified? | | `executable` section of the diff |
| Was a DLL or helper added to the game dir? | | `files` section |
| Was hosts modified? | | `hosts` section |
| Was a certificate installed? | | `certificates`, by thumbprint |
| Did it spawn helper processes? | | `processes`, with paths |
| Which hostnames did the **game** contact? | | watcher, attributed to the game PID |
| Which did the **launcher** contact? | | watcher, attributed to the launcher |
| Web API and world/Park on different hosts? | | compare destinations per phase |
| TCP, UDP, or both for Park? | | pktmon capture |
| Did it need Steam running? | | did a Steam prompt appear |

---

## Stop conditions

Stop and record, rather than working around:

- **Download contains the full game** → `UNAUTHORIZED_GAME_PAYLOAD_PRESENT`. Do not acquire it.
- **A security control blocks the client** (pinning, signature check) → `BLOCKED_SECURITY_BOUNDARY`. Do not defeat it.
- **It asks for credentials you'd reuse elsewhere** → stop. Use nothing real in a VM running an unsigned binary.

---

## One thing to hold in mind

Back2Back's own public page states the requirement as:

> "A Windows PC, a Steam account and your own legal copy of NBA 2K17."

That is the project's **own** statement, and it contradicts the community claim
that a Preserve build is required and a Steam install does not work. So treat the
Preserve requirement as **unproven**, and let this capture decide it. If the
launcher accepts a Steam install, that single fact reshapes the whole roadmap —
and it means our approach and theirs want the same thing: a licensed client.
