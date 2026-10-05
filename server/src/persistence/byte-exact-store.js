'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function safeKey(key) {
  const value = String(key || '');
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(value)) {
    throw new Error('content key contains unsupported characters');
  }
  return value;
}

function atomicWrite(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = filePath + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, filePath);
}

class ByteExactContentStore {
  constructor(rootDir) {
    if (!rootDir) throw new Error('content store root directory is required');
    this.rootDir = path.resolve(rootDir);
  }

  pathsFor(key) {
    const normalized = safeKey(key);
    return {
      body: path.join(this.rootDir, normalized + '.bin'),
      metadata: path.join(this.rootDir, normalized + '.json'),
    };
  }

  put(key, buffer, metadata = {}) {
    if (!Buffer.isBuffer(buffer)) {
      throw new TypeError('stored content must be a Buffer');
    }

    const paths = this.pathsFor(key);
    const digest = sha256(buffer);
    const record = {
      schema: '2k17-compat-lab.byte-exact-content.v1',
      key: safeKey(key),
      byteSize: buffer.length,
      sha256: digest,
      evidenceClass:
        metadata.evidenceClass || 'LOCAL_AUTHORIZED_ARTIFACT_ANALYSIS',
      source: metadata.source || null,
      claimsPromoted: [],
    };

    atomicWrite(paths.body, buffer);
    atomicWrite(paths.metadata, JSON.stringify(record, null, 2) + '\n');

    return {
      record,
      bodyPath: paths.body,
      metadataPath: paths.metadata,
    };
  }

  get(key) {
    const paths = this.pathsFor(key);
    const record = JSON.parse(fs.readFileSync(paths.metadata, 'utf8'));
    const body = fs.readFileSync(paths.body);
    const digest = sha256(body);

    if (body.length !== record.byteSize) {
      throw new Error('stored content byte length does not match metadata');
    }
    if (digest !== record.sha256) {
      throw new Error('stored content SHA-256 does not match metadata');
    }

    return {
      record,
      body,
      bodyPath: paths.body,
      metadataPath: paths.metadata,
    };
  }
}

module.exports = {
  ByteExactContentStore,
  sha256,
  safeKey,
};
