# Public NBA 2K17 Evidence — Mission 6

**Date:** 2026-10-05  
**Purpose:** Harvest public, independently reviewable evidence about NBA 2K17's historical online architecture and current replacement projects.

This document records what each source actually supports. It does not promote public claims to `OBSERVED_2K17`, and it does not use disputed local-client artifacts.

## P1 — 2023 PC replacement-service certificate report

Source:

https://www.reddit.com/r/cryptography/comments/14why8y/trust_certificate_dilemma/

Author: `Beneficial_Ratio_897`  
Date: 2023-07-11  
Evidence class: `PUBLIC_2K17_SOURCE`  
Confidence: MEDIUM

The author says they were recreating an API for an offline game and names:

`nba2k17-ws.2ksports.com`

They report that on PC they could use a self-signed certificate after trusting their own CA locally. They also say a DNS redirect still caused the client to expect the certificate name for the original hostname.

Supports:

- historical 2K17 web-service hostname
- TLS/certificate hostname validation
- feasibility of a locally trusted CA path on at least one PC environment
- evidence that DNS redirection alone does not remove certificate-name validation

Does not establish:

- exact HTTP routes
- exact port
- exact TLS version/cipher
- universal absence of pinning
- universal behavior across all 2K17 builds

## P2 — 2023 NBA 2K17 server-emulator / mTLS research question

Source:

https://reverseengineering.stackexchange.com/questions/32011/how-could-i-extract-a-certificate-and-private-key-out-of-a-exe

Author: `Botytec`  
Date: 2023-06-30  
Evidence class: `PUBLIC_2K17_SOURCE` for the historical research activity; `HYPOTHESIS` for mTLS by itself  
Confidence: LOW–MEDIUM

The question explicitly names NBA 2K17 and says the author was trying to obtain backend API responses to create a server emulator. The author believed the backend used mTLS and was looking for a client certificate/private key.

A commenter challenged whether mTLS had actually been established and suggested ordinary TLS/pinning as an alternative.

Supports:

- independent historical evidence that researchers were targeting a 2K17 backend/API contract
- independent contemporaneous suspicion of client-certificate authentication

Does not, by itself, prove mTLS.

## P3 — Plutonium admin report from prior 2K17 investigation

Source:

https://forum.plutonium.pw/topic/26595/project-idea-nba-2k16/7

Author: `Eldor`, labeled Plutonium Admin  
Published thread: 2022-era discussion (page currently archived/read-only)  
Evidence class: `PUBLIC_2K17_SOURCE`  
Confidence: MEDIUM

The author says the Plutonium team had investigated 2K17 and reports:

- an HTTP API handles most live-service tasks
- some custom/binary body serialization is involved
- the backend expects a special HTTPS client certificate
- game traffic uses a combination of WebSockets and UDP
- WebSockets appeared to be used for neighborhood/Park behavior
- UDP appeared to be used for the actual match
- the WebSocket and UDP packet structures looked different
- the game caches files obtained from the HTTP API on disk
- related 2K games appeared similar enough that newer titles could inform research

This is the strongest public architecture source located in Mission 6 because it reports specific findings from a prior 2K17 investigation rather than general speculation.

Supports:

- HTTP API as a real 2K17 architecture component
- existence of binary/custom serialization somewhere in that API
- client-certificate behavior as a reported 2K17 finding
- WebSocket + UDP split as a reported 2K17 realtime architecture
- likely Park/neighborhood versus match transport split
- existence of client-side cached server-downloaded files

Important limitation:

The post does not publish packet captures, certificates, endpoint names, wire schemas, ports, or reproducible fixtures. Therefore these remain `PUBLIC_2K17_SOURCE`, not `OBSERVED_2K17`.

## P4 — Historical public NBA 2K17 private-server repository

Repository:

https://github.com/THEKINGPATUBOY14/NBA-2k17-Private-Server

Pinned commit:

`24e52860bdd5ea626604b80ad38358f48b039988`

Evidence class: `PUBLIC_2K17_SOURCE`  
Confidence: LOW–MEDIUM

Relevant source:

`NBA 2K17 GameServer/Server.h`

contains:

`main.sin_port = htons(17217);`

The repository is visibly incomplete. The README says it is not ready.

Other labels in the source include:

- `DecompressStateData`
- `CompressStateData`
- `UploadUserData`
- game-state update labels

Those names are author-supplied reverse-engineering labels, not a documented public wire contract.

Supports:

- historical significance of TCP port 17217 in one public 2K17 server attempt
- evidence that at least one reverse-engineering effort associated game-state/user-data processing with the target

Does not establish:

- TLS on 17217
- a complete server
- HTTP path names
- body framing
- field constants
- correctness of the listed offsets/labels

## P5 — Historic hostname lists

Examples located through public GitHub search include:

- `einyx/pfsense-pihole-blocklist`
- firmware/blocklist mirrors containing `nba2k17-ws.2ksports.com`

One preserved list labels the hostname directly under NBA 2K17 / `NBA2K17.exe`.

Evidence class: `PUBLIC_2K17_SOURCE`  
Confidence: MEDIUM for hostname corroboration only

Supports:

- independent historical corroboration that the hostname was associated with NBA 2K17 network traffic

Does not establish routes, port, or protocol.

## P6 — Revival first-party project site

Homepage:

https://revivalclient.net/

Status:

https://revivalclient.net/status

Release note:

https://revivalclient.net/news/revival-launcher-release

Terms:

https://revivalclient.net/terms

Evidence class: `PUBLIC_2K17_SOURCE` **about Revival's replacement architecture**, not about the original 2K17 production protocol  
Confidence: HIGH for what Revival claims about its own service

Current first-party claims include:

- NBA 2K17 support
- supported games connect through the Revival launcher and Revival API
- a July 25, 2026 beta release had live servers/launcher and playable MyCareer
- the status page separately names:
  - Revival API
  - Game servers: login, matchmaking and the game wire
  - Park servers
- the status page lists Play Now Online, MyCourt and MyPARK
- current homepage notice says downloads/services are unavailable due to restrictions placed on Revival on behalf of Take-Two
- Revival terms say users need their own legitimately obtained copy of a supported game

Supports:

- replacement service feasibility is demonstrated in public first-party material
- a successful replacement project separates API, game-wire/matchmaking, and Park infrastructure
- account/session/profile/economy work is not the whole problem; realtime game/Park infrastructure is a separate layer

Does not establish:

- that Revival mirrors the original 2K17 topology exactly
- its implementation method
- original 2K17 endpoint paths
- original 2K17 binary schema
- whether its launcher patches, redirects, hooks or otherwise adapts the client

## P7 — Preserve first-party site and repository

Site:

https://preserve.st/games/2k17

Repository:

https://github.com/PreserveTeam/Preserve

Evidence class: `PUBLIC_2K17_SOURCE` for Preserve packaging/client-distribution context, not protocol  
Confidence: HIGH for Preserve's own claims

Public page currently reports:

- NBA 2K17
- version label `1.0.1`
- archive size `69.2 GB`
- status `Available`

The Preserve README says its Windows client:

- downloads supported preserved games
- verifies every downloaded file with SHA-256
- installs prerequisites
- records completed installs in `%USERPROFILE%\.preserve\index.json`
- can point at another compatible Preserve API using `PRESERVE_API_URL`
- does not contain game files, manifests, credentials, private-server code or deployment infrastructure in the public desktop-client repository

Important limitation:

Preserve's `1.0.1` label is not proof of a particular `NBA2K17.exe` file version, Steam build ID, or executable hash.

## P8 — Current community reports about replacement projects

Recent Reddit posts around late September / early October 2026 report:

- Revival brought 2K17 Park online on PC
- current Back2Back-related posts advertised a public playtest
- an October 4 EU post claims MyPARK, rep/progression, MyPLAYER/MyCAREER, VC, stores and rotating events are working on a current community project

Evidence class: `PUBLIC_2K17_SOURCE` for the existence of community claims only  
Confidence: LOW unless corroborated by first-party project material

These reports are useful for feature-priority leads. They are not wire-protocol evidence.

## P9 — Historical PC port-forward lists

Source:

https://portforward.com/nba-2k17/

Evidence class: `PUBLIC_2K17_SOURCE` with LOW confidence for transport hints

The site lists PC TCP/UDP ranges commonly associated with Steam/gameplay networking.

This is too generic to map directly to the replacement backend. It may be relevant when later studying match UDP traffic, but it should not be used to infer web-service ports or exact realtime architecture.

## P10 — Original server shutdown / online dependency context

Steam support/store metadata and historical community discussion establish that the official online servers were shut down at the end of 2018.

Operation Sports discussion from November 2018 also shows users expected custom-team/online-save functionality to be affected.

Evidence class: `PUBLIC_2K17_SOURCE`  
Confidence: HIGH for shutdown; LOW–MEDIUM for individual feature effects

This is background context, not protocol evidence.

---

# Mission 6 protocol-impact summary

The most important new public evidence is P3.

Before Mission 6, these were largely UNKNOWN/HYPOTHESIS:

- whether the original game had an HTTP API
- whether binary serialization was used
- whether a client certificate was involved
- whether Park/world used WebSockets
- whether matches used UDP
- whether server-delivered files were cached locally

After Mission 6, those can be tracked as `PUBLIC_2K17_SOURCE` claims with bounded confidence.

The following remain UNKNOWN:

- exact login route
- exact login method
- exact 2K17 field-list framing
- exact field IDs/CRCs
- `VCFIELDLIST_SIZE`
- exact certificate format/key location
- exact WebSocket endpoint
- exact UDP packet format
- exact service-discovery schema
- exact match assignment flow
- exact Park/world bootstrap messages

No public source found in Mission 6 exposed a reproducible 2K17 `Session/login` request or response body.
