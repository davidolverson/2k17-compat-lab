# NBA 2K17 Revival / Preserve / Back2Back teardown

Date: 2026-10-03

## Objective

Build an independently operated NBA 2K17-compatible replacement service for research and noncommercial interoperability using an authorized PC client.

This branch records only verified public evidence and clearly labels inference. It does not include game files, DRM bypasses, cracks, Steam ownership bypasses, certificate-pinning bypasses, or copied proprietary server code.

## Verified public facts

### 1. Primary 2K17 web-service hostname

Historical blocklists and a 2023 developer discussion identify:

`nba2k17-ws.2ksports.com`

The 2023 developer reported that on PC a locally trusted self-signed CA could satisfy the client when routing the hostname to a replacement service. Their console attempt failed because the console would not trust the replacement CA.

Evidence:
- https://www.reddit.com/r/cryptography/comments/14why8y
- Historical host list containing the 2K17 hostname:
  https://gist.github.com/Lichtenshtein/39948d25d7f93b3d17dbe0be66a6388e

This is evidence that PC service replacement is feasible without proving that every 2K17 service or every build behaves identically.

### 2. Preserve is an installer/build standardizer, not the private server

Preserve publicly describes itself as a Windows application that:
- downloads supported preserved games
- verifies every downloaded file with SHA-256
- installs prerequisites
- supports resumable/concurrent downloads
- records completed installs in `%USERPROFILE%\.preserve\index.json`
- can target a compatible API using `PRESERVE_API_URL`

The public repository explicitly says it does NOT contain:
- game files
- manifests
- credentials
- private-server code
- deployment infrastructure

Evidence:
- https://github.com/PreserveTeam/Preserve
- https://preserve.st/games/2k17

Current public Preserve page for NBA 2K17 reports:
- Version: 1.0.1
- Archive: 69.2 GB
- Status: Available

Important: "1.0.1" may be Preserve package/version labeling. It is NOT yet proven to equal a specific NBA2K17.exe file version or Steam build number.

### 3. Revival used a standardized non-Steam-distributed client path

Recent community reports around Revival repeatedly state:
- Revival brought NBA 2K17 Park back online on PC.
- Users were directed to a Preserve-installed 2K17 build.
- Users report that the ordinary Steam install did not work with Revival.
- Revival marketed one-click install / free gameplay through its launcher/API.
- Revival itself is currently unavailable and its public site states restrictions were placed on the service on behalf of Take-Two.

Evidence:
- https://revivalclient.net/
- https://www.reddit.com/r/NBA2k/comments/1wrxqrg/2k17_servers_back_live_on_pc_somehow/
- https://www.reddit.com/r/NBA2k/comments/1ws0uvv/2k17_server/
- https://www.reddit.com/r/NBA2k/comments/1wtz9li/the_2k17_revival/

Community statements are not authoritative proof of what the executable was modified to do.

### 4. Revival feature evidence

Recent public comments claim working:
- MyCAREER
- VC earning
- store usage
- large VC locker-code awards
- Park sessions
- NA Park servers

These claims are useful leads but remain community-reported until reproduced against a client we can lawfully inspect.

### 5. Back2Back is a new independent project

On 2026-10-03 current Reddit posts point users to:
`back2backclient.com`

Posts claim:
- a playtest is planned for 2026-10-04
- multiple regions including NA/EU/Asia are being discussed
- Park / Park After Dark testing has occurred

Evidence:
- https://www.reddit.com/r/NBA2k/comments/1wwwm2l/revival_client_download/
- https://www.reddit.com/r/NBA2k/comments/1www9c6/found_a_revival_alternative_through_someone/
- https://www.reddit.com/r/NBA2k/comments/1www9qp/found_a_nba_2k17_laucnher_like_revival/

The site was not reachable through our web tooling during this review. No public source code has been verified. Do not assume their implementation method.

## What is NOT proven yet

Do not promote these to facts until measured:

1. Preserve's 2K17 archive is a stock Steam build.
2. Preserve's archive is DRM-modified.
3. Revival patched NBA2K17.exe.
4. Revival used hosts-file redirection.
5. Revival used in-process hooks.
6. Revival used a Steam emulator.
7. Revival and Back2Back share code.
8. Back2Back uses Revival code.
9. The Steam client cannot work with a clean-room replacement server.
10. `nba2k17-ws.2ksports.com` is the only hostname/service required.

## Most likely architecture

This is a hypothesis to test, not a conclusion:

```
known 2K17 PC build
        |
        v
launcher / setup layer
        |
        +-- identifies compatible build
        +-- prepares runtime configuration
        +-- points client toward replacement services
        |
        v
nba2k17-ws compatible HTTPS service
        |
        +-- identity/session
        +-- player/profile state
        +-- VC/economy
        +-- MyCAREER state
        +-- store/catalog
        +-- online presence / Park discovery
        +-- matchmaking/session bootstrap
        |
        v
world / Park game session infrastructure
```

The web service and real-time Park transport may be separate systems.

## Clean-room evidence gates

### Gate A — exact client identity

For an authorized compatible client:
- SHA-256 NBA2K17.exe
- PE timestamp
- file version
- directory fingerprint
- package/source provenance
- compare against a stock Steam baseline if available

No assertion about "modified" until hashes/diffs exist.

### Gate B — service discovery

With the client running in an isolated lab:
- collect DNS queries
- collect destination IP/port
- attribute sockets to processes under the game install root
- record requested hostnames
- do not decrypt unrelated traffic
- do not bypass pinning/security controls

Deliverable: `service-map.json`.

### Gate C — first attributable request to our service

Success means:
- genuine NBA2K17 process or install-root helper initiates connection
- connection arrives at our replacement endpoint
- PID/path attribution is captured
- raw request metadata/body are preserved locally

### Gate D — deterministic response changes behavior

Return an independently authored response and observe a repeatable client-state difference.

Examples of acceptable early proofs:
- service unavailable changes to an expected structured state
- login/menu state changes
- client issues a deterministic next request

No invented protocol fields.

### Gate E — account state

Once the request/response contract is known, independently implement:
- local account ID
- session
- profile
- VC field if protocol proves it exists
- persistence

At that point test-only VC values are ours because the database is ours.

## Highest-value evidence to collect from Back2Back playtest

If a lawful test client is available:

1. Hash launcher binaries before executing.
2. Record signer/version metadata.
3. Record files created/modified by installer.
4. Snapshot hosts file before/after.
5. Snapshot user certificate store before/after.
6. Record child process tree when launching.
7. Record DNS queries during startup.
8. Record outbound destinations and ports.
9. Record whether NBA2K17.exe itself is altered.
10. Compare NBA2K17.exe hash before/after launcher setup.
11. Record config files created beside the game.
12. Record browser/API calls made by launcher.
13. Do NOT send real credentials beyond what the project itself requires.
14. Do NOT attempt to defeat access controls or extract secrets.

This should tell us whether Back2Back is mostly:
- endpoint routing,
- a launcher/config wrapper,
- a backend clone,
- a patched client,
- or some combination.

## Immediate conclusion

The hard problem is no longer "is 2K17 private-server replacement imaginable?"

Public evidence says it has already been demonstrated on PC.

Our hard problem is identifying the exact client contract and reproducing it independently, one endpoint at a time, with evidence.
