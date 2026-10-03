# Reference Findings

Read-only research notes on public projects. **Nothing here is evidence about
NBA 2K17's actual protocol.** Every row is tagged:

- **ARCHITECTURAL IDEA** -- a design pattern we might borrow. Says nothing about 2K17.
- **CONFIRMED 2K17 BEHAVIOR** -- observed from our own client, on this machine, with a log reference.
- **HISTORICAL CLAIM** -- someone else said it, about some build, at some time. Unverified here.

As of 2026-10-03 the **CONFIRMED 2K17 BEHAVIOR** section is empty, because the
client has never run on this machine. No row may be promoted into it without a
log record in `logs/` or `sanitized-fixtures/`.

---

## CONFIRMED 2K17 BEHAVIOR

| # | Behavior | Evidence (log record / fixture) | Date |
|---|---|---|---|
| -- | *(none yet)* | -- | -- |

---

## HISTORICAL CLAIMS (unverified on our build)

| # | Claim | Source | Status |
|---|---|---|---|
| H1 | A researcher reported the **PC** version of NBA 2K17 connected to a replacement API after trusting their own CA. Their unsolved problem was moving the same trick to PS4, not PC. | r/cryptography thread (2023) | **This is the single strongest feasibility signal we have.** Still unverified on our build. |
| H2 | It was unclear in the same researcher's follow-up whether the original service used mTLS, certificate pinning, or plain server-auth TLS. | Reverse Engineering Stack Exchange Q.32011 | **Open question.** `probe.js` logs `tls.clientError` and `clientCertPresented` precisely to settle this empirically rather than inherit the uncertainty. |
| H3 | `nba2k17-ws.2ksports.com` was the service hostname. | the brief; community posts | Hostname **does still resolve** (A `192.81.242.208`, checked 2026-10-03). Resolution is not confirmation that *our* build uses it. Treat as a lead; Phase 1 baseline decides. |
| H4 | NBA 2K17 online servers shut down 2018-12-31. | **Verified** -- Steam's own appdetails payload for 385760 carries that notice. | FACT about the announcement. |
| H5 | Revival's paid tier is explicitly **not** a purchase of the games, and users "play on your own copy". | revivalclient.net | **Relevant as a boundary, not a method.** It means a working Revival-style service does not solve client acquisition; each user still needs a legitimate copy. It also implies some users obtain clients another way. |
| H6 | Granite's 2K19 launcher handles `steam_emu.ini`, implying a Steam-emulation/ownership-bypass client exists in that scene. | community observation | **DEAD END BY POLICY, recorded so nobody re-derives it.** A Steam ownership bypass is exactly what this lab will not do. Not investigated, not downloaded, not reproduced. Noted only so the absence is a decision rather than an oversight. |
| H7 | SteamDB marks 385760 Family Sharing eligible, so a household member's copy could suffice. | SteamDB | **Sound in principle, inapplicable here.** Checked 2026-10-03: this machine has NO Steam Family configured -- zero `AuthorizedDevice` / `FamilyGroup` / `SharedLicense` markers -- so there is no family copy to borrow. Eligibility is a property of the app, not evidence that a sharer exists. |

### A caution about H1/H3

H1 is the reason this experiment is worth running at all, and it is also the
easiest thing to over-read. It is one person's report about one build, relayed
second-hand. If our Phase 1 baseline shows the client reaching a different
hostname, H3 is simply wrong for our build and no amount of prior research
changes that. The baseline outranks the literature.

---

## Reference projects

### 1. `THEKINGPATUBOY14/NBA-2k17-Private-Server`

**Do not fork. Do not use as a foundation.** Its own README states it is not
ready. Value is historical only: it may reveal which endpoint names someone once
believed mattered. Any name found there is a **HYPOTHESIS to test**, never a
schema to implement.

### 2. `evolve-revival/evolve-server`

Different 2K-family title. Useful as an **ARCHITECTURAL IDEA** source only:

| Concept | Idea we may reuse | Why it is NOT a 2K17 fact |
|---|---|---|
| Doorman / service discovery | A client may fetch a service list before doing real work, so the first request is often discovery, not gameplay | Different game, different era, different stack |
| SSO / session issuance | Expect an auth or session step to gate later calls | We have not seen 2K17 ask for one |
| Entitlements | Expect a store/ownership check somewhere in the boot path | Speculative for 2K17 |
| Storage service | Player blobs may be fetched/stored opaquely | Speculative for 2K17 |
| Peer coordination | Gameplay networking is likely separate from the web service | Speculative for 2K17 |
| RPC envelopes | Payloads may be wrapped rather than bare JSON | **Especially** not assumable -- `probe.js` therefore logs bodies as base64 when they are not text, instead of assuming JSON |

### 3. `evolve-revival/evolve-launcher`

**ARCHITECTURAL IDEA:** presenting replacement services to a game locally. We use
a hosts-file override plus a loopback listener, which is the least invasive
version of that idea and needs no game patching.

**Explicitly not borrowed:** any game-specific binary patch. The brief forbids
patching security verification to force compatibility, and that rule is not
negotiable even if a patch would be convenient.

---

## Licence posture

Nothing has been copied from any of the three repositories. If that changes, the
licence must be checked and recorded here **before** the copy, with the specific
file and the specific justification. "It was on GitHub" is not a licence.

---

## Comparison gate

Per the brief, searching those repos for matching endpoint names, JSON field
names and service names happens **only after** we hold a real 2K17 request.
Doing it earlier produces confident fiction: we would find plausible names and
have no way to tell a match from a coincidence.

Current status: **gate closed** -- no real request observed.
