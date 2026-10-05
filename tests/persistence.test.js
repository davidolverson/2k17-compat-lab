'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  MAGIC,
  findBundle,
  extractExactBundle,
} = require('../server/src/persistence/user-content-bundle');
const {
  ByteExactContentStore,
  sha256,
} = require('../server/src/persistence/byte-exact-store');

module.exports = function registerPersistenceTests({ test, assert }) {
  test('2K17-reported BNH! bundle is parsed structurally without semantic promotion', () => {
    const payload = Buffer.from('synthetic-save-payload', 'ascii');
    const header = Buffer.alloc(8);
    header.write('BNH!', 0, 'ascii');
    header.writeUInt32LE(payload.length, 4);
    const raw = Buffer.concat([
      Buffer.from([1, 2, 3]),
      header,
      payload,
      Buffer.from([9, 9]),
    ]);

    const info = findBundle(raw);

    assert.equal(info.found, true);
    assert.equal(info.magic, 'BNH!');
    assert.equal(info.offset, 3);
    assert.equal(info.payloadLength, payload.length);
    assert.equal(info.complete, true);
    assert.equal(
      info.provenance.evidenceClass,
      'USER_REPORTED_MODIFIED_CLIENT_OBSERVATION',
    );
    assert.deepEqual(info.claimsPromoted, []);
    assert.equal(
      MAGIC['BNH"'].evidenceClass,
      'CROSS_VERSION_REFERENCE',
    );
  });

  test('bundle extractor rejects an incomplete declared payload', () => {
    const raw = Buffer.alloc(12);
    raw.write('BNH!', 0, 'ascii');
    raw.writeUInt32LE(1000, 4);

    assert.throws(
      () => extractExactBundle(raw),
      /exceeds available bytes/,
    );
  });

  test('byte-exact store survives reopen with identical SHA-256', () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), '2k17-byte-store-'),
    );

    try {
      const body = Buffer.from(
        'persistent synthetic user content',
        'ascii',
      );
      const expected = sha256(body);

      const first = new ByteExactContentStore(root);
      first.put('slot-1', body, {
        evidenceClass: 'SYNTHETIC_TEST',
      });

      const second = new ByteExactContentStore(root);
      const reopened = second.get('slot-1');

      assert.deepEqual(reopened.body, body);
      assert.equal(reopened.record.sha256, expected);
      assert.deepEqual(reopened.record.claimsPromoted, []);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('byte-exact store detects body tampering on reopen', () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), '2k17-byte-store-tamper-'),
    );

    try {
      const store = new ByteExactContentStore(root);
      const stored = store.put(
        'slot-2',
        Buffer.from('original', 'ascii'),
      );
      fs.writeFileSync(stored.bodyPath, Buffer.from('changed!', 'ascii'));

      const reopened = new ByteExactContentStore(root);
      assert.throws(
        () => reopened.get('slot-2'),
        /does not match metadata/,
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
};
