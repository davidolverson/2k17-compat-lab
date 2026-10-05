'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function decodeBody(record) {
  if (!record || record.kind !== 'http.request') return null;
  if (record.bodyTruncated) return null;
  if (typeof record.bodyRaw !== 'string') return null;

  if (record.bodyEncoding === 'base64') {
    return Buffer.from(record.bodyRaw, 'base64');
  }

  if (record.bodyEncoding === 'utf8') {
    return Buffer.from(record.bodyRaw, 'utf8');
  }

  return null;
}

function fallbackLike(label) {
  return /default|catchall|ack|generic|placeholder/i.test(String(label || ''));
}

function summarizeRecords(records) {
  const routes = new Map();
  let httpRequests = 0;
  let gameAttributedRequests = 0;
  let truncatedBodies = 0;

  for (const record of records) {
    if (!record || record.kind !== 'http.request') continue;

    httpRequests += 1;
    if (record.levelBEvidence || record.attributedTo === 'NBA2K17') {
      gameAttributedRequests += 1;
    }
    if (record.bodyTruncated) truncatedBodies += 1;

    const method = String(record.method || 'UNKNOWN').toUpperCase();
    const routePath = String(record.path || '');
    const key = method + ' ' + routePath;
    const label =
      record.respondedWith && record.respondedWith.label
        ? String(record.respondedWith.label)
        : 'UNKNOWN';

    if (!routes.has(key)) {
      routes.set(key, {
        method,
        path: routePath,
        count: 0,
        firstSeq: record.seq ?? null,
        lastSeq: record.seq ?? null,
        bodyLengths: new Set(),
        bodySha256: new Set(),
        responseLabels: new Set(),
        responseStatuses: new Set(),
        attributedPids: new Set(),
        truncatedBodies: 0,
        fallbackLikeResponses: 0,
      });
    }

    const row = routes.get(key);
    row.count += 1;
    row.firstSeq = row.firstSeq === null ? (record.seq ?? null) : row.firstSeq;
    row.lastSeq = record.seq ?? row.lastSeq;

    if (Number.isSafeInteger(record.bodyLength)) {
      row.bodyLengths.add(record.bodyLength);
    }
    if (record.bodyTruncated) {
      row.truncatedBodies += 1;
    }

    const body = decodeBody(record);
    if (body) row.bodySha256.add(sha256(body));

    row.responseLabels.add(label);
    if (fallbackLike(label)) row.fallbackLikeResponses += 1;

    if (
      record.respondedWith &&
      Number.isSafeInteger(record.respondedWith.status)
    ) {
      row.responseStatuses.add(record.respondedWith.status);
    }

    if (Number.isSafeInteger(record.clientPid)) {
      row.attributedPids.add(record.clientPid);
    }
  }

  const routeRows = Array.from(routes.values())
    .map((row) => ({
      method: row.method,
      path: row.path,
      count: row.count,
      repeated: row.count > 1,
      firstSeq: row.firstSeq,
      lastSeq: row.lastSeq,
      bodyLengths: Array.from(row.bodyLengths).sort((a, b) => a - b),
      uniqueCompleteBodyHashes: row.bodySha256.size,
      responseLabels: Array.from(row.responseLabels).sort(),
      responseStatuses: Array.from(row.responseStatuses).sort((a, b) => a - b),
      attributedPids: Array.from(row.attributedPids).sort((a, b) => a - b),
      truncatedBodies: row.truncatedBodies,
      fallbackLikeResponses: row.fallbackLikeResponses,
      needsHandlerReview:
        row.fallbackLikeResponses > 0 || row.truncatedBodies > 0,
    }))
    .sort((a, b) => {
      if (a.path === b.path) return a.method.localeCompare(b.method);
      return a.path.localeCompare(b.path);
    });

  return {
    schema: '2k17-compat-lab.probe-route-summary.v1',
    evidenceClass: 'LOCAL_LOG_SUMMARY',
    httpRequests,
    gameAttributedRequests,
    truncatedBodies,
    uniqueRoutes: routeRows.length,
    routes: routeRows,
    claimsPromoted: [],
    note:
      'This report summarizes local probe observations only. Fallback-like labels are heuristic review flags, not protocol semantics.',
  };
}

function parseJsonl(text) {
  const records = [];
  const errors = [];

  String(text || '')
    .split(/\r?\n/)
    .forEach((line, index) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      try {
        records.push(JSON.parse(trimmed));
      } catch (error) {
        errors.push({
          line: index + 1,
          error: error.message,
        });
      }
    });

  return { records, errors };
}

function main(argv = process.argv.slice(2)) {
  const input = argv[0];
  const explicitOutput = argv[1];

  if (!input) {
    process.stderr.write(
      'Usage: node scripts/summarize-probe-log.js <probe.jsonl> [output.json]\n',
    );
    return 2;
  }

  const absoluteInput = path.resolve(input);
  const parsed = parseJsonl(fs.readFileSync(absoluteInput, 'utf8'));
  const summary = summarizeRecords(parsed.records);
  summary.parseErrors = parsed.errors;

  const output = explicitOutput
    ? path.resolve(explicitOutput)
    : path.join(
        process.cwd(),
        'server',
        'captures',
        'probe-summary-local',
        path.basename(absoluteInput).replace(/\.jsonl$/i, '') + '.summary.json',
      );

  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(summary, null, 2) + '\n');

  process.stdout.write(
    'PROBE_SUMMARY_READY\n' +
      'HTTP_REQUESTS ' + summary.httpRequests + '\n' +
      'GAME_ATTRIBUTED_REQUESTS ' + summary.gameAttributedRequests + '\n' +
      'UNIQUE_ROUTES ' + summary.uniqueRoutes + '\n' +
      'TRUNCATED_BODIES ' + summary.truncatedBodies + '\n' +
      'PARSE_ERRORS ' + summary.parseErrors.length + '\n' +
      'OUTPUT ' + output + '\n',
  );

  return summary.parseErrors.length ? 1 : 0;
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
  sha256,
  decodeBody,
  fallbackLike,
  summarizeRecords,
  parseJsonl,
  main,
};
