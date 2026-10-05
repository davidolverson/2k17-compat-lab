'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { sanitizeCaptureRecord } = require('./sanitize');

const SHA256_RE = /^[0-9a-f]{64}$/i;

function stableId() {
  return crypto.randomBytes(12).toString('hex');
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function atomicWrite(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = filePath + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, filePath);
}

class CaptureStore {
  constructor(options = {}) {
    this.rawDir = path.resolve(
      options.rawDir || path.join(process.cwd(), 'server', 'captures', 'raw-local'),
    );
    this.sanitizedDir = options.sanitizedDir
      ? path.resolve(options.sanitizedDir)
      : null;
    this.now = options.now || (() => new Date());
    this.idFactory = options.idFactory || stableId;
  }

  persistRequest(input) {
    if (!input || typeof input !== 'object') {
      throw new TypeError('persistRequest input must be an object');
    }
    if (!Buffer.isBuffer(input.body)) {
      throw new TypeError('persistRequest body must be a Buffer');
    }

    const captureId = input.captureId || this.idFactory();
    if (!/^[a-zA-Z0-9._-]{6,128}$/.test(captureId)) {
      throw new Error('captureId contains unsupported characters');
    }

    const timestamp = input.tsUtc || this.now();
    const tsUtc = timestamp && typeof timestamp.toISOString === 'function'
      ? timestamp.toISOString()
      : String(timestamp);

    const storedBodyLength = input.body.length;
    const bodyLength =
      input.bodyLength === undefined || input.bodyLength === null
        ? storedBodyLength
        : Number(input.bodyLength);

    if (
      !Number.isSafeInteger(bodyLength) ||
      bodyLength < 0 ||
      bodyLength < storedBodyLength
    ) {
      throw new RangeError(
        'bodyLength must be a non-negative safe integer >= stored body length',
      );
    }

    const bodyTruncated =
      Boolean(input.bodyTruncated) || bodyLength > storedBodyLength;

    let bodySha256;
    if (input.bodySha256 !== undefined && input.bodySha256 !== null) {
      bodySha256 = String(input.bodySha256).toLowerCase();
      if (!SHA256_RE.test(bodySha256)) {
        throw new TypeError('bodySha256 must be a SHA-256 hex digest');
      }
    } else {
      if (bodyTruncated) {
        throw new Error(
          'bodySha256 is required when the stored body is truncated',
        );
      }
      bodySha256 = sha256(input.body);
    }

    const bodyPath = path.join(this.rawDir, captureId + '.body.bin');
    const metadataPath = path.join(this.rawDir, captureId + '.request.json');

    const record = {
      schema: '2k17-compat-lab.raw-request.v1',
      captureId,
      tsUtc,
      method: input.method || null,
      path: input.path || null,
      query: input.query || null,
      httpVersion: input.httpVersion || null,
      host: input.host || null,
      headers: { ...(input.headers || {}) },
      bodyLength,
      storedBodyLength,
      bodySha256,
      bodyPath,
      bodyTruncated,
      contentType: input.contentType || null,
      vcFieldListSize:
        input.vcFieldListSize === undefined ? null : input.vcFieldListSize,
      tls: input.tls || null,
      responseProfile: input.responseProfile || null,
      evidenceContext: input.evidenceContext || {
        kind: 'UNVERIFIED_LOCAL',
        runId: null,
        instrument: 'capture-first-server',
        authorizationStatus: 'UNVERIFIED',
        clientFingerprintSha256: null,
      },
    };

    atomicWrite(bodyPath, input.body);
    atomicWrite(metadataPath, JSON.stringify(record, null, 2) + '\n');

    return { record, bodyPath, metadataPath };
  }

  exportSanitized(record, options = {}) {
    const dir = path.resolve(
      options.directory ||
        this.sanitizedDir ||
        path.join(process.cwd(), 'sanitized-fixtures'),
    );
    const sanitized = sanitizeCaptureRecord(record);
    const filePath = path.join(dir, sanitized.captureId + '.sanitized.json');
    atomicWrite(filePath, JSON.stringify(sanitized, null, 2) + '\n');
    return { sanitized, filePath };
  }
}

module.exports = { CaptureStore, atomicWrite, sha256 };
