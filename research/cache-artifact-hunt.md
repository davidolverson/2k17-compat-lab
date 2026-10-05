# Mission 7 — Historical Cache Artifact Hunt

**Date:** 2026-10-05  
**Goal:** Find public evidence of pre-shutdown NBA 2K17 files or client-side cache artifacts that could preserve server-delivered state without depending on disputed local-client binaries.

## Executive finding

The archival hunt found a concrete historical artifact family centered on:

`SYNC.BIN`

Public sources from 2016–2018 repeatedly place it under:

`Steam/userdata/<steam-user-id>/385760/local/SYNC.BIN`

and associate it with:

- startup-time creation/update,
- 2K server data retrieval,
- official roster/content updates,
- default roster/content overrides,
- modding workflows that required editing or replacing the file.

This does **not** yet prove the exact internal format of `SYNC.BIN`, nor that every byte was fetched from the HTTP API. It does make `SYNC.BIN` the highest-value historical cache artifact candidate found so far.

---

## A1 — Contemporary Steam report: SYNC.BIN created before menus

Source:

https://steamcommunity.com/app/385760/discussions/0/343786746002440359/

Date: 2016-09-16 through 2017-02-28  
Evidence class: `PUBLIC_2K17_SOURCE`  
Confidence: MEDIUM–HIGH

A Steam discussion about error `96064c5a` says:

- `SYNC.bin` should exist under `Steam/userdata/<id>/385760/local`,
- it is created at game launch around the PG13 screen before menus,
- insufficient free space can prevent creation,
- one user reports it eventually occupies roughly 900 MB.

Important limits:

- the size estimate is a forum observation, not a canonical file size;
- the thread does not expose the file format or exact download source.

## A2 — Contemporary Steam report: server-backed redownload of player data

Source:

https://steamcommunity.com/app/385760/discussions/0/343787283753311329/

Date: 2016-09-23  
Evidence class: `PUBLIC_2K17_SOURCE`  
Confidence: MEDIUM

A user troubleshooting broken modes was told to:

- locate `Steam/userdata/<id>/385760`,
- back up and delete the `remote` folder,
- launch the game,
- after which the game would report data corruption and redownload files from 2K servers.

The original poster then reported success.

This supports a server-backed restore/synchronization path for some files in the 385760 user-data area.

It does not identify which exact files came from the web-service API versus Steam Cloud or another 2K service.

## A3 — Official roster/update workflows tie SYNC.BIN to server-delivered content

Sources:

https://game.ali213.net/forum.php?extra=page%3D1&mod=viewthread&ordertype=2&tid=6120065

https://www.cr173.com/soft/328984.html

Evidence class: `PUBLIC_2K17_SOURCE`  
Confidence: MEDIUM

Historical NBA 2K17 modding pages say:

- legitimate copies normally download roster updates through the game/server,
- redistributed roster packages included a `SYNC.BIN` described as the latest official update file,
- `SYNC.BIN` belongs in a `local` directory,
- roster files such as `Roster0001` and `RosterDescriptions` belong in `remote`.

One 2016 page describes a launch-day official roster package as a `SYNC.BIN` update.

This is useful evidence about file roles and directory layout, not a verified original server transaction.

## A4 — SYNC.BIN participates in content/default-data overrides

Sources:

https://www.moddingway.com/file/229426/minnesota-timberwolves-2017-2018-court

https://www.moddingway.com/file/229517/philadelphia-76ers-2017-2018-court

NLSC 2K17 modding forum archive:

https://nba-live.com/forums/viewforum.php?f=225&start=300

Evidence class: `PUBLIC_2K17_SOURCE` for historical modding behavior  
Confidence: MEDIUM

Public modding pages say certain court/content mods require editing `SYNC.BIN`.

The NLSC 2K17 forum archive also contains a 2016 tutorial titled:

`[Tutorial] Bypass SYNC.BIN files updates from 2K`

This strongly suggests that official updates could overwrite local `SYNC.BIN` content and that modders treated it as a server-updated/default-content container.

This does not expose the container format.

## A5 — Later roster packages preserve the same file roles

Source:

https://gameloads.ru/others/420-roster-dlya-nba-2k17-sostavy-sezona-2017-2018.html

Evidence class: `PUBLIC_2K17_SOURCE`  
Confidence: LOW–MEDIUM

A later roster package documents:

- `385760/local/Sync.bin`
- `385760/remote/Roster0001`
- `385760/remote/RosterDescriptions`

and also lists an alternate offline-storage layout with matching `local` and `remote` subdirectories.

This corroborates the directory/role split, but third-party roster packages may alter files and therefore cannot establish original byte content.

---

# Architecture impact

Before Mission 7:

```
HTTP API cache exists                     PUBLIC_2K17_SOURCE
exact cache filenames                     UNKNOWN
exact cache locations                     UNKNOWN
historical preserved artifact candidate   UNKNOWN
```

After Mission 7:

```
SYNC.BIN under 385760/local               PUBLIC_2K17_SOURCE
Roster0001/RosterDescriptions in remote   PUBLIC_2K17_SOURCE
server-backed redownload behavior         PUBLIC_2K17_SOURCE
SYNC.BIN updated/created near startup      PUBLIC_2K17_SOURCE
SYNC.BIN affects default/content data      PUBLIC_2K17_SOURCE
SYNC.BIN internal format                   UNKNOWN
SYNC.BIN = HTTP API cache                  HYPOTHESIS
```

The strongest interpretation currently justified is:

> `SYNC.BIN` is a high-value historical 2K17 server/content cache artifact candidate whose metadata and structure should be studied if a legitimately obtained historical copy becomes available.

We must **not** claim yet that `SYNC.BIN` is simply a serialized HTTP response or that it uses the Granite field-list framing.

---

# Artifact collection policy

Do not add historical `SYNC.BIN`, roster files, or copyrighted content blobs to the repository.

For any legitimately obtained historical artifact, collect only metadata into the repository:

- basename
- SHA-256
- byte size
- acquisition/source description
- authorization/provenance status
- modified timestamp if trustworthy
- a short non-content-bearing format observation

Raw artifact bytes stay outside Git.

Use:

`scripts/hash-cache-artifact.js`

to create local metadata for review.

---

# Highest-value next question

Does a historical, legitimately sourced `SYNC.BIN` contain:

1. recognizable archive/container framing,
2. gzip/zlib blocks,
3. route/hostname strings,
4. version/manifests,
5. roster/content indexes,
6. or evidence of embedded server responses?

That question can be answered from metadata/structural analysis of an authorized historical artifact without changing or bypassing the client.
