'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {
  tryParseFieldList,
} = require('../codec/reference-field-list');

const DEFAULT_WINDOW = 64 * 1024;
const DEFAULT_CHUNK = 1024 * 1024;
const MAX_PROTOCOL_STRINGS = 500;

const MAGIC_SIGNATURES = Object.freeze([
  { name: 'gzip', bytes: Buffer.from([0x1f, 0x8b]) },
  { name: 'zip-local-file', bytes: Buffer.from([0x50, 0x4b, 0x03, 0x04]) },
  { name: 'zip-central-directory', bytes: Buffer.from([0x50, 0x4b, 0x01, 0x02]) },
  { name: '7z', bytes: Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]) },
  { name: 'xz', bytes: Buffer.from([0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00]) },
  { name: 'png', bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  { name: 'pdf', bytes: Buffer.from('%PDF-', 'ascii') },
]);

function shannonEntropy(buffer) {
  if (!Buffer.isBuffer(buffer)) throw new TypeError('entropy input must be a Buffer');
  if (buffer.length === 0) return 0;

  const counts = new Uint32Array(256);
  for (const byte of buffer) counts[byte] += 1;

  let entropy = 0;
  for (const count of counts) {
    if (!count) continue;
    const p = count / buffer.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

function scanMagic(buffer, baseOffset = 0) {
  const matches = [];

  for (const signature of MAGIC_SIGNATURES) {
    let from = 0;
    while (from < buffer.length) {
      const index = buffer.indexOf(signature.bytes, from);
      if (index < 0) break;
      matches.push({
        name: signature.name,
        offset: baseOffset + index,
      });
      from = index + 1;
    }
  }

  // RFC1950 zlib headers are variable. Recognize common CMF/FLG values only.
  for (let i = 0; i + 1 < buffer.length; i += 1) {
    const cmf = buffer[i];
    const flg = buffer[i + 1];
    if ((cmf & 0x0f) !== 8) continue;
    if (((cmf << 8) + flg) % 31 !== 0) continue;
    if ((cmf >> 4) > 7) continue;
    matches.push({ name: 'zlib-candidate', offset: baseOffset + i });
  }

  return matches;
}

function isPrintableAscii(byte) {
  return byte >= 0x20 && byte <= 0x7e;
}

function looksProtocolRelevant(text) {
  const lower = text.toLowerCase();

  return (
    lower.includes('http://') ||
    lower.includes('https://') ||
    lower.includes('ws://') ||
    lower.includes('wss://') ||
    lower.includes('2ksports') ||
    lower.includes('2k.com') ||
    lower.includes('session') ||
    lower.includes('manifest') ||
    lower.includes('service') ||
    lower.includes('server') ||
    lower.includes('roster') ||
    lower.includes('sync') ||
    lower.includes('match') ||
    lower.includes('park') ||
    lower.includes('account') ||
    lower.includes('profile') ||
    lower.includes('version') ||
    lower.includes('environment') ||
    lower.includes('sku') ||
    lower.includes('vcfield') ||
    lower.includes('gzip')
  );
}

function extractRelevantAsciiStrings(buffer, baseOffset = 0, options = {}) {
  const minimumLength =
    options.minimumLength === undefined ? 6 : Number(options.minimumLength);
  const maximumLength =
    options.maximumLength === undefined ? 256 : Number(options.maximumLength);
  const maximumMatches =
    options.maximumMatches === undefined
      ? MAX_PROTOCOL_STRINGS
      : Number(options.maximumMatches);

  const results = [];
  let start = -1;

  function finish(end) {
    if (start < 0) return;
    const length = end - start;
    if (length >= minimumLength) {
      const raw = buffer.subarray(start, end);
      const text = raw
        .subarray(0, Math.min(raw.length, maximumLength))
        .toString('ascii');
      if (looksProtocolRelevant(text)) {
        results.push({
          offset: baseOffset + start,
          length,
          text,
          truncated: length > maximumLength,
        });
      }
    }
    start = -1;
  }

  for (let i = 0; i < buffer.length; i += 1) {
    if (isPrintableAscii(buffer[i])) {
      if (start < 0) start = i;
    } else {
      finish(i);
      if (results.length >= maximumMatches) break;
    }
  }
  finish(buffer.length);

  return results.slice(0, maximumMatches);
}

function scoreReferenceFieldListCandidate(buffer, absoluteOffset) {
  const parsed = tryParseFieldList(buffer, {
    maximumFields: 4096,
    autoGunzip: true,
  });

  if (!parsed.ok) {
    return {
      offset: absoluteOffset,
      compatible: false,
      error: parsed.error.message,
    };
  }

  const value = parsed.parsed;
  const knownTypes = value.records.filter(
    (record) => record.typeName !== 'UNKNOWN',
  ).length;

  return {
    offset: absoluteOffset,
    compatible: true,
    evidenceClass: 'CROSS_VERSION_REFERENCE_CANDIDATE',
    fieldCount: value.fieldCount,
    knownReferenceTypes: knownTypes,
    dataOffset: value.dataOffset,
    decodedSize: value.decodedSize,
    compressed: value.compressed,
    note:
      'A strict reference-codec parse is only a candidate match; it is not proof of NBA 2K17 framing.',
  };
}

function scanReferenceFieldListCandidates(buffer, baseOffset = 0, options = {}) {
  const maximumCandidates =
    options.maximumCandidates === undefined ? 32 : Number(options.maximumCandidates);
  const maximumSlice =
    options.maximumSlice === undefined ? 512 * 1024 : Number(options.maximumSlice);
  const stride =
    options.stride === undefined ? 16 : Number(options.stride);

  const results = [];

  for (let offset = 0; offset + 16 <= buffer.length; offset += stride) {
    const remaining = buffer.length - offset;
    const sliceLength = Math.min(remaining, maximumSlice);
    if (sliceLength < 16) break;

    const candidate = scoreReferenceFieldListCandidate(
      buffer.subarray(offset, offset + sliceLength),
      baseOffset + offset,
    );

    if (
      candidate.compatible &&
      (candidate.fieldCount > 0 || candidate.compressed)
    ) {
      results.push(candidate);
      if (results.length >= maximumCandidates) break;
    }
  }

  return results;
}

function analyzeBuffer(buffer, options = {}) {
  if (!Buffer.isBuffer(buffer)) throw new TypeError('artifact buffer must be a Buffer');

  const windowSize =
    options.windowSize === undefined ? DEFAULT_WINDOW : Number(options.windowSize);

  const entropy = [];
  for (let offset = 0; offset < buffer.length; offset += windowSize) {
    const slice = buffer.subarray(offset, Math.min(buffer.length, offset + windowSize));
    entropy.push({
      offset,
      length: slice.length,
      entropy: Number(shannonEntropy(slice).toFixed(6)),
    });
  }

  return {
    byteSize: buffer.length,
    sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
    magic: scanMagic(buffer, 0),
    relevantStrings: extractRelevantAsciiStrings(buffer, 0, options),
    entropy,
    referenceFieldListCandidates: scanReferenceFieldListCandidates(
      buffer,
      0,
      options,
    ),
  };
}

function analyzeFile(filePath, options = {}) {
  const absolute = path.resolve(filePath);
  const stat = fs.statSync(absolute);
  if (!stat.isFile()) throw new Error('artifact path must point to a regular file');

  const chunkSize =
    options.chunkSize === undefined ? DEFAULT_CHUNK : Number(options.chunkSize);
  const windowSize =
    options.windowSize === undefined ? DEFAULT_WINDOW : Number(options.windowSize);

  if (!Number.isSafeInteger(chunkSize) || chunkSize < 4096) {
    throw new RangeError('chunkSize must be an integer >= 4096');
  }
  if (!Number.isSafeInteger(windowSize) || windowSize < 256) {
    throw new RangeError('windowSize must be an integer >= 256');
  }

  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(absolute, 'r');
  const buffer = Buffer.allocUnsafe(chunkSize);
  const magic = [];
  const relevantStrings = [];
  const entropy = [];
  const referenceFieldListCandidates = [];
  let position = 0;
  let carry = Buffer.alloc(0);

  try {
    while (true) {
      const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;

      const chunk = Buffer.from(buffer.subarray(0, bytesRead));
      hash.update(chunk);

      const combined = carry.length
        ? Buffer.concat([carry, chunk])
        : chunk;
      const combinedBase = position - carry.length;

      magic.push(...scanMagic(combined, combinedBase));

      if (relevantStrings.length < MAX_PROTOCOL_STRINGS) {
        relevantStrings.push(
          ...extractRelevantAsciiStrings(combined, combinedBase, {
            ...options,
            maximumMatches:
              MAX_PROTOCOL_STRINGS - relevantStrings.length,
          }),
        );
      }

      for (
        let local = 0;
        local < chunk.length;
        local += windowSize
      ) {
        const slice = chunk.subarray(
          local,
          Math.min(chunk.length, local + windowSize),
        );
        entropy.push({
          offset: position + local,
          length: slice.length,
          entropy: Number(shannonEntropy(slice).toFixed(6)),
        });
      }

      if (referenceFieldListCandidates.length < 32) {
        const probe = chunk.subarray(0, Math.min(chunk.length, 512 * 1024));
        referenceFieldListCandidates.push(
          ...scanReferenceFieldListCandidates(probe, position, {
            ...options,
            maximumCandidates:
              32 - referenceFieldListCandidates.length,
          }),
        );
      }

      carry = combined.subarray(
        Math.max(0, combined.length - 512),
      );
      position += bytesRead;
    }
  } finally {
    fs.closeSync(fd);
  }

  const uniqueMagic = [];
  const seenMagic = new Set();
  for (const match of magic) {
    const key = match.name + ':' + match.offset;
    if (seenMagic.has(key)) continue;
    seenMagic.add(key);
    uniqueMagic.push(match);
  }

  const uniqueStrings = [];
  const seenStrings = new Set();
  for (const match of relevantStrings) {
    const key = match.offset + ':' + match.text;
    if (seenStrings.has(key)) continue;
    seenStrings.add(key);
    uniqueStrings.push(match);
  }

  return {
    schema: '2k17-compat-lab.cache-structure-report.v1',
    basename: path.basename(absolute),
    byteSize: stat.size,
    sha256: hash.digest('hex'),
    analysisMode: 'READ_ONLY_STREAMING',
    windowSize,
    chunkSize,
    magic: uniqueMagic,
    relevantStrings: uniqueStrings.slice(0, MAX_PROTOCOL_STRINGS),
    entropy,
    referenceFieldListCandidates,
    referenceCodecEvidenceClass: 'CROSS_VERSION_REFERENCE',
    claimsPromoted: [],
  };
}

module.exports = {
  MAGIC_SIGNATURES,
  shannonEntropy,
  scanMagic,
  extractRelevantAsciiStrings,
  scanReferenceFieldListCandidates,
  analyzeBuffer,
  analyzeFile,
};
