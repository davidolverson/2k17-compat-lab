'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  extractExactBundle,
} = require('../server/src/persistence/user-content-bundle');
const {
  ByteExactContentStore,
  sha256,
} = require('../server/src/persistence/byte-exact-store');

function main(argv = process.argv.slice(2)) {
  const input = argv[0];
  const storeRoot =
    argv[1] ||
    path.join(
      process.cwd(),
      'server',
      'captures',
      'persistence-roundtrip-local',
    );

  if (!input) {
    process.stderr.write(
      'Usage: node scripts/test-user-content-roundtrip.js <captured-upload.bin> [store-dir]\n',
    );
    return 2;
  }

  const raw = fs.readFileSync(path.resolve(input));
  const extracted = extractExactBundle(raw);
  const sourceHash = sha256(extracted.bytes);
  const key = sourceHash.slice(0, 24);

  const writer = new ByteExactContentStore(storeRoot);
  const stored = writer.put(key, extracted.bytes, {
    evidenceClass: extracted.info.provenance.evidenceClass,
    source: {
      basename: path.basename(input),
      bundleMagic: extracted.info.magic,
      bundleOffset: extracted.info.offset,
      bundlePayloadLength: extracted.info.payloadLength,
    },
  });

  // New instance simulates reopening the storage layer after a server restart.
  const reader = new ByteExactContentStore(storeRoot);
  const reopened = reader.get(key);
  const reopenedHash = sha256(reopened.body);

  if (!reopened.body.equals(extracted.bytes)) {
    throw new Error('byte-exact round trip failed');
  }
  if (reopenedHash !== sourceHash) {
    throw new Error('round-trip SHA-256 mismatch');
  }

  process.stdout.write(
    'USER_CONTENT_ROUNDTRIP_PASS\n' +
      'MAGIC ' + extracted.info.magic + '\n' +
      'EVIDENCE_CLASS ' + extracted.info.provenance.evidenceClass + '\n' +
      'BUNDLE_OFFSET ' + extracted.info.offset + '\n' +
      'BUNDLE_BYTES ' + extracted.bytes.length + '\n' +
      'SHA256 ' + sourceHash + '\n' +
      'STORE_KEY ' + key + '\n' +
      'CLAIMS_PROMOTED 0\n' +
      'STORE_METADATA ' + stored.metadata + '\n',
  );

  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    process.stderr.write(
      (error && error.stack ? error.stack : String(error)) + '\n',
    );
    process.exitCode = 1;
  }
}

module.exports = { main };
