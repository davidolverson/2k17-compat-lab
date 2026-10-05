'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  createMetadata,
} = require('../scripts/hash-cache-artifact');

module.exports = function registerCacheArtifactTests({ test, assert }) {
  test('cache artifact hasher emits metadata only', () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), '2k17-cache-artifact-test-'),
    );

    try {
      const filePath = path.join(root, 'SYNC.BIN');
      fs.writeFileSync(filePath, Buffer.from('synthetic-cache-artifact'));

      const metadata = createMetadata(
        filePath,
        'AUTHORIZED',
        'synthetic unit-test artifact',
      );

      assert.equal(
        metadata.schema,
        '2k17-compat-lab.cache-artifact-metadata.v1',
      );
      assert.match(metadata.artifactId, /^ART-[0-9A-F]{20}$/);
      assert.equal(metadata.basename, 'SYNC.BIN');
      assert.equal(
        metadata.byteSize,
        Buffer.byteLength('synthetic-cache-artifact'),
      );
      assert.match(metadata.sha256, /^[0-9a-f]{64}$/);
      assert.equal(metadata.authorizationStatus, 'AUTHORIZED');
      assert.equal(metadata.contentCommitted, false);

      for (const forbidden of [
        'body',
        'content',
        'bytes',
        'hex',
        'base64',
        'absolutePath',
      ]) {
        assert.equal(
          Object.prototype.hasOwnProperty.call(metadata, forbidden),
          false,
        );
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('cache artifact hasher rejects unsupported authorization labels', () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), '2k17-cache-artifact-auth-test-'),
    );

    try {
      const filePath = path.join(root, 'artifact.bin');
      fs.writeFileSync(filePath, Buffer.from('x'));

      let failure = null;
      try {
        createMetadata(filePath, 'TRUST_ME', 'bad test');
      } catch (error) {
        failure = error;
      }

      assert.ok(failure);
      assert.match(
        failure.message,
        /AUTHORIZED or UNVERIFIED/,
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('Mission 7 ledger entries remain public evidence, not observed protocol', () => {
    const ledger = JSON.parse(
      fs.readFileSync(
        path.join(__dirname, '..', 'evidence', 'ledger.json'),
        'utf8',
      ),
    );

    for (const id of ['E013', 'E014', 'E015', 'E016']) {
      const entry = ledger.entries.find((item) => item.id === id);
      assert.ok(entry, 'missing ' + id);
      assert.equal(entry.evidenceClass, 'PUBLIC_2K17_SOURCE');
      assert.notEqual(entry.evidenceClass, 'OBSERVED_2K17');
    }
  });

  test('SYNC.BIN artifact evidence does not claim a decoded format', () => {
    const ledger = JSON.parse(
      fs.readFileSync(
        path.join(__dirname, '..', 'evidence', 'ledger.json'),
        'utf8',
      ),
    );

    const entries = ['E013', 'E015', 'E016'].map((id) =>
      ledger.entries.find((entry) => entry.id === id),
    );

    const text = entries
      .map((entry) => entry.claim + ' ' + entry.notes)
      .join(' ');

    assert.doesNotMatch(text, /OBSERVED_2K17/);
    assert.doesNotMatch(text, /VcFieldList is confirmed/i);
    assert.doesNotMatch(text, /raw HTTP response/i);
  });
};
