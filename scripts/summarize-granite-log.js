'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function parseGraniteLine(line, index = 0) {
  const text = String(line || '').trim();
  if (!text) return null;

  // Observed Granite shape:
  // @ 2026-10-05 08:05:22.607 POST /Session/login?x=... session=...
  const match = text.match(
    /^@\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2}(?:\.\d+)?)\s+([A-Z]+)\s+(\S+)(?:\s+(.*))?$/
  );

  if (!match) return null;

  const [, date, time, method, target, tail = ''] = match;
  const queryIndex = target.indexOf('?');
  const routePath = queryIndex >= 0 ? target.slice(0, queryIndex) : target;
  const query = queryIndex >= 0 ? target.slice(queryIndex + 1) : null;

  const sessionMatch = tail.match(/(?:^|\s)session=([^\s]+)/i);
  const bytesMatch = tail.match(/(?:^|\s)(?:bytes|bodyBytes)=([0-9]+)/i);
  const statusMatch = tail.match(/(?:^|\s)status=([0-9]{3})(?:\s|$)/i);
  const handlerMatch = tail.match(/(?:^|\s)(?:handler|route|profile)=([^\s]+)/i);

  return {
    source: 'GRANITE_LOG',
    sourceLine: index + 1,
    tsLocal: date + ' ' + time,
    method,
    path: routePath,
    queryPresent: Boolean(query),
    sessionPresent: Boolean(sessionMatch),
    bodyLength: bytesMatch ? Number(bytesMatch[1]) : null,
    responseStatus: statusMatch ? Number(statusMatch[1]) : null,
    responseLabel: handlerMatch ? handlerMatch[1] : null,
    rawTail: tail || null,
  };
}

function parseGraniteLog(text) {
  const records = [];
  const unparsed = [];

  String(text || '')
    .split(/\r?\n/)
    .forEach((line, index) => {
      if (!line.trim()) return;
      const parsed = parseGraniteLine(line, index);
      if (parsed) records.push(parsed);
      else unparsed.push({
        line: index + 1,
        byteLength: Buffer.byteLength(line, 'utf8'),
        sha256: crypto.createHash('sha256').update(line).digest('hex'),
      });
    });

  return { records, unparsed };
}

function summarizeGraniteRecords(records) {
  const routes = new Map();

  for (const record of records) {
    const key = record.method + ' ' + record.path;
    if (!routes.has(key)) {
      routes.set(key, {
        method: record.method,
        path: record.path,
        count: 0,
        firstObserved: record.tsLocal,
        lastObserved: record.tsLocal,
        bodyLengths: new Set(),
        responseLabels: new Set(),
        responseStatuses: new Set(),
        sessionsObserved: 0,
        queriesObserved: 0,
      });
    }

    const row = routes.get(key);
    row.count += 1;
    row.lastObserved = record.tsLocal;
    if (Number.isSafeInteger(record.bodyLength)) {
      row.bodyLengths.add(record.bodyLength);
    }
    if (record.responseLabel) row.responseLabels.add(record.responseLabel);
    if (Number.isSafeInteger(record.responseStatus)) {
      row.responseStatuses.add(record.responseStatus);
    }
    if (record.sessionPresent) row.sessionsObserved += 1;
    if (record.queryPresent) row.queriesObserved += 1;
  }

  const routeRows = Array.from(routes.values())
    .map((row) => ({
      method: row.method,
      path: row.path,
      count: row.count,
      repeated: row.count > 1,
      firstObserved: row.firstObserved,
      lastObserved: row.lastObserved,
      bodyLengths: Array.from(row.bodyLengths).sort((a, b) => a - b),
      uniqueCompleteBodyHashes: 0,
      responseLabels: Array.from(row.responseLabels).sort(),
      responseStatuses: Array.from(row.responseStatuses).sort((a, b) => a - b),
      attributedPids: [],
      truncatedBodies: 0,
      fallbackLikeResponses: 0,
      needsHandlerReview: false,
      sessionsObserved: row.sessionsObserved,
      queriesObserved: row.queriesObserved,
    }))
    .sort((a, b) => {
      if (a.path === b.path) return a.method.localeCompare(b.method);
      return a.path.localeCompare(b.path);
    });

  return {
    schema: '2k17-compat-lab.route-summary.v2',
    sourceFormat: 'GRANITE_TEXT_LOG',
    evidenceClass: 'LOCAL_LOG_SUMMARY',
    httpRequests: records.length,
    gameAttributedRequests: null,
    truncatedBodies: null,
    uniqueRoutes: routeRows.length,
    routes: routeRows,
    claimsPromoted: [],
    limitations: [
      'Granite text logs do not prove process attribution.',
      'Body size/hash fields are unavailable unless Granite explicitly logs them.',
      'Handler/fallback classification is unavailable unless Granite explicitly logs it.',
    ],
  };
}

function main(argv = process.argv.slice(2)) {
  const input = argv[0];
  const explicitOutput = argv[1];

  if (!input) {
    process.stderr.write(
      'Usage: node scripts/summarize-granite-log.js <granite.log> [output.json]\n',
    );
    return 2;
  }

  const absoluteInput = path.resolve(input);
  const parsed = parseGraniteLog(fs.readFileSync(absoluteInput, 'utf8'));
  const summary = summarizeGraniteRecords(parsed.records);
  summary.unparsedLines = parsed.unparsed;

  const output = explicitOutput
    ? path.resolve(explicitOutput)
    : path.join(
        process.cwd(),
        'server',
        'captures',
        'route-summary-local',
        path.basename(absoluteInput) + '.summary.json',
      );

  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(summary, null, 2) + '\n');

  process.stdout.write(
    'GRANITE_SUMMARY_READY\n' +
      'HTTP_REQUESTS ' + summary.httpRequests + '\n' +
      'UNIQUE_ROUTES ' + summary.uniqueRoutes + '\n' +
      'UNPARSED_LINES ' + summary.unparsedLines.length + '\n' +
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
  parseGraniteLine,
  parseGraniteLog,
  summarizeGraniteRecords,
  main,
};
