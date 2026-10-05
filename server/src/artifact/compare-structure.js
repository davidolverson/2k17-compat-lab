'use strict';

function byKey(items, keyFn) {
  const map = new Map();
  for (const item of items || []) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, item);
  }
  return map;
}

function compareStructureReports(left, right) {
  if (!left || !right) {
    throw new TypeError('two structure reports are required');
  }

  const leftMagic = byKey(
    left.magic,
    (item) => item.name + ':' + item.offset,
  );
  const rightMagic = byKey(
    right.magic,
    (item) => item.name + ':' + item.offset,
  );

  const sharedMagic = [];
  const leftOnlyMagic = [];
  const rightOnlyMagic = [];

  for (const [key, item] of leftMagic) {
    if (rightMagic.has(key)) sharedMagic.push(item);
    else leftOnlyMagic.push(item);
  }
  for (const [key, item] of rightMagic) {
    if (!leftMagic.has(key)) rightOnlyMagic.push(item);
  }

  const leftStrings = byKey(
    left.relevantStrings,
    (item) => item.text,
  );
  const rightStrings = byKey(
    right.relevantStrings,
    (item) => item.text,
  );

  const sharedStrings = [];
  const leftOnlyStrings = [];
  const rightOnlyStrings = [];

  for (const [text, item] of leftStrings) {
    if (rightStrings.has(text)) {
      sharedStrings.push({
        text,
        leftOffset: item.offset,
        rightOffset: rightStrings.get(text).offset,
      });
    } else {
      leftOnlyStrings.push(item);
    }
  }

  for (const [text, item] of rightStrings) {
    if (!leftStrings.has(text)) rightOnlyStrings.push(item);
  }

  const leftEntropy = left.entropy || [];
  const rightEntropy = right.entropy || [];
  const entropyWindows = [];
  const count = Math.min(leftEntropy.length, rightEntropy.length);

  for (let i = 0; i < count; i += 1) {
    entropyWindows.push({
      index: i,
      leftOffset: leftEntropy[i].offset,
      rightOffset: rightEntropy[i].offset,
      leftEntropy: leftEntropy[i].entropy,
      rightEntropy: rightEntropy[i].entropy,
      delta: Number(
        Math.abs(
          leftEntropy[i].entropy - rightEntropy[i].entropy,
        ).toFixed(6),
      ),
    });
  }

  return {
    schema: '2k17-compat-lab.cache-structure-comparison.v1',
    left: {
      basename: left.basename,
      byteSize: left.byteSize,
      sha256: left.sha256,
    },
    right: {
      basename: right.basename,
      byteSize: right.byteSize,
      sha256: right.sha256,
    },
    sizeDelta: right.byteSize - left.byteSize,
    sha256Equal: left.sha256 === right.sha256,
    magic: {
      shared: sharedMagic,
      leftOnly: leftOnlyMagic,
      rightOnly: rightOnlyMagic,
    },
    protocolStrings: {
      shared: sharedStrings,
      leftOnly: leftOnlyStrings,
      rightOnly: rightOnlyStrings,
    },
    entropyWindows,
    referenceCodecCandidateCounts: {
      left: (left.referenceFieldListCandidates || []).length,
      right: (right.referenceFieldListCandidates || []).length,
    },
    claimsPromoted: [],
    note:
      'Structural differences are observations about these artifacts only; they do not identify protocol semantics without independent evidence.',
  };
}

module.exports = {
  compareStructureReports,
};
