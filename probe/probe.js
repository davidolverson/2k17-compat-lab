#!/usr/bin/env node
'use strict';

/*
 * 2k17-compat-lab diagnostic probe.
 *
 * This is a MEASURING INSTRUMENT, not a server. Its job is to answer, with
 * evidence, which network layer the NBA 2K17 client reaches:
 *
 *   tcp.connect        -> TCP reached us            (rules out DNS/TCP failure)
 *   tls.clientError    -> TLS handshake FAILED      (classify; do NOT over-read)
 *   tls.established    -> TLS handshake COMPLETED   (see the warning below)
 *   http.request       -> application request       (Level B -- but only if ATTRIBUTED)
 *
 * Every one of those is logged separately on purpose. "Nothing happened" is a
 * useless result; "TCP connected, TLS failed with unknown_ca" is a diagnosis.
 *
 * ---------------------------------------------------------------------------
 * TWO CLAIMS THIS PROBE MUST NEVER MAKE
 * ---------------------------------------------------------------------------
 * 1. `tls.established` means ONLY that the TLS handshake completed at the
 *    transport layer. It does NOT prove the client's own certificate validation
 *    or pinning logic accepted us. A client can finish a handshake and then
 *    reject the peer at the application layer, or validate a pinned key after
 *    the fact and tear the session down. The event was previously named
 *    `tls.handshake` from node's `secureConnection`, which invited exactly that
 *    over-reading. Only an application-level request proves app-level acceptance.
 *
 * 2. Nothing observed here says anything about what the ORIGINAL 2K service
 *    required. If our listener produces a TLS error mentioning client
 *    certificates, that is a fact about OUR configuration and this client's
 *    behavior toward it -- it is NOT evidence that 2K's production service used
 *    mTLS. That question cannot be answered by a replacement endpoint.
 * ---------------------------------------------------------------------------
 *
 * Binds loopback only. Responses come from responses.json so that Phase 6
 * experiments are config edits, not code edits.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const tls = require('tls');

const ROOT = path.resolve(__dirname, '..');
const cfgPath = process.argv[2] || path.join(ROOT, 'experiment-state', 'probe-config.json');

if (!fs.existsSync(cfgPath)) {
  console.error(`[probe] FATAL: config not found: ${cfgPath}`);
  console.error('[probe] Run scripts\\setup.ps1 first -- it writes this file.');
  process.exit(2);
}
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));

const PORT = cfg.port || 443;
const ADDR = cfg.address || '127.0.0.1';
const MAX_BODY = cfg.maxBodyBytes || 65536;
const LOG = cfg.logPath || path.join(ROOT, 'logs', 'probe.jsonl');
const RESP_PATH = cfg.responsesPath || path.join(ROOT, 'probe', 'responses.json');

// --- credentials: read, never logged, never echoed ------------------------
const pfx = fs.readFileSync(cfg.pfxPath);
const passphrase = fs.readFileSync(cfg.pfxPasswordPath, 'utf8').trim();

// --- redaction -----------------------------------------------------------
// Console output is redacted ALWAYS. The raw JSONL is gitignored and is the
// only place unredacted values exist; export-sanitized.ps1 is what produces a
// shareable artifact.
const SECRET_HEADERS = new Set([
  'authorization', 'proxy-authorization', 'cookie', 'set-cookie',
  'x-auth-token', 'x-session-token', 'x-api-key', 'x-access-token',
  'x-steam-ticket', 'x-steamid', 'x-2k-token', 'session', 'sessionid'
]);

const PATTERNS = [
  [/\b[0-9A-Za-z._-]*(?:bearer\s+)[A-Za-z0-9._~+/-]{10,}=*/gi, 'Bearer [REDACTED]'],
  [/\b7656119\d{10}\b/g, '[STEAMID64_REDACTED]'],
  [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[EMAIL_REDACTED]'],
  [/\b[0-9a-f]{32,}\b/gi, '[HEX_REDACTED]'],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '[JWT_REDACTED]']
];

function redactString(s) {
  if (typeof s !== 'string') return s;
  let out = s;
  for (const [re, rep] of PATTERNS) out = out.replace(re, rep);
  return out;
}

function redactHeaders(h) {
  const out = {};
  for (const k of Object.keys(h)) {
    out[k] = SECRET_HEADERS.has(k.toLowerCase()) ? '[REDACTED]' : redactString(String(h[k]));
  }
  return out;
}

// --- process attribution -------------------------------------------------
//
// Closes the gap that polling cannot: a connection shorter than watch.ps1's
// poll interval has no owner by the time the next poll runs, leaving an
// unattributable hit that CANNOT be claimed as Level B.
//
// The fix is to resolve the owner at the moment `connection` fires. At that
// instant the socket is ESTABLISHED and we are holding it open, so the OS
// connection table definitely contains the entry with its owning PID. There is
// no race to lose.
//
// Result is one of: 'NBA2K17' | '<other process name>' | 'UNRESOLVED'.
// UNRESOLVED is never upgraded to attributed by assumption.
//
// IMPLEMENTATION NOTE -- the obvious version of this does not work.
// Spawning `powershell.exe -Command Get-NetTCPConnection ...` per connection
// costs 1-5 SECONDS of process startup. Measured: it added a visible 5s stall to
// the self-test, and by the time the query ran the connection had already closed,
// so EVERY request came back UNRESOLVED -- the precise failure this was meant to
// prevent. A per-connection spawn cannot beat a short-lived connection.
//
// Instead: ONE long-lived poller streams the whole TCP table as NDJSON on a tight
// interval, and the probe keeps the latest snapshot in memory. Lookups are then
// synchronous map reads with zero spawn cost. A TLS handshake alone spans several
// poll cycles, so by the time an HTTP request arrives the port is already mapped.
const { spawn } = require('child_process');

const POLL_MS = 100;
const portTable = new Map();   // clientPort -> {pid, processName, seenAt}
let pollerAlive = false;
let pollerSnapshots = 0;
// A silently dropped row is what made the JSON version of this undebuggable: the
// poller reported healthy while parsing nothing. Malformed rows are counted and
// surfaced, never swallowed.
let pollerMalformed = 0;
let pollerWarned = false;
// STARTUP RACE: powershell.exe takes ~1-2s to start, so for the first couple of
// seconds after the probe binds, the port table is EMPTY and every lookup returns
// UNRESOLVED. Measured: a client connecting ~2s after probe start was not
// attributed, while one at ~3s was. If the game happens to connect in that window
// its request is unattributable and cannot be claimed as Level B -- an instrument
// fault that looks exactly like a genuine unknown. So readiness is tracked
// explicitly, recorded on every request, and waited for rather than assumed.
let pollerReady = false;
let pollerReadyAt = null;

// The poller self-terminates when the probe dies. cleanup.ps1 force-kills the
// node PID, and a forced kill on Windows does NOT run node's signal handlers, so
// without this check the PowerShell child would be orphaned and keep polling
// forever after a "verified clean" cleanup.
// WIRE FORMAT: pipe-delimited plain text, deliberately NOT JSON.
//
// The JSON version of this was silently broken and cost real debugging time.
// A Windows path contains single backslashes, so emitting it raw into JSON
// produced invalid escapes (`"C:\Program Files\..."` -> `\P` is not a valid JSON
// escape). JSON.parse threw, the catch discarded the row, and EVERY lookup
// returned UNRESOLVED -- while the poller looked perfectly healthy and alive.
// Escaping it correctly means getting backslashes through a JS template literal,
// into PowerShell source, into a PS regex. Three escaping layers, each a chance
// to be wrong, for no benefit.
//
// `port|pid|name|path` needs no escaping at all: paths cannot contain `|`, and
// splitting on the first three delimiters leaves the path intact whatever it is.
const POLLER_SCRIPT = [
  "$ErrorActionPreference = 'SilentlyContinue'",
  '$parentPid = ' + process.pid,
  '$meta = @{}',
  'while ($true) {',
  '  if (-not (Get-Process -Id $parentPid -ErrorAction SilentlyContinue)) { exit 0 }',
  '  $rows = Get-NetTCPConnection -RemotePort ' + PORT + " -RemoteAddress '" + ADDR + "' -ErrorAction SilentlyContinue",
  // Heartbeat EVERY cycle, rows or not. Readiness must mean "the poller is up and
  // querying", not "the poller has seen a connection" -- with an idle listener
  // there are no rows, so a row-triggered ready signal can never fire and the
  // startup gate would wait forever on a perfectly healthy poller.
  '  [Console]::Out.WriteLine("HB")',
  '  foreach ($r in $rows) {',
  '    $procId = $r.OwningProcess',
  '    if (-not $meta.ContainsKey($procId)) {',
  '      $p = Get-Process -Id $procId -ErrorAction SilentlyContinue',
  '      if ($p) {',
  "        $exe = ''",
  "        try { $exe = $p.Path } catch { $exe = '' }",
  '        $meta[$procId] = $p.ProcessName + "|" + $exe',
  "      } else { $meta[$procId] = 'exited|' }",
  '    }',
  '    [Console]::Out.WriteLine([string]$r.LocalPort + "|" + [string]$procId + "|" + $meta[$procId])',
  '  }',
  '  [Console]::Out.Flush()',
  '  Start-Sleep -Milliseconds ' + POLL_MS,
  '}'
].join('\n');

function startPoller() {
  const p = spawn('powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', POLLER_SCRIPT],
    { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  pollerAlive = true;
  let buf = '';
  // Surface poller stderr. Silence here is how the previous bug stayed invisible.
  p.stderr.on('data', (d) => {
    const s = d.toString().trim();
    if (s) {
      emit('attribution.poller.stderr', { text: s.slice(0, 500) });
      say(`[attr] poller stderr: ${s.slice(0, 200)}`);
    }
  });
  p.stdout.on('data', (d) => {
    buf += d.toString();
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      if (t === 'HB') {
        if (!pollerReady) {
          pollerReady = true;
          pollerReadyAt = Date.now();
          emit('attribution.poller.ready', { afterMs: pollerReadyAt - probeStartedAt });
          say(`[attr] poller READY (${pollerReadyAt - probeStartedAt}ms after bind). Attribution is live.`);
        }
        continue;
      }
      // port|pid|name|path  -- split only the first 3 delimiters so a path
      // containing anything (except '|', which paths cannot) survives intact.
      const i1 = t.indexOf('|');
      const i2 = t.indexOf('|', i1 + 1);
      const i3 = t.indexOf('|', i2 + 1);
      if (i1 < 0 || i2 < 0 || i3 < 0) { pollerMalformed++; continue; }
      const port = parseInt(t.slice(0, i1), 10);
      const pid = parseInt(t.slice(i1 + 1, i2), 10);
      const name = t.slice(i2 + 1, i3);
      const epath = t.slice(i3 + 1);
      if (!isFinite(port) || !isFinite(pid)) { pollerMalformed++; continue; }
      portTable.set(port, { pid: pid, processName: name, processPath: epath, seenAt: Date.now() });
      pollerSnapshots++;
    }
    if (pollerMalformed > 0 && !pollerWarned) {
      pollerWarned = true;
      emit('attribution.poller.malformed', { count: pollerMalformed });
      say(`[attr] WARNING: ${pollerMalformed} malformed poller row(s). Attribution may be incomplete --`);
      say('[attr] treat UNRESOLVED results as an instrument fault, not as evidence.');
    }
  });
  p.on('exit', (code) => {
    pollerAlive = false;
    emit('attribution.poller.exit', { code: code });
    say(`[attr] POLLER EXITED (code ${code}) -- attribution is now BLIND. Level B cannot be claimed.`);
  });
  p.on('error', (e) => {
    pollerAlive = false;
    emit('attribution.poller.error', { message: e.message });
    say(`[attr] poller failed to start: ${e.message}`);
  });
  return p;
}

// Look up with a retry window, all in-memory (no spawning).
//
// The window is generous while the poller is still starting, because a miss there
// is an instrument fault rather than a real answer. We are holding the client's
// request open, so waiting is cheap and safe.
function resolveOwner(clientPort, cb) {
  const budget = pollerReady ? 2000 : 6000;
  const deadline = Date.now() + budget;
  (function attempt() {
    const hit = portTable.get(clientPort);
    if (hit) return cb(hit);
    if (Date.now() > deadline) return cb(null);
    setTimeout(attempt, 40);
  })();
}

// clientPort -> attribution, so http.request records can be stamped.
const attrByPort = new Map();

// A process NAME is not an identity. Proven the hard way: a copy of node.exe
// renamed NBA2K17.exe, sitting in a temp folder, satisfied the Level B test and
// wrote `levelBEvidence: true` into a log. Anything can be named NBA2K17.exe.
//
// So the record also carries the executable PATH, and flags whether that path
// lives under a real Steam library. `levelBEvidence` still keys off the name --
// that is what the gate is defined as -- but `pathLooksLikeSteamInstall: false`
// is a loud marker that a reviewer must not read the record as real evidence.
const STEAM_PATH_RE = /steamapps[\/\\]common[\/\\]/i;

function attributionFor(remotePort) {
  const a = attrByPort.get(remotePort);
  if (!a) {
    return { attributed: 'UNRESOLVED', clientPid: null, clientProcess: null,
             clientPath: null, isGameClient: false, pathLooksLikeSteamInstall: false };
  }
  const isGame = !!(a.processName && /^NBA2K17/i.test(a.processName));
  const pathOk = !!(a.processPath && STEAM_PATH_RE.test(a.processPath));
  return {
    attributed: isGame ? 'NBA2K17' : a.processName,
    clientPid: a.pid,
    clientProcess: a.processName,
    clientPath: a.processPath || null,
    isGameClient: isGame,
    pathLooksLikeSteamInstall: pathOk
  };
}

// --- logging -------------------------------------------------------------
fs.mkdirSync(path.dirname(LOG), { recursive: true });
let seq = 0;
const probeStartedAt = Date.now();

function emit(kind, data) {
  const rec = Object.assign({ seq: ++seq, tsUtc: new Date().toISOString(), kind }, data);
  fs.appendFileSync(LOG, JSON.stringify(rec) + '\n');
  return rec;
}

function say(line) { process.stdout.write(line + '\n'); }

// --- response rules ------------------------------------------------------
function loadResponses() {
  try {
    return JSON.parse(fs.readFileSync(RESP_PATH, 'utf8'));
  } catch (e) {
    say(`[probe] responses.json unreadable (${e.message}); falling back to 404 for everything.`);
    return { default: { status: 404, headers: {}, body: '' }, rules: [] };
  }
}
// Re-read per request: an experiment can change the response WITHOUT a restart,
// which matters because restarting may make the client give up or back off.
function pickResponse(req) {
  const r = loadResponses();
  const rules = Array.isArray(r.rules) ? r.rules : [];
  for (const rule of rules) {
    const mOk = !rule.method || rule.method.toUpperCase() === req.method.toUpperCase();
    let pOk = true;
    if (rule.pathEquals) pOk = (req.url.split('?')[0] === rule.pathEquals);
    else if (rule.pathPrefix) pOk = req.url.startsWith(rule.pathPrefix);
    else if (rule.pathRegex) { try { pOk = new RegExp(rule.pathRegex).test(req.url); } catch (e) { pOk = false; } }
    if (mOk && pOk) return { resp: rule.response, label: rule.label || 'rule' };
  }
  return { resp: r.default, label: 'default' };
}

// --- server --------------------------------------------------------------
const server = https.createServer({
  pfx,
  passphrase,
  minVersion: 'TLSv1',       // 2016 client; let IT choose, do not force modern TLS
  maxVersion: 'TLSv1.3',
  // Record SNI without altering selection.
  SNICallback: (servername, cb) => {
    emit('tls.sni', { sni: servername });
    cb(null, null);
  }
});

// TCP reached us at all. Distinguishes DNS_NOT_USED from TLS_FAILURE.
server.on('connection', (sock) => {
  const rport = sock.remotePort;
  const r = emit('tcp.connect', {
    remoteAddress: sock.remoteAddress,
    remotePort: rport,
    localPort: sock.localPort
  });
  say(`[tcp ] #${r.seq} ${sock.remoteAddress}:${rport} connected`);

  // Resolve the owner NOW, while the socket is established and we hold it.
  resolveOwner(rport, (owner) => {
    if (owner) {
      attrByPort.set(rport, owner);
      const isGame = /^NBA2K17/i.test(owner.processName);
      emit('attribution', {
        remotePort: rport, clientPid: owner.pid, clientProcess: owner.processName,
        clientPath: owner.processPath, isGameClient: isGame
      });
      if (isGame) {
        say('');
        say(`[ATTR] *** NBA2K17.exe *** pid=${owner.pid} clientPort=${rport}`);
        say('');
      } else {
        say(`[attr] port ${rport} owned by ${owner.processName} (pid ${owner.pid}) -- NOT the game`);
      }
    } else {
      emit('attribution', { remotePort: rport, clientPid: null, clientProcess: null, unresolved: true });
      say(`[attr] port ${rport} owner UNRESOLVED -- this connection cannot support a Level B claim`);
    }
  });

  sock.on('close', () => { setTimeout(() => attrByPort.delete(rport), 30000); });
});

// THE diagnostic for certificate rejection / client-cert demands / pinning.
server.on('tlsClientError', (err, sock) => {
  const r = emit('tls.clientError', {
    remoteAddress: sock ? sock.remoteAddress : null,
    remotePort: sock ? sock.remotePort : null,
    code: err.code || null,
    message: err.message || null,
    library: err.library || null,
    reason: err.reason || null
  });
  say(`[TLS!] #${r.seq} handshake FAILED code=${err.code} msg=${err.message}`);
  say('[TLS!] ^ record the exact code. Classify carefully, and claim nothing more:');
  say('[TLS!]   unknown_ca      => THIS client did not trust OUR CA in THIS config.');
  say('[TLS!]   bad_certificate => THIS client rejected OUR leaf. Reason unknown.');
  say('[TLS!]   A message mentioning client certificates is a fact about OUR');
  say('[TLS!]   listener and this client toward it. It is NOT evidence about what');
  say('[TLS!]   the ORIGINAL 2K service required -- a replacement endpoint cannot');
  say('[TLS!]   answer that question. Do not write mTLS into the service map.');
  say('[TLS!]   And do NOT patch validation to get past this. Classify BLOCKED.');
});

// TLS handshake COMPLETED. Named `tls.established`, not `tls.handshake`, and
// deliberately NOT "validation passed": see the header warning. A completed
// handshake does not prove the client's own validation or pinning accepted us.
server.on('secureConnection', (sock) => {
  const cert = sock.getPeerCertificate ? sock.getPeerCertificate() : null;
  const hasClientCert = !!(cert && Object.keys(cert).length);
  const r = emit('tls.established', {
    remoteAddress: sock.remoteAddress,
    remotePort: sock.remotePort,
    protocol: sock.getProtocol ? sock.getProtocol() : null,
    cipher: sock.getCipher ? sock.getCipher() : null,
    alpn: sock.alpnProtocol || null,
    servername: sock.servername || null,
    clientCertPresented: hasClientCert,
    clientCertSubject: hasClientCert && cert.subject ? cert.subject : null,
    meaning: 'TLS_ESTABLISHED at transport layer only; does NOT prove the client accepted us at the application layer, nor that its pinning/validation passed'
  });
  say(`[tls ] #${r.seq} TLS_ESTABLISHED proto=${r.protocol} cipher=${r.cipher ? r.cipher.name : '?'} sni=${r.servername} clientCertPresented=${hasClientCert}`);
  say('[tls ]   ^ transport only. Not proof of app-level acceptance or pinning.');
});

server.on('request', (req, res) => {
  const chunks = [];
  let total = 0;
  let truncated = false;

  req.on('data', (c) => {
    total += c.length;
    if (!truncated) {
      if (total <= MAX_BODY) chunks.push(c);
      else { truncated = true; }
    }
  });

  req.on('end', () => {
    // Resolve attribution BEFORE responding.
    //
    // This ordering is the whole trick, and the two obvious alternatives both
    // fail. Resolving eagerly on `connection` loses the race: on loopback the
    // TLS handshake and first request complete in milliseconds, well inside one
    // poll tick, so the request gets stamped UNRESOLVED. Resolving after the
    // response is worse: a short-lived client exits immediately, its socket
    // leaves the table, and the owner becomes unknowable forever.
    //
    // While we hold the request un-answered, the client is BLOCKED waiting on
    // us. Its process is alive and its socket is ESTABLISHED, so the OS table
    // must contain the entry. Resolution is guaranteed possible here and nowhere
    // else. Cost is one poll interval of added latency, which is nothing next to
    // being unable to claim Level B at all.
    resolveOwner(req.socket.remotePort, (owner) => {
      if (owner) { attrByPort.set(req.socket.remotePort, owner); }
      finishRequest(owner);
    });

    function finishRequest(owner) {
    const raw = Buffer.concat(chunks);
    const sock = req.socket;
    const [pathOnly, query] = req.url.split('?');

    // Is the body text or binary? A 2K-era service may well not be JSON.
    const printable = raw.length ? raw.filter((b) => b === 9 || b === 10 || b === 13 || (b >= 32 && b < 127)).length / raw.length : 1;
    const looksText = printable > 0.85;

    const picked = pickResponse(req);
    const resp = picked.resp || { status: 404, headers: {}, body: '' };

    // Level B is STRUCTURAL, not a console note. A request whose owner is not
    // resolved to NBA2K17.exe is explicitly NOT Level B evidence, and the record
    // says so in a field rather than relying on anyone reading a caveat.
    const attr = attributionFor(sock.remotePort);
    const levelB = attr.isGameClient;

    const rec = emit('http.request', {
      levelBEvidence: levelB,
      attributedTo: attr.attributed,
      clientPid: attr.clientPid,
      clientProcess: attr.clientProcess,
      clientPath: attr.clientPath,
      pathLooksLikeSteamInstall: attr.pathLooksLikeSteamInstall,
      // Distinguishes "we looked and the owner is genuinely unknown" from
      // "our instrument was not up yet". Only the first is a real finding.
      attributionPollerReady: pollerReady,
      method: req.method,
      path: pathOnly,
      query: query || null,
      httpVersion: req.httpVersion,
      host: req.headers.host || null,
      tls: true,
      sni: sock.servername || null,
      tlsProtocol: sock.getProtocol ? sock.getProtocol() : null,
      tlsCipher: sock.getCipher ? (sock.getCipher().name || null) : null,
      remoteAddress: sock.remoteAddress,
      remotePort: sock.remotePort,
      headersRaw: req.headers,                 // raw: JSONL is gitignored
      headersRedacted: redactHeaders(req.headers),
      bodyLength: total,
      bodyTruncated: truncated,
      bodyEncoding: looksText ? 'utf8' : 'base64',
      bodyRaw: looksText ? raw.toString('utf8') : raw.toString('base64'),
      bodyRedacted: looksText ? redactString(raw.toString('utf8')) : '[BINARY]',
      respondedWith: { label: picked.label, status: resp.status }
    });

    // Console: redacted only.
    say('');
    say(`[HTTP] #${rec.seq} *** APPLICATION REQUEST *** ${req.method} ${pathOnly}`);
    say(`[HTTP]   host=${rec.host} httpVersion=${rec.httpVersion} from ${rec.remoteAddress}:${rec.remotePort}`);
    for (const k of Object.keys(rec.headersRedacted)) say(`[HTTP]   ${k}: ${rec.headersRedacted[k]}`);
    say(`[HTTP]   body ${total} bytes (${rec.bodyEncoding}${truncated ? ', TRUNCATED' : ''})`);
    if (total && looksText) say(`[HTTP]   ${rec.bodyRedacted.slice(0, 2000)}`);
    say(`[HTTP]   --> responding ${resp.status} via '${picked.label}'`);
    if (levelB) {
      say(`[HTTP]   >>> LEVEL B: attributed to NBA2K17.exe pid=${attr.clientPid} <<<`);
      say(`[HTTP]   exe: ${attr.clientPath || '(path unavailable)'}`);
      if (!attr.pathLooksLikeSteamInstall) {
        say('[HTTP]   !!! WARNING: that path is NOT under steamapps\\common. A process');
        say('[HTTP]   !!! named NBA2K17.exe is NOT necessarily NBA 2K17 -- a renamed');
        say('[HTTP]   !!! binary satisfies the name check. DO NOT report this as real');
        say('[HTTP]   !!! Level B evidence until the path is a genuine Steam install.');
      }
    } else {
      say(`[HTTP]   NOT Level B. attributedTo=${attr.attributed} pid=${attr.clientPid}`);
      say('[HTTP]   Only a request owned by NBA2K17.exe counts. A curl, a browser,');
      say('[HTTP]   a self-test or an UNRESOLVED owner is a false positive here.');
      if (attr.attributed === 'UNRESOLVED' && !pollerReady) {
        say('[HTTP]   NOTE: the attribution poller was NOT READY. This UNRESOLVED is an');
        say('[HTTP]   INSTRUMENT FAULT, not a finding. Repeat the action and re-check.');
      }
    }
    say('');

    const headers = Object.assign({}, resp.headers || {});
    let bodyOut = Buffer.alloc(0);
    if (resp.body !== undefined && resp.body !== null && resp.body !== '') {
      bodyOut = (resp.bodyEncoding === 'base64')
        ? Buffer.from(resp.body, 'base64')
        : Buffer.from(typeof resp.body === 'string' ? resp.body : JSON.stringify(resp.body), 'utf8');
    }
    if (!headers['Content-Length']) headers['Content-Length'] = String(bodyOut.length);
    res.writeHead(resp.status || 200, headers);
    res.end(bodyOut);
    }
  });
});

server.on('error', (err) => {
  emit('server.error', { code: err.code, message: err.message });
  say(`[probe] SERVER ERROR ${err.code}: ${err.message}`);
  if (err.code === 'EACCES') say('[probe] EACCES on 443 -- run elevated.');
  if (err.code === 'EADDRINUSE') say('[probe] EADDRINUSE -- something else took 443 after setup checked it.');
  process.exit(1);
});

let poller = null;

server.listen(PORT, ADDR, () => {
  poller = startPoller();
  emit('probe.listening', { address: ADDR, port: PORT, pid: process.pid, attributionPollMs: POLL_MS });
  say('='.repeat(72));
  say(`[probe] listening https://${ADDR}:${PORT}  pid=${process.pid}`);
  say(`[probe] log: ${LOG}`);
  say(`[probe] responses: ${RESP_PATH} (re-read per request -- edit live)`);
  say(`[probe] attribution poller: every ${POLL_MS}ms, in-memory lookups`);
  say('[probe] waiting. tcp/tls/http events will print below.');
  say('='.repeat(72));
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    emit('probe.stopping', { signal: sig, pollerSnapshots: pollerSnapshots, pollerAlive: pollerAlive });
    say(`[probe] ${sig} -- closing.`);
    if (poller) { try { poller.kill(); } catch (e) { /* already gone */ } }
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500);
  });
}
