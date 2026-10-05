'use strict';

const fs = require('node:fs');
const path = require('node:path');

module.exports = function registerPublicEvidenceTests({ test, assert }) {
  function load(relativePath) {
    return JSON.parse(
      fs.readFileSync(
        path.join(__dirname, '..', relativePath),
        'utf8',
      ),
    );
  }

  test('evidence ledger has unique ordered E-ids and concrete sources', () => {
    const ledger = load('evidence/ledger.json');
    assert.equal(
      ledger.schema,
      '2k17-compat-lab.evidence-ledger.v1',
    );
    assert.ok(Array.isArray(ledger.entries));
    assert.ok(ledger.entries.length >= 12);

    const ids = ledger.entries.map((entry) => entry.id);
    assert.equal(new Set(ids).size, ids.length);

    for (const entry of ledger.entries) {
      assert.match(entry.id, /^E\d{3}$/);
      assert.ok(entry.claim);
      assert.ok(entry.evidenceClass);
      assert.ok(entry.confidence);
      assert.ok(Array.isArray(entry.sources));
      assert.ok(entry.sources.length >= 1);
      for (const source of entry.sources) {
        assert.ok(source.kind);
        assert.ok(source.locator);
      }
    }
  });

  test('public source catalog has unique P-ids and https/GitHub locators', () => {
    const catalog = load('research/public-source-catalog.json');
    assert.equal(
      catalog.schema,
      '2k17-compat-lab.public-source-catalog.v1',
    );
    assert.ok(Array.isArray(catalog.sources));
    assert.ok(catalog.sources.length >= 8);

    const ids = catalog.sources.map((source) => source.id);
    assert.equal(new Set(ids).size, ids.length);

    for (const source of catalog.sources) {
      assert.match(source.id, /^P\d{3}$/);
      assert.ok(source.title);
      assert.match(source.url, /^https:\/\//);
      assert.ok(source.evidenceClass);
      assert.ok(source.confidence);
      assert.ok(Array.isArray(source.claims));
      assert.ok(source.claims.length >= 1);
    }
  });

  test('self-test fixture remains isolated in the evidence ledger', () => {
    const ledger = load('evidence/ledger.json');
    const selftest = ledger.entries.find((entry) => entry.id === 'E004');

    assert.ok(selftest);
    assert.equal(selftest.evidenceClass, 'INSTRUMENT_SELFTEST');
    assert.match(selftest.claim, /self-test traffic/i);
  });

  test('Granite framing remains cross-version reference only', () => {
    const ledger = load('evidence/ledger.json');
    const granite = ledger.entries.find((entry) => entry.id === 'E005');

    assert.ok(granite);
    assert.equal(granite.evidenceClass, 'CROSS_VERSION_REFERENCE');
    assert.match(granite.notes, /not evidence that NBA 2K17/i);
  });

  test('Mission 6 architecture claims stay public-source, not observed', () => {
    const ledger = load('evidence/ledger.json');

    for (const id of ['E006', 'E007', 'E008', 'E009', 'E010', 'E011', 'E012']) {
      const entry = ledger.entries.find((item) => item.id === id);
      assert.ok(entry, 'missing ' + id);
      assert.equal(entry.evidenceClass, 'PUBLIC_2K17_SOURCE');
      assert.notEqual(entry.evidenceClass, 'OBSERVED_2K17');
    }
  });
};
