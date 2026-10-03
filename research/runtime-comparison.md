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

## ⛔ READ THIS FIRST: the licence forbids commercial use

**PolyForm Noncommercial License 1.0.0.** Required Notice: `Copyright (c) 2026 Celestial`.

The operative clauses:

> **Noncommercial Purposes** — Any noncommercial purpose is a permitted purpose.
>
> **Personal Uses** — Personal use for research, experiment, and testing for the
> benefit of public knowledge, personal study, private entertainment, hobby
> projects, amateur pursuits... **without any anticipated commercial application**,
> is use for a permitted purpose.

Two consequences, and the second is the one that bites:

1. **No Granite code may be copied into anything commercial.** Not a file, not a
   function, not a translated-to-another-language port.
2. **The permitted-purpose grant itself evaporates if there is "anticipated
   commercial application".** So if this project is ever intended to earn —
   donations, memberships, Whop, Stripe, anything — then even *studying* Granite as
   a basis for it falls outside the grant, never mind copying.

The repo's own README says the authors released it *because* "everyone decided to
leak this source and profit". They chose Noncommercial deliberately and are
plainly motivated to enforce it.

**Therefore:** this document records *architectural concepts observed in public
source*, which is ordinary interoperability research. It contains no Granite code.
If `2k17-compat-lab` is ever intended to be commercial, the correct posture is to
**not derive from Granite at all** and design clean-room from our own captures.
Decide that before writing a line of backend, not after.

There is also a file in the repo root literally named
`PLEASE READ THE LICENSE BEFORE DOWNLOADING`. The author's intent is not ambiguous.

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

- **No code.** PolyForm Noncommercial, and the project may be commercial.
- **No injector, no launcher, no `Module.dll`, no `steam_emu` handling.** With a licence those solve a problem we will not have.
- **No endpoint table.** Even setting the licence aside, borrowing 2K19 endpoint names and asserting them for 2K17 is exactly the invented-fact failure `reference-findings.md` exists to prevent. Our service map comes from our own baseline or it stays empty.

## The one question this changes

Before: "will our hosts redirect reach the client?"

After: **"does NBA 2K17 resolve its service hostname through the OS resolver at
all?"** Granite's choice to hook in-process is the first real hint that a 2K title
might not. `test-client.ps1` answers it on the unmodified client, which is exactly
why the baseline runs first.
