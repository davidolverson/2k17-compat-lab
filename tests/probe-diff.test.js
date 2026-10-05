'use strict';

const {
  compareProbeSummaries,
} = require('../scripts/diff-probe-summaries');

module.exports = function registerProbeDiffTests({ test, assert }) {
  test('probe diff isolates new and changed routes without claiming causality', () => {
    const before = {
      httpRequests: 2,
      uniqueRoutes: 2,
      routes: [
        {
          method: 'POST',
          path: '/park/summary',
          count: 1,
          bodyLengths: [16],
          responseLabels: ['park-v1'],
          fallbackLikeResponses: 0,
          truncatedBodies: 0,
        },
        {
          method: 'POST',
          path: '/old',
          count: 1,
          bodyLengths: [8],
          responseLabels: ['old'],
          fallbackLikeResponses: 0,
          truncatedBodies: 0,
        },
      ],
    };

    const after = {
      httpRequests: 4,
      uniqueRoutes: 2,
      routes: [
        {
          method: 'POST',
          path: '/park/summary',
          count: 3,
          bodyLengths: [16, 32],
          responseLabels: ['park-v1', 'park-v2'],
          fallbackLikeResponses: 0,
          truncatedBodies: 0,
        },
        {
          method: 'POST',
          path: '/new',
          count: 1,
          bodyLengths: [4],
          responseLabels: ['new-handler'],
          fallbackLikeResponses: 0,
          truncatedBodies: 0,
        },
      ],
    };

    const diff = compareProbeSummaries(before, after);

    assert.equal(diff.newRoutes.length, 1);
    assert.equal(diff.disappearedRoutes.length, 1);
    assert.equal(diff.changedRoutes.length, 1);
    assert.equal(diff.changedRoutes[0].countDelta, 2);
    assert.deepEqual(diff.changedRoutes[0].newBodyLengths, [32]);
    assert.deepEqual(diff.changedRoutes[0].newResponseLabels, ['park-v2']);
    assert.deepEqual(diff.claimsPromoted, []);
    assert.match(diff.note, /do not assign protocol semantics or causality/i);
  });
};
