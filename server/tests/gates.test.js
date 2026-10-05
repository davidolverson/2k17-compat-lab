'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const https = require('node:https');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { Readable } = require('node:stream');

const {
  REFERENCE_2K19_TYPES,
  REFERENCE_2K19_TYPE_PROVENANCE,
} = require('../src/codec/reference-field-list');
const {
  redactString,
  redactHeaders,
  sanitizeCaptureRecord,
} = require('../src/capture/sanitize');
const { CaptureStore } = require('../src/capture/capture-store');
const { collectRequestBody } = require('../src/transport/http-capture');
const { PROFILE, buildTlsOptions } = require('../src/transport/tls-options');
const { createHttpsCaptureServer } = require('../src/transport/https-server');
const { selectResponseProfile } = require('../src/response/profiles');

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function listSourceFiles(root) {
  const out = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) out.push(...listSourceFiles(full));
    else if (entry.isFile() && entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

let tlsFixture = null;
function getTlsFixture() {
  if (tlsFixture) return tlsFixture;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), '2k17-m4-tls-'));
  const key = path.join(root, 'key.pem');
  const cert = path.join(root, 'cert.pem');
  const pfxPath = path.join(root, 'server.pfx');
  const passphrase = 'mission4-test-only';

  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', key, '-out', cert, '-subj', '/CN=localhost', '-days', '1',
  ], { stdio: 'ignore' });
  execFileSync('openssl', [
    'pkcs12', '-export', '-out', pfxPath,
    '-inkey', key, '-in', cert, '-passout', 'pass:' + passphrase,
  ], { stdio: 'ignore' });

  tlsFixture = { root, pfx: fs.readFileSync(pfxPath), passphrase };
  process.once('exit', () => fs.rmSync(root, { recursive: true, force: true }));
  return tlsFixture;
}

function httpsRequest({ host, port, method = 'GET', body = null }) {
  return new Promise((resolve, reject) => {
    const request = https.request({
      host,
      port,
      path: '/',
      method,
      rejectUnauthorized: false,
      headers: body ? { 'Content-Length': String(body.length) } : {},
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({
        statusCode: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks),
      }));
    });
    request.on('error', reject);
    if (body) request.write(body);
    request.end();
  });
}

module.exports = function registerMission4GateTests({ test, assert }) {
  test('M4 gate 01: reference type provenance key set is exact', () => {
    assert.deepEqual(
      Object.keys(REFERENCE_2K19_TYPE_PROVENANCE).sort(),
      Object.keys(REFERENCE_2K19_TYPES).sort(),
    );
  });

  test('M4 gate 02: every reference type remains cross-version with no target claim', () => {
    for (const key of Object.keys(REFERENCE_2K19_TYPES)) {
      const p = REFERENCE_2K19_TYPE_PROVENANCE[key];
      assert.equal(p.evidenceClass, 'CROSS_VERSION_REFERENCE');
      assert.equal(p.referenceProject, 'ztpd/Granite');
      assert.equal(
        p.referenceCommit,
        '20c3d875907498eb9e3780553a45f3c451885777',
      );
      assert.equal(p.targetClaim, 'NONE');
    }
  });

  test('M4 gate 03: server package owns start and test commands', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'),
    );
    assert.equal(pkg.scripts.test, 'node tests/run.js');
    assert.equal(pkg.scripts.start, 'node src/index.js config.local.json');
  });

  test('M4 gate 04: TLS profile is frozen to probe bounds', () => {
    assert.equal(PROFILE.minVersion, 'TLSv1');
    assert.equal(PROFILE.maxVersion, 'TLSv1.3');
    const opts = buildTlsOptions({
      pfx: Buffer.from('not-parsed-by-builder'),
      passphrase: 'x',
      minVersion: 'TLSv1.2',
      maxVersion: 'TLSv1.2',
      ciphers: 'SHOULD_NOT_APPEAR',
    });
    assert.equal(opts.minVersion, 'TLSv1');
    assert.equal(opts.maxVersion, 'TLSv1.3');
    assert.equal('ciphers' in opts, false);
    assert.equal('requestCert' in opts, false);
    assert.equal('rejectUnauthorized' in opts, false);
  });

  test('M4 gate 05: example config cannot override TLS profile', () => {
    const cfg = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', 'config.example.json'), 'utf8'),
    );
    for (const key of [
      'minVersion', 'maxVersion', 'ciphers', 'requestClientCertificate',
    ]) {
      assert.equal(Object.prototype.hasOwnProperty.call(cfg.tls, key), false);
    }
    assert.ok(cfg.tls.pfxPath);
    assert.ok(cfg.tls.passphrasePath);
  });

  test('M4 gate 06: long hexadecimal secrets are redacted', () => {
    const secret = 'abcdef0123456789'.repeat(3);
    const redacted = redactString('token=' + secret);
    assert.equal(redacted.includes(secret), false);
    assert.ok(redacted.includes('[HEX_REDACTED]'));
  });

  test('M4 gate 07: server redaction covers all probe sample classes', () => {
    const samples = [
      'Bearer abcdefghijklmnop',
      '76561191234567890',
      'person@example.com',
      'abcdef0123456789abcdef0123456789',
      'eyJabcdefgh.abcdefgh.abcdefgh',
    ];
    for (const sample of samples) {
      assert.notEqual(redactString(sample), sample, sample);
    }
  });

  test('M4 gate 08: secret headers are removed from sanitized metadata', () => {
    const redacted = redactHeaders({
      authorization: 'Bearer abcdefghijklmnop',
      cookie: 'session=secret',
      'x-api-key': 'abcdef0123456789abcdef0123456789',
      'x-safe': 'ok',
    });
    assert.equal(redacted.authorization, '[REDACTED]');
    assert.equal(redacted.cookie, '[REDACTED]');
    assert.equal(redacted['x-api-key'], '[REDACTED]');
    assert.equal(redacted['x-safe'], 'ok');
  });

  test('M4 gate 09: unknown routes select controlled 404', () => {
    const profile = selectResponseProfile(
      { method: 'GET', path: '/definitely-unknown' }, [],
    );
    assert.equal(profile.id, 'CAPTURE_ONLY_404');
    assert.equal(profile.status, 404);
  });

  test('M4 gate 10: explicit test response selection remains explicit', () => {
    const profile = selectResponseProfile(
      { method: 'POST', path: '/synthetic' },
      [{ method: 'POST', pathEquals: '/synthetic', profile: 'TEST_ONLY_EMPTY_200' }],
    );
    assert.equal(profile.id, 'TEST_ONLY_EMPTY_200');
    assert.equal(profile.testOnly, true);
  });

  test('M4 gate 11: no guessed login or session success routes exist', () => {
    const source = listSourceFiles(path.join(__dirname, '..', 'src', 'response'))
      .map((file) => fs.readFileSync(file, 'utf8')).join('\n');
    assert.doesNotMatch(source, /LOGIN_OK|SESSION_UPDATE_OK|\/Session\/login/i);
  });

  test('M4 gate 12: bounded collector keeps only the configured prefix', async () => {
    const collected = await collectRequestBody(
      Readable.from([Buffer.from('abcdef')]),
      { maxBodyBytes: 5 },
    );
    assert.equal(collected.totalBytes, 6);
    assert.equal(collected.storedBytes, 5);
    assert.equal(collected.truncated, true);
    assert.deepEqual(collected.body, Buffer.from('abcde'));
  });

  test('M4 gate 13: bounded collector SHA-256 covers the full stream', async () => {
    const full = Buffer.from('abcdefghij');
    const collected = await collectRequestBody(
      Readable.from([full.subarray(0, 3), full.subarray(3)]),
      { maxBodyBytes: 4 },
    );
    assert.equal(collected.bodySha256, sha256(full));
  });

  test('M4 gate 14: capture store persists total length, stored length and full hash', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), '2k17-m4-store-'));
    try {
      const store = new CaptureStore({
        rawDir: path.join(root, 'raw'),
        idFactory: () => 'm4_store_001',
        now: () => new Date('2026-10-05T00:00:00Z'),
      });
      const full = Buffer.from('abcdefghij');
      const prefix = full.subarray(0, 4);
      const saved = store.persistRequest({
        body: prefix,
        bodyLength: full.length,
        bodySha256: sha256(full),
        bodyTruncated: true,
      });
      assert.equal(saved.record.bodyLength, 10);
      assert.equal(saved.record.storedBodyLength, 4);
      assert.equal(saved.record.bodyTruncated, true);
      assert.equal(saved.record.bodySha256, sha256(full));
      assert.deepEqual(fs.readFileSync(saved.bodyPath), prefix);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('M4 gate 15: sanitized fixtures contain neither raw body nor local body path', () => {
    const sanitized = sanitizeCaptureRecord({
      captureId: 'm4_sanitized_001',
      tsUtc: '2026-10-05T00:00:00.000Z',
      method: 'POST',
      path: '/x',
      query: 'secret=yes',
      headers: { authorization: 'Bearer abcdefghijklmnop' },
      bodyLength: 10,
      bodySha256: 'a'.repeat(64),
      bodyPath: 'server/captures/raw-local/x.body.bin',
      bodyTruncated: true,
      tls: null,
    });
    assert.equal(sanitized.query, '[REDACTED_QUERY]');
    assert.equal(sanitized.headers.authorization, '[REDACTED]');
    assert.equal('body' in sanitized, false);
    assert.equal('bodyPath' in sanitized, false);
  });

  test('M4 gate 16: client-visible compatibility debug header is absent from server source', () => {
    const source = listSourceFiles(path.join(__dirname, '..', 'src'))
      .map((file) => fs.readFileSync(file, 'utf8')).join('\n');
    assert.doesNotMatch(source, /X-Compat-Lab-Profile/i);
  });

  test('M4 gate 17: historical tls.handshake evidence is not normalized', () => {
    const fixture = fs.readFileSync(
      path.join(
        __dirname, '..', '..', 'sanitized-fixtures',
        'probe.66686d164ca1.sanitized.jsonl',
      ),
      'utf8',
    );
    assert.match(fixture, /"kind":"tls\.handshake"/);
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'capture', 'sanitize.js'), 'utf8',
    );
    assert.doesNotMatch(
      source,
      /tls\.handshake.*tls\.established|tls\.established.*tls\.handshake/s,
    );
  });

  test('M4 gate 18: replacement server contains no process-attribution poller', () => {
    const source = listSourceFiles(path.join(__dirname, '..', 'src'))
      .map((file) => fs.readFileSync(file, 'utf8')).join('\n');
    assert.doesNotMatch(source, /Get-NetTCPConnection|Get-Process|powershell\.exe/i);
  });

  test('M4 gate 19: IPv4 HTTPS keeps selected response and bounded evidence', async () => {
    const tls = getTlsFixture();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), '2k17-m4-v4-'));
    const events = [];
    const app = createHttpsCaptureServer({
      host: '127.0.0.1',
      port: 0,
      pfx: tls.pfx,
      passphrase: tls.passphrase,
      rawDir: path.join(root, 'raw'),
      maxBodyBytes: 5,
      onEvent: (kind, data) => events.push({ kind, data }),
    });

    try {
      const address = await app.start();
      const full = Buffer.from('abcdefghij');
      const response = await httpsRequest({
        host: '127.0.0.1',
        port: address.ipv4.port,
        method: 'POST',
        body: full,
      });
      assert.equal(response.statusCode, 404);
      assert.equal(response.headers['x-compat-lab-profile'], undefined);

      const metadataFile = fs.readdirSync(path.join(root, 'raw'))
        .find((name) => name.endsWith('.request.json'));
      const record = JSON.parse(
        fs.readFileSync(path.join(root, 'raw', metadataFile), 'utf8'),
      );
      assert.equal(record.bodyLength, full.length);
      assert.equal(record.storedBodyLength, 5);
      assert.equal(record.bodyTruncated, true);
      assert.equal(record.bodySha256, sha256(full));
      assert.ok(events.some((event) => event.kind === 'tls.established'));
      assert.equal(events.some((event) => event.kind === 'tls.handshake'), false);
    } finally {
      await app.stop();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('M4 gate 20: IPv6 HTTPS reaches same handler or bind failure is explicit', async () => {
    const tls = getTlsFixture();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), '2k17-m4-v6-'));
    const events = [];
    const app = createHttpsCaptureServer({
      host: '127.0.0.1',
      port: 0,
      pfx: tls.pfx,
      passphrase: tls.passphrase,
      rawDir: path.join(root, 'raw'),
      onEvent: (kind, data) => events.push({ kind, data }),
    });

    try {
      const address = await app.start();
      if (address.ipv6) {
        const response = await httpsRequest({
          host: '::1',
          port: address.ipv6.port,
        });
        assert.equal(response.statusCode, 404);
        assert.ok(
          fs.readdirSync(path.join(root, 'raw')).some(
            (name) => name.endsWith('.request.json'),
          ),
        );
      } else {
        assert.ok(
          events.some((event) => event.kind === 'ipv6.bind.failed'),
          'missing IPv6 listener must emit ipv6.bind.failed',
        );
      }
    } finally {
      await app.stop();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
};
