'use strict';

const fs = require('node:fs');
const path = require('node:path');

function keyOf(route) {
  return String(route.method || '') + ' ' + String(route.path || '');
}

function setDiff(left = [], right = []) {
  const l = new Set(left);
  return right.filter((item) => !l.has(item));
}

function compareProbeSummaries(before, after) {
  const left = new Map((before.routes || []).map((route) => [keyOf(route), route]));
  const right = new Map((after.routes || []).map((route) => [keyOf(route), route]));

  const newRoutes = [];
  const disappearedRoutes = [];
  const changedRoutes = [];

  for (const [key, route] of right) {
    if (!left.has(key)) {
      newRoutes.push({
        method: route.method,
        path: route.path,
        count: route.count,
        responseLabels: route.responseLabels || [],
      });
      continue;
    }

    const prior = left.get(key);
    const change = {
      method: route.method,
      path: route.path,
      countBefore: prior.count || 0,
      countAfter: route.count || 0,
      countDelta: (route.count || 0) - (prior.count || 0),
      newBodyLengths: setDiff(
        prior.bodyLengths || [],
        route.bodyLengths || [],
      ),
      newResponseLabels: setDiff(
        prior.responseLabels || [],
        route.responseLabels || [],
      ),
      fallbackDelta:
        (route.fallbackLikeResponses || 0) -
        (prior.fallbackLikeResponses || 0),
      truncationDelta:
        (route.truncatedBodies || 0) -
        (prior.truncatedBodies || 0),
    };

    if (
      change.countDelta !== 0 ||
      change.newBodyLengths.length ||
      change.newResponseLabels.length ||
      change.fallbackDelta !== 0 ||
      change.truncationDelta !== 0
    ) {
      changedRoutes.push(change);
    }
  }

  for (const [key, route] of left) {
    if (!right.has(key)) {
      disappearedRoutes.push({
        method: route.method,
        path: route.path,
        count: route.count,
      });
    }
  }

  return {
    schema: '2k17-compat-lab.probe-summary-diff.v1',
    evidenceClass: 'LOCAL_LOG_COMPARISON',
    before: {
      httpRequests: before.httpRequests || 0,
      uniqueRoutes: before.uniqueRoutes || 0,
    },
    after: {
      httpRequests: after.httpRequests || 0,
      uniqueRoutes: after.uniqueRoutes || 0,
    },
    newRoutes,
    disappearedRoutes,
    changedRoutes,
    claimsPromoted: [],
    note:
      'Differences identify changed observations only. They do not assign protocol semantics or causality.',
  };
}

function main(argv = process.argv.slice(2)) {
  const [beforePath, afterPath, outputPath] = argv;

  if (!beforePath || !afterPath) {
    process.stderr.write(
      'Usage: node scripts/diff-probe-summaries.js <before.summary.json> <after.summary.json> [output.json]\n',
    );
    return 2;
  }

  const before = JSON.parse(
    fs.readFileSync(path.resolve(beforePath), 'utf8'),
  );
  const after = JSON.parse(
    fs.readFileSync(path.resolve(afterPath), 'utf8'),
  );

  const diff = compareProbeSummaries(before, after);
  const output = outputPath
    ? path.resolve(outputPath)
    : path.join(
        process.cwd(),
        'server',
        'captures',
        'probe-summary-local',
        'diff-' + Date.now() + '.json',
      );

  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(diff, null, 2) + '\n');

  process.stdout.write(
    'PROBE_DIFF_READY\n' +
      'NEW_ROUTES ' + diff.newRoutes.length + '\n' +
      'DISAPPEARED_ROUTES ' + diff.disappearedRoutes.length + '\n' +
      'CHANGED_ROUTES ' + diff.changedRoutes.length + '\n' +
      'CLAIMS_PROMOTED 0\n' +
      'OUTPUT ' + output + '\n',
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

module.exports = {
  keyOf,
  setDiff,
  compareProbeSummaries,
  main,
};
