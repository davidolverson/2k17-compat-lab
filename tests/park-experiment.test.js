'use strict';

const {
  validateSpec,
  buildRecord,
} = require('../scripts/record-park-experiment');

module.exports = function registerParkExperimentTests({ test, assert }) {
  const before = {
    httpRequests: 1,
    uniqueRoutes: 1,
    routes: [
      {
        method: 'POST',
        path: '/park/summary',
        count: 1,
        bodyLengths: [16],
        responseLabels: ['baseline'],
        fallbackLikeResponses: 0,
        truncatedBodies: 0,
      },
    ],
  };

  const after = {
    httpRequests: 2,
    uniqueRoutes: 2,
    routes: [
      {
        method: 'POST',
        path: '/park/summary',
        count: 1,
        bodyLengths: [16],
        responseLabels: ['candidate'],
        fallbackLikeResponses: 0,
        truncatedBodies: 0,
      },
      {
        method: 'POST',
        path: '/park/next',
        count: 1,
        bodyLengths: [8],
        responseLabels: ['capture-only'],
        fallbackLikeResponses: 0,
        truncatedBodies: 0,
      },
    ],
  };

  test('Park experiment record enforces one named variable and stays claim-neutral', () => {
    const record = buildRecord(
      {
        hypothesis: 'H1',
        variable: {
          name: 'park-summary-response-profile',
          before: 'baseline',
          after: 'candidate-v1',
        },
        serverCommit: 'abc123',
        clientState: 'Park loading',
        loadPercentBefore: 30,
        loadPercentAfter: 42,
        outcome: 'ADVANCED',
        observation: 'Loader advanced and a new route appeared.',
      },
      before,
      after,
    );

    assert.equal(record.hypothesis.id, 'H1');
    assert.equal(record.variable.name, 'park-summary-response-profile');
    assert.equal(record.probeDiff.newRoutes.length, 1);
    assert.equal(record.loadPercentAfter, 42);
    assert.deepEqual(record.claimsPromoted, []);
    assert.match(record.note, /does not by itself prove/i);
  });

  test('Park experiment spec rejects extra variable dimensions', () => {
    assert.throws(
      () =>
        validateSpec({
          hypothesis: 'H1',
          variable: {
            name: 'profile',
            before: 'a',
            after: 'b',
            relay: 'also changed',
          },
          serverCommit: 'abc123',
          outcome: 'NO_CHANGE',
        }),
      /exactly name, before, and after/,
    );
  });

  test('Park experiment spec rejects unchanged variable', () => {
    assert.throws(
      () =>
        validateSpec({
          hypothesis: 'H4',
          variable: {
            name: 'relay-profile',
            before: 'same',
            after: 'same',
          },
          serverCommit: 'abc123',
          outcome: 'NO_CHANGE',
        }),
      /must actually change/,
    );
  });
  test('Park experiment spec rejects structured before/after values that can hide multiple changes', () => {
    assert.throws(
      () =>
        validateSpec({
          hypothesis: 'H3',
          variable: {
            name: 'lobby-profile',
            before: { joinable: false, limit: 0 },
            after: { joinable: true, limit: 10 },
          },
          serverCommit: 'abcdef1',
          outcome: 'NO_CHANGE',
        }),
      /must be scalar/,
    );
  });

  test('Park experiment spec requires an exact commit SHA', () => {
    assert.throws(
      () =>
        validateSpec({
          hypothesis: 'H3',
          variable: {
            name: 'lobby-profile',
            before: 'baseline',
            after: 'candidate',
          },
          serverCommit: 'latest',
          outcome: 'NO_CHANGE',
        }),
      /commit SHA/,
    );
  });

};
