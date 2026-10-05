'use strict';

const {
  compareStructureReports,
} = require('../server/src/artifact/compare-structure');

module.exports = function registerParallelPipelineTests({ test, assert }) {
  test('structure comparator separates shared and changed protocol strings', () => {
    const left = {
      basename: 'SYNC-A.BIN',
      byteSize: 100,
      sha256: 'a'.repeat(64),
      magic: [
        { name: 'gzip', offset: 10 },
        { name: 'zip-local-file', offset: 50 },
      ],
      relevantStrings: [
        { text: 'https://example.invalid/service', offset: 20 },
        { text: 'version=1', offset: 40 },
      ],
      entropy: [
        { offset: 0, entropy: 1.0 },
        { offset: 64, entropy: 7.0 },
      ],
      referenceFieldListCandidates: [],
    };

    const right = {
      basename: 'SYNC-B.BIN',
      byteSize: 120,
      sha256: 'b'.repeat(64),
      magic: [
        { name: 'gzip', offset: 10 },
        { name: '7z', offset: 80 },
      ],
      relevantStrings: [
        { text: 'https://example.invalid/service', offset: 24 },
        { text: 'version=2', offset: 48 },
      ],
      entropy: [
        { offset: 0, entropy: 1.25 },
        { offset: 64, entropy: 6.5 },
      ],
      referenceFieldListCandidates: [{}],
    };

    const comparison = compareStructureReports(left, right);

    assert.equal(comparison.sizeDelta, 20);
    assert.equal(comparison.sha256Equal, false);
    assert.equal(comparison.magic.shared.length, 1);
    assert.equal(comparison.magic.leftOnly.length, 1);
    assert.equal(comparison.magic.rightOnly.length, 1);
    assert.equal(comparison.protocolStrings.shared.length, 1);
    assert.equal(comparison.protocolStrings.leftOnly.length, 1);
    assert.equal(comparison.protocolStrings.rightOnly.length, 1);
    assert.equal(
      comparison.referenceCodecCandidateCounts.right,
      1,
    );
    assert.deepEqual(comparison.claimsPromoted, []);
  });

  test('structure comparator does not infer protocol semantics from differences', () => {
    const report = {
      basename: 'A',
      byteSize: 1,
      sha256: 'c'.repeat(64),
      magic: [],
      relevantStrings: [],
      entropy: [],
      referenceFieldListCandidates: [],
    };

    const comparison = compareStructureReports(report, {
      ...report,
      basename: 'B',
      sha256: 'd'.repeat(64),
    });

    assert.deepEqual(comparison.claimsPromoted, []);
    assert.match(
      comparison.note,
      /do not identify protocol semantics/i,
    );
  });
};
