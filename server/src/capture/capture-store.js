'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { sanitizeCaptureRecord } = require('./sanitize');

function stableId() {
  return crypto.randomBytes(12).toString('hex');
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

    const bodySha256 = crypto
      .createHash('sha256')
      .update(input.body)
      .digest('hex');

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
      bodyLength: input.body.length,
      bodySha256,
      bodyPath,
      bodyTruncated: Boolean(input.bodyTruncated),
      contentType: input.contentType || null,
      vcFieldListSize:
        input.vcFieldListSize === undefined ? null : input.vcFieldListSize,
      tls: input.tls || null,
      responseProfile: input.responseProfile || null,
    };

    atomicWrite(bodyPath, input.body);
    atomicWrite(metadataPath, JSON.stringify(record, null, 2) + '\n');

    return {
      record,
      bodyPath,
      metadataPath,
    };
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

module.exports = {
  CaptureStore,
  atomicWrite,
};
