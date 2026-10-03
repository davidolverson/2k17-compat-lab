# Preserve Client Contract (read-only reference)

Documented **entirely from the public Apache-2.0 source**, 2026-10-03. Nothing was
downloaded from Preserve's content service, no download endpoint was invoked, no
archive or manifest was requested, and no device authorization flow was started.

| | |
|---|---|
| `PRESERVE_REPO_SHA` | `d910ad7f47f881f7aaec7b5a099540c1e468e27c` |
| `PRESERVE_LICENSE` | **Apache-2.0** (font assets retain their own licenses) |
| `PRESERVE_APP_VERSION` | `0.20260923.7` (Cargo.toml), commit dated 2026-09-23 |
| Language / UI | Rust 2024, `eframe`/`egui`, Windows-only |
| Repo size | 21 files; `src/` is only `api.rs`, `models.rs`, `installer.rs`, `main.rs` |
| Stars | 0 |

The repository's own README states the boundary plainly:

> "This repository contains only the Preserve desktop client. It does not contain
> game files, manifests, credentials, private server code, or deployment
> infrastructure. Downloaded games remain subject to their respective owners'
> terms and copyrights."

---

## THE CORRECTION THAT MATTERS

The brief framed this as "the missing architecture" that explains how people run
2K17 without owning it, and proposed making our lab "ready to accept that exact
client revision."

**Read against the source, Preserve is not an architecture our project is missing.
It is a different project that solves a different problem, and it does not move
our gate by one inch.**

Three separate facts:

**1. Preserve is install-time only. Our project is runtime services.**
The entire client is a downloader: fetch catalog, fetch manifest, download files,
SHA-256 verify, run prerequisites, write an install marker. There is no gameplay
networking, no session handling, no service discovery, nothing that speaks to a
game backend. Its API surface is three endpoints, all about acquiring bytes.
**The overlap with "make NBA2K17.exe talk to our replacement backend" is zero.**

**2. There is no entitlement check to be compatible with.**
`POST /v1/auth/device` looks like authentication. It is not. From `api.rs`:

```rust
let hwid  = device_id()?;                 // sha256("preserve:v1:" + HKLM MachineGuid)
let nonce = Uuid::new_v4().simple();      // client-generated
let proof = sha256(format!("{hwid}:{nonce}"));   // computed from the two values above
// all three are then POSTed together
```

The client sends `hwid`, `nonce`, **and** a `proof` that is just the SHA-256 of
the other two fields it also sent. No shared secret, no server-issued challenge,
no signature, no account. Any caller can mint a valid triple in one line. It is a
device *fingerprint*, not an authorization, and nothing in the flow consults an
NBA 2K17 licence of any kind.

So the answer to "why doesn't that project care about Steam ownership" is not a
clever architecture. **It performs no ownership verification at all.** It is an
unauthenticated CDN for 69.2 GB of someone else's copyrighted game.

**3. It therefore does not give David a lawful client.**
"Ready to accept a lawfully supplied client the moment one appears" was already
true before this discovery, and is still true now. A lawful copy means one David
is licensed to run. Preserve hands out copies to people who are not. Learning how
its installer works changes nothing about `CURRENT_BLOCKER`.

This is not a breakthrough on the blocker. It is a clear explanation of someone
else's distribution channel, and the honest value of it is the three-layer split
below.

---

## The three layers, never to be conflated again

| Layer | What it is | Our position |
|---|---|---|
| **1. Client distribution** | Getting a 2K17 install onto a machine. Preserve-style installer + archive CDN. | **NOT OUR LAYER, and not one we will build or use.** Acquisition is David's, through a licence he holds. |
| **2. Client compatibility** | Which exact 2K17 revision a replacement backend must serve. | Ours to *measure* once a client exists. Provenance-neutral: we fingerprint whatever is supplied. |
| **3. Replacement services** | The backend the game talks to at runtime. | **Ours. The only layer this repo is about.** |

Layer 1 is where every legal problem in this space lives. Layer 3 is where the
interesting engineering lives. Conflating them is how a preservation project
becomes a piracy project.

---

## CATALOG MODEL (`src/models.rs`, `serde(rename_all = "camelCase")`)

```
Game {
  id: String                 title: String        shortTitle: String
  year: String               edition: String      size: String      // display string, e.g. "69.2 GB"
  status: String             version: Option<String>
  accent: String             coverUrl: Option<String>
}
GamesResponse { games: Vec<Game> }
```

Note `size` and `year` are **strings**, not numbers, and `version` is optional.

## MANIFEST MODEL

```
GameManifest {
  version: String
  entry_exe: String          // relative path, becomes the recorded executable
  total_size_bytes: u64
  files: Vec<ManifestFile>
  prerequisites: Vec<Prerequisite>   // #[serde(default)] -> may be absent
}
ManifestFile  { path: String, sha256: String, size: u64 }
Prerequisite  { name: String, file: ManifestFile, args: String,
                extracted: Option<ExtractedPrerequisite> }
ExtractedPrerequisite { exe: String, args: String }
```

`GameManifest` uses snake_case field names (no rename attribute), unlike `Game`
and `DownloadPlan` which are camelCase. A compatible API must match that exactly.

## DOWNLOAD PLAN

```
DownloadPlan {               // camelCase
  game: Game
  manifest: GameManifest
  fileBaseUrl: String
  prerequisiteBaseUrl: String
  contentAddressed: bool     // #[serde(default)]
}
SessionResponse { accessToken: String }
DeviceExchange  { hwid, nonce, proof }   // request body, camelCase
```

## API SURFACE (`src/api.rs`)

| Method | Path | Auth | Returns |
|---|---|---|---|
| `GET` | `/v1/games` | none | `GamesResponse` |
| `POST` | `/v1/auth/device` | none | `SessionResponse` |
| `GET` | `/v1/games/{id}/download` | `Bearer <accessToken>` | `DownloadPlan` |

Client: `reqwest`, UA `Preserve/<version>`, 20s connect timeout, 120s read timeout.
Base URL is trimmed of trailing `/`. Configurable via **`PRESERVE_API_URL`** at
compile time or runtime.

## INTEGRITY AND INSTALL BEHAVIOUR (`src/installer.rs`)

- Every file SHA-256 verified; comparison is `eq_ignore_ascii_case` against `ManifestFile.sha256`.
- Concurrent + resumable downloads (buffered writer, chunked, flush/seek on resume).
- Prerequisites are themselves `ManifestFile`s, optionally extracted then executed with args; MSI "already installed" / "reboot required" exit codes are tolerated.
- `write_marker()` runs after a successful install.

## INSTALL MARKERS (three locations)

1. **Per-game marker** — `<project data dir>\installations\<game id>.json`
   (project dir via the `directories` crate).
2. **Machine-readable index** — `%USERPROFILE%\.preserve\index.json`, written
   atomically (`index.json.tmp` then rename), shape:
   `{ "schema": 1, "games": { "<game id>": <marker> } }`, guarded by a lock.
3. **Registry** — the installer also writes under `HKEY_CURRENT_USER`.

Marker fields: game `id`, `title`, `version`, install path, `executable`
(= install path joined with `manifest.entry_exe`), and `verified: true`.

**`verified: true` means Preserve's own SHA-256 pass succeeded against the manifest
it was handed.** It is not a statement about licensing, authenticity, or that the
files are an unmodified retail build. Our lab must never treat the presence of a
Preserve marker as evidence of anything beyond "this installer ran here".

---

## What was deliberately NOT done, and why

**Did not invoke `GET /v1/games/{id}/download`, obtain `fileBaseUrl`, or request
any archive object.** That endpoint's purpose is to hand over copyrighted game
content. The brief forbade it and it stays forbidden.

**Did not search for published SHA-256 hashes of the 69.2 GB archive.** The brief
listed this under "non-asset metadata", but a hash set whose only use is
validating that an unauthorized copy is the correct unauthorized revision is
material assistance to the acquisition path we ruled out. Retail metadata from
public sources is fine; a warez checksum list is not.

**Did not build a `LIKELY_PRESERVE_1_0_1` classifier.** Same reason. A classifier
that answers "is this the right Preserve build?" exists only to certify a copy
obtained that way. `scripts/import-client.ps1` instead fingerprints whatever
directory it is pointed at and reports, provenance-neutrally, what the build *is*
and whether it sits in a real Steam library — which is the distinction that
actually matters both legally and for the gate.

**Did not implement Phase G (a local Preserve-compatible test API + running the
real client against synthetic files).** Running an open-source installer against
my own server with my own files is legal, and I am not claiming otherwise. I am
declining it because of what it is worth and what it builds:

- It yields **zero** evidence toward the gate. Preserve is install-time; the gate is runtime service traffic. Nothing learned there helps `NBA2K17.exe` reach our probe.
- The one capability it does add is a working Preserve-compatible content-distribution server. The only missing ingredient for that to distribute 2K17 is the game files, which we have correctly forbidden. Building the machine and forbidding the fuel is a thin distinction to rest on.
- There is nothing to reverse-engineer. The schema is in `models.rs` above, and the "auth" is a forgeable self-hash. A synthetic install would prove I can echo back three JSON shapes I already transcribed.
- The brief's own red-team rule says not to spend time on anything outside the chain. This is outside the chain.

If the goal of Phase G was "prove we understand the installer", this document is
that proof, derived from the source, at no cost and with nothing built.

---

## PUBLIC 2K17 METADATA (claims, classified)

| Item | Value | Classification |
|---|---|---|
| Steam App ID | `385760` | **CONFIRMED_PUBLIC** (Steam store API) |
| Servers shut down | 2018-12-31 | **CONFIRMED_PUBLIC** (notice in Steam's own appdetails payload) |
| Delisted / unpurchasable | no `packages` array, empty `package_groups` | **CONFIRMED_PUBLIC** (Steam store API, verified 2026-10-03) |
| Preserve listing: v1.0.1, 69.2 GB, Available | as stated in the brief | **COMMUNITY_REPORTED** — taken from the brief, not verified by me, and not verifiable without touching their service |
| Whether v1.0.1 == the final Steam patch | — | **UNKNOWN**, and not resolvable from our side |
| Expected `NBA2K17.exe` version / PE timestamp / directory layout | — | **UNKNOWN** until a real client is fingerprinted here |

`entry_exe` for 2K17 is **UNKNOWN**: it lives in a manifest we did not and will
not fetch. `import-client.ps1` discovers the executable from the supplied
directory instead of assuming a name.
