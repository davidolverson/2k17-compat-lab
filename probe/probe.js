#!/usr/bin/env node
'use strict';

/*
 * 2k17-compat-lab diagnostic probe.
 *
 * This is a MEASURING INSTRUMENT, not a server. Its job is to answer, with
 * evidence, which network layer the NBA 2K17 client reaches:
 *
 *   tcp.connect        -> TCP reached us            (rules out DNS/TCP failure)
 *   tls.clientError    -> TLS attempted and FAILED  (cert rejection / mTLS / pinning)
 *   tls.handshake      -> TLS completed             (our CA was trusted)
 *   http.request       -> application request       (Success level B: the real gate)
 *
 * Every one of those is logged separately on purpose. "Nothing happened" is a
 * useless result; "TCP connected, TLS failed with unknown_ca" is a diagnosis.
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

// --- logging -------------------------------------------------------------
fs.mkdirSync(path.dirname(LOG), { recursive: true });
let seq = 0;

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
  const r = emit('tcp.connect', {
    remoteAddress: sock.remoteAddress,
    remotePort: sock.remotePort,
    localPort: sock.localPort
  });
  say(`[tcp ] #${r.seq} ${sock.remoteAddress}:${sock.remotePort} connected`);
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
  say('[TLS!] ^ classify this: unknown_ca => our CA not trusted by the client.');
  say('[TLS!]   "certificate required"/"bad certificate" => CLIENT CERT (mTLS) demanded.');
  say('[TLS!]   Either way: do NOT patch validation. Record it and classify BLOCKED.');
});

server.on('secureConnection', (sock) => {
  const cert = sock.getPeerCertificate ? sock.getPeerCertificate() : null;
  const hasClientCert = !!(cert && Object.keys(cert).length);
  const r = emit('tls.handshake', {
    remoteAddress: sock.remoteAddress,
    remotePort: sock.remotePort,
    protocol: sock.getProtocol ? sock.getProtocol() : null,
    cipher: sock.getCipher ? sock.getCipher() : null,
    alpn: sock.alpnProtocol || null,
    servername: sock.servername || null,
    clientCertPresented: hasClientCert,
    clientCertSubject: hasClientCert && cert.subject ? cert.subject : null
  });
  say(`[tls ] #${r.seq} OK proto=${r.protocol} cipher=${r.cipher ? r.cipher.name : '?'} sni=${r.servername} clientCert=${hasClientCert}`);
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
    const raw = Buffer.concat(chunks);
    const sock = req.socket;
    const [pathOnly, query] = req.url.split('?');

    // Is the body text or binary? A 2K-era service may well not be JSON.
    const printable = raw.length ? raw.filter((b) => b === 9 || b === 10 || b === 13 || (b >= 32 && b < 127)).length / raw.length : 1;
    const looksText = printable > 0.85;

    const picked = pickResponse(req);
    const resp = picked.resp || { status: 404, headers: {}, body: '' };

    const rec = emit('http.request', {
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
    say('[HTTP]   NOTE: this proves nothing until attributed to NBA2K17.exe.');
    say(`[HTTP]   Correlate remotePort ${rec.remotePort} against watch.ps1 output.`);
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
  });
});

server.on('error', (err) => {
  emit('server.error', { code: err.code, message: err.message });
  say(`[probe] SERVER ERROR ${err.code}: ${err.message}`);
  if (err.code === 'EACCES') say('[probe] EACCES on 443 -- run elevated.');
  if (err.code === 'EADDRINUSE') say('[probe] EADDRINUSE -- something else took 443 after setup checked it.');
  process.exit(1);
});

server.listen(PORT, ADDR, () => {
  emit('probe.listening', { address: ADDR, port: PORT, pid: process.pid });
  say('='.repeat(72));
  say(`[probe] listening https://${ADDR}:${PORT}  pid=${process.pid}`);
  say(`[probe] log: ${LOG}`);
  say(`[probe] responses: ${RESP_PATH} (re-read per request -- edit live)`);
  say('[probe] waiting. tcp/tls/http events will print below.');
  say('='.repeat(72));
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    emit('probe.stopping', { signal: sig });
    say(`[probe] ${sig} -- closing.`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500);
  });
}
