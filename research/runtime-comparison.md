# Runtime Comparison: Granite (2K19) vs our lab (2K17)

Documented from the **public** repository only, 2026-10-03. Nothing was built, run,
downloaded beyond public source viewing, or copied.

| | |
|---|---|
| Repo | `ztpd/Granite` |
| HEAD read | `20c3d875907498eb9e3780553a45f3c451885777` (pushed 2026-10-02, active) |
| Language | JavaScript (servers) + C++ (native components) |
| Stars | 2 |

---

## Licence: PolyForm Noncommercial 1.0.0 — and this project is noncommercial

**PolyForm Noncommercial License 1.0.0.** Required Notice: `Copyright (c) 2026 Celestial`.

**David confirmed 2026-10-03: this project is not for money.** That is a project
decision, recorded here because the entire licence analysis turns on it.

The operative clause:

> **Personal Uses** — Personal use for research, experiment, and testing for the
> benefit of public knowledge, personal study, private entertainment, **hobby
> projects**, amateur pursuits... **without any anticipated commercial
> application**, is use for a permitted purpose.

So as a noncommercial hobby project, the grant applies, and PolyForm is generous
within it: the Copyright License, the **Changes and New Works License** and the
**Distribution License** all extend to any permitted purpose. Granite's server
source is therefore legitimate not merely to read but to **learn from, adapt and
redistribute** — provided the obligations below are met.

### Three obligations, not optional

1. **Preserve the required notice.** `Required Notice: Copyright (c) 2026 Celestial`
   must travel with anything derived from it. PolyForm names this explicitly.
2. **Pass on the terms.** Anyone who receives any part of the software from us must
   also get these terms, or the URL
   `https://polyformproject.org/licenses/noncommercial/1.0.0`.
3. **It must stay noncommercial, permanently.** Not "for now".

### The drift risk, stated plainly

Obligation 3 is the one that will actually bite, because every other project in
this portfolio is commercial. If donations, memberships, Whop, Stripe, ads or a
paid tier ever appear, the licences **end** — and any Granite-derived code would
have to be ripped out of a codebase it had been entangled with for months. Even
accepting donations is a grey area under "noncommercial purpose".

Two practical consequences:

- If there is any real chance this becomes commercial later, keep a **clean-room
  boundary anyway**: derive from our own captures, and treat Granite as
  read-only reference. The cost of that discipline now is far lower than the cost
  of untangling later.
- If any Granite-derived code *is* used, keep it in a clearly marked directory with
  the notice attached, so the boundary is mechanical rather than remembered.

### What the licence does NOT grant

PolyForm covers **Granite's own code**. It grants nothing over NBA 2K assets, and
it does not make circumvention acceptable. So regardless of licensing, still out:
`steam_emu` handling, ownership bypass, redistributed game archives, DRM patching.
Noncommercial motive is not a defence to copyright infringement — MHServerEmu and
FAF are noncommercial too, and both still require a lawfully obtained client.

There is also a file in the repo root literally named
`PLEASE READ THE LICENSE BEFORE DOWNLOADING`. The author's intent is not ambiguous,
and the README says they released it because others were profiting from a leak — so
the one term they care most about is precisely the one we must keep.

**This document itself contains no Granite code**; it records architectural
concepts observed in public source.

---

## ⚠️ Granite probably does NOT describe 2K17

The README's own first line:

> "this is the base of every project **above 2K18**... this is the FIRST proper
> **above 2K18** server in the world."

**NBA 2K17 is below that boundary.** Granite is explicitly scoped to the post-2K18
engine family. So Revival (2K17) is likely a different lineage with a different
protocol, and nothing here may be assumed to hold for our target.

Treat every row below as **a question to ask of 2K17**, never an answer about it.
This is the same discipline as `reference-findings.md`: ARCHITECTURAL IDEA, not
CONFIRMED BEHAVIOR.

---

## Observed architecture (from the public README's own component table)

| Component | Role as described |
|---|---|
| Granite Server | HTTPS web services: login, sessions, store, virtual currency, MyCareer, MyTeam, Pro-Am, user content, matchmaking |
| Opal | Secure WebSocket world server (neighborhood, stage, MyCourt, squads) **plus a UDP game relay** |
| Module | Native DLL loaded into the game; **redirects 2K web traffic** and installs a crash handler |
| Injector / Launcher | Native tools that start the game and load `Module.dll` |
| Shared | Ante-Up court pricing shared by both servers |

Service-layer breadth visible in the source tree: `Account`, `Arbitration`,
`Blacktop`, `Career/Upgrades`, `Cdn`, `ContentMessage`, `Gambling`, `GameLoader`,
`GameStats` (incl. `Matchmaking`, `PlayNowOnline`, `LeaderBoard`), `Inventory`,
`MyCareer` (attributes, grind points, online save), `MyCourt`, `MyTeam`,
`NBAToday`. Plus `Security/CelestialIdentity.js` and `Codec/FieldList.js`.

---

## The three findings that actually matter to us

### 1. They redirect by HOOKING IN-PROCESS, not by hosts file

`Module.cpp` holds a `RedirectHost` constant, the module "redirects 2K web
traffic", and **MinHook** (a function-hooking library) is vendored in
`Granite/Module/MinHook/`.

**This is a different mechanism from ours.** Our lab redirects with a hosts entry
plus a loopback TLS listener. Granite hooks the game's own calls from inside the
process.

Why that is worth knowing, stated carefully:

- It is **evidence that a hosts-file redirect may not be sufficient** for a 2K
  title. If DNS redirection worked, a DLL + hooking library is a lot of work to
  choose instead.
- But it is **not proof**. The Module also installs a crash handler, and injection
  may have been chosen for those other jobs, or simply for convenience.

Either way it sharpens what our baseline must measure, and it maps onto failure
classes `test-replacement.ps1` already prints: `DNS_NOT_USED`,
`CUSTOM_NETWORK_STACK`, `CACHED_SERVICE_CONFIG`. If 2K17 resolves its service
hostname through the OS, our approach works. If it hardcodes an IP or uses its own
resolver, a hosts entry cannot catch it, and **that is a finding to report, not a
cue to start injecting DLLs.**

### 2. A SELF-SIGNED certificate is accepted — so strict pinning is likely absent

> "A self-signed TLS certificate is included in `Granite/Server/Storage/Certificate`
> and is used by both Granite and Opal."

For 2K19, a self-signed cert is good enough. That implies the client does **not**
enforce certificate pinning against 2K's real chain — or that the Module relaxes
it.

This is genuinely encouraging for our method, and our method is *stricter*: we
generate our own CA, trust it explicitly in the Windows store, and issue a leaf
with a correct DNS SAN. That is a cleaner chain than a bare self-signed cert. If
2K17 behaves like 2K19 here, our TLS layer should satisfy it without touching
validation.

**Unverified for 2K17.** If 2K17 *does* pin, the answer is
`BLOCKED_SECURITY_BOUNDARY` and we stop. We do not patch validation.

### 3. Everything defaults to `127.0.0.1`, and they built the same instrument

Granite's whole stack runs on loopback by default; a public deployment means
editing `PublicHost`, `Connect.js`, `Module.cpp` and `StartServers.bat`. Our lab
is loopback-only by design, which is the same shape.

They also ship `--capture` "to record traffic" — i.e. they independently built the
same diagnostic instrument our `probe.js` is. Convergent design is mild evidence
the approach is sound.

---

## Dimension-by-dimension

| Dimension | Granite (2K19, observed) | Our lab (2K17, intended) |
|---|---|---|
| Client source | A prepared client directory; launcher expects an existing `NBA2K19.exe` | **A Steam-licensed install.** No prepared build, no archive |
| Steam dependency | README references `steam_emu.ini` handling (per community report) | **None needed** — a licence supplies the real environment |
| Process launch | Injector/Launcher starts the game and loads `Module.dll` | Normal Steam launch; no injection |
| Web redirection | In-process hooking via MinHook, `RedirectHost` | hosts entry + loopback TLS listener (reversible, byte-exact rollback) |
| Disk patching | `Module.dll` added; native build required | **Nothing written into the game directory** |
| TLS | Self-signed cert, shared by both servers | Our own CA + leaf with DNS SAN, trusted explicitly, removed by exact thumbprint |
| Identity | `Security/CelestialIdentity.js` — their own identity layer | Not built. Gate is one request, not an account system |
| World / Park | Opal: secure WebSocket + UDP relay, lockstep (`OPAL_LOCKSTEP_HZ`) | **Not built and not planned** until Level D/E |
| Server discovery | Endpoint table shipped in-repo | To be **derived from our own captures**, not borrowed |
| Update mechanism | Manual rebuild of native projects | n/a |

---

## What we will not take from this

Now that the project is confirmed noncommercial, the licence no longer forbids
reuse. These exclusions stand for other reasons.

- **No injector, no launcher, no `Module.dll`, no `steam_emu` handling.** With a
  licensed client those solve a problem we will not have, and the `steam_emu` part
  is an ownership bypass regardless of what any licence permits.
- **No endpoint table.** This one is *not* a licence matter — it is an evidence
  matter, and it is the most important exclusion on the page. Borrowing 2K19
  endpoint names and asserting them for 2K17 would manufacture exactly the kind of
  confident false fact `reference-findings.md` exists to prevent, and it is worse
  here than elsewhere: an endpoint list *looks* like data, so a wrong one would be
  believed. **Our service map comes from our own baseline or it stays empty.**
- **No code copied without the notice attached.** If anything is adapted later it
  carries `Required Notice: Copyright (c) 2026 Celestial` and lives in a clearly
  marked directory.

## The one question this changes

Before: "will our hosts redirect reach the client?"

After: **"does NBA 2K17 resolve its service hostname through the OS resolver at
all?"** Granite's choice to hook in-process is the first real hint that a 2K title
might not. `test-client.ps1` answers it on the unmodified client, which is exactly
why the baseline runs first.
