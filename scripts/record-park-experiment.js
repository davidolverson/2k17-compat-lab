'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {
  compareProbeSummaries,
} = require('./diff-probe-summaries');

const HYPOTHESES = Object.freeze({
  H1: 'Response-data deficiency',
  H2: 'Missing service-directory entry',
  H3: 'Lobby-state dependency',
  H4: 'Relay-state dependency',
  H5: 'Multiple dependencies',
});

const OUTCOMES = new Set([
  'ADVANCED',
  'REGRESSED',
  'NEW_REQUEST',
  'NEW_SOCKET',
  'DISTINCT_ERROR',
  'NO_CHANGE',
  'INCONCLUSIVE',
]);

function sha256Text(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function validateSpec(spec) {
  if (!spec || typeof spec !== 'object') {
    throw new TypeError('Park experiment spec must be an object');
  }

  if (!Object.prototype.hasOwnProperty.call(HYPOTHESES, spec.hypothesis)) {
    throw new Error(
      'hypothesis must be one of ' + Object.keys(HYPOTHESES).join(', '),
    );
  }

  if (!spec.variable || typeof spec.variable !== 'object') {
    throw new Error('exactly one experiment variable is required');
  }

  const keys = Object.keys(spec.variable).sort();
  const allowed = ['after', 'before', 'name'];
  if (
    keys.length !== allowed.length ||
    keys.some((key, index) => key !== allowed[index])
  ) {
    throw new Error(
      'variable must contain exactly name, before, and after',
    );
  }

  if (!String(spec.variable.name || '').trim()) {
    throw new Error('variable.name is required');
  }

  const scalarTypes = new Set(['string', 'number', 'boolean']);
  if (
    !scalarTypes.has(typeof spec.variable.before) ||
    !scalarTypes.has(typeof spec.variable.after)
  ) {
    throw new Error(
      'variable.before and variable.after must be scalar string/number/boolean values',
    );
  }

  if (spec.variable.before === spec.variable.after) {
    throw new Error('experiment variable must actually change');
  }

  if (!OUTCOMES.has(spec.outcome)) {
    throw new Error(
      'outcome must be one of ' + Array.from(OUTCOMES).join(', '),
    );
  }

  const commit = String(spec.serverCommit || '').trim();
  if (!/^[0-9a-f]{7,40}$/i.test(commit)) {
    throw new Error('serverCommit must be an exact 7-40 character hexadecimal commit SHA');
  }

  return spec;
}

function buildRecord(spec, before, after) {
  validateSpec(spec);
  const diff = compareProbeSummaries(before, after);

  return {
    schema: '2k17-compat-lab.park-experiment.v1',
    recordedAtUtc: new Date().toISOString(),
    hypothesis: {
      id: spec.hypothesis,
      description: HYPOTHESES[spec.hypothesis],
    },
    variable: {
      name: String(spec.variable.name),
      before: spec.variable.before,
      after: spec.variable.after,
    },
    serverCommit: String(spec.serverCommit),
    clientState: spec.clientState || null,
    loadPercentBefore:
      spec.loadPercentBefore === undefined ? null : spec.loadPercentBefore,
    loadPercentAfter:
      spec.loadPercentAfter === undefined ? null : spec.loadPercentAfter,
    outcome: spec.outcome,
    observation: spec.observation || null,
    probeDiff: diff,
    claimsPromoted: [],
    note:
      'One-variable Park experiment record. A changed observation does not by itself prove the selected hypothesis.',
  };
}

function main(argv = process.argv.slice(2)) {
  const [specPath, beforePath, afterPath, ledgerPath] = argv;

  if (!specPath || !beforePath || !afterPath) {
    process.stderr.write(
      'Usage: node scripts/record-park-experiment.js <spec.json> <before.summary.json> <after.summary.json> [ledger.jsonl]\n',
    );
    return 2;
  }

  const specText = fs.readFileSync(path.resolve(specPath), 'utf8');
  const beforeText = fs.readFileSync(path.resolve(beforePath), 'utf8');
  const afterText = fs.readFileSync(path.resolve(afterPath), 'utf8');

  const spec = JSON.parse(specText);
  const before = JSON.parse(beforeText);
  const after = JSON.parse(afterText);
  const record = buildRecord(spec, before, after);

  record.inputs = {
    specSha256: sha256Text(specText),
    beforeSummarySha256: sha256Text(beforeText),
    afterSummarySha256: sha256Text(afterText),
  };

  const output = ledgerPath
    ? path.resolve(ledgerPath)
    : path.join(
        process.cwd(),
        'server',
        'captures',
        'park-experiments-local',
        'ledger.jsonl',
      );

  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.appendFileSync(output, JSON.stringify(record) + '\n');

  process.stdout.write(
    'PARK_EXPERIMENT_RECORDED\n' +
      'HYPOTHESIS ' + record.hypothesis.id + '\n' +
      'VARIABLE ' + record.variable.name + '\n' +
      'OUTCOME ' + record.outcome + '\n' +
      'NEW_ROUTES ' + record.probeDiff.newRoutes.length + '\n' +
      'CHANGED_ROUTES ' + record.probeDiff.changedRoutes.length + '\n' +
      'CLAIMS_PROMOTED 0\n' +
      'LEDGER ' + output + '\n',
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
  HYPOTHESES,
  OUTCOMES,
  validateSpec,
  buildRecord,
  main,
};
