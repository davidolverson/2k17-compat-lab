'use strict';

const fs = require('node:fs');
const path = require('node:path');
const probe = require('./summarize-probe-log');
const granite = require('./summarize-granite-log');

function detectFormat(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines.slice(0, 50)) {
    if (line.startsWith('@ ')) return 'granite';
    if (line.startsWith('{')) {
      try {
        const record = JSON.parse(line);
        if (record && typeof record === 'object') return 'probe-jsonl';
      } catch (_) {
        // keep looking
      }
    }
  }

  return 'unknown';
}

function summarizeText(text, explicitFormat = null) {
  const format = explicitFormat || detectFormat(text);

  if (format === 'probe-jsonl') {
    const parsed = probe.parseJsonl(text);
    const summary = probe.summarizeRecords(parsed.records);
    summary.schema = '2k17-compat-lab.route-summary.v2';
    summary.sourceFormat = 'PROBE_JSONL';
    summary.parseErrors = parsed.errors;
    return { format, summary, diagnostics: parsed.errors };
  }

  if (format === 'granite') {
    const parsed = granite.parseGraniteLog(text);
    const summary = granite.summarizeGraniteRecords(parsed.records);
    summary.unparsedLines = parsed.unparsed;
    return { format, summary, diagnostics: parsed.unparsed };
  }

  throw new Error(
    'unable to detect route log format; expected probe JSONL or Granite text log',
  );
}

function main(argv = process.argv.slice(2)) {
  const input = argv[0];
  const explicitOutput = argv[1];
  const explicitFormat = argv[2] || null;

  if (!input) {
    process.stderr.write(
      'Usage: node scripts/summarize-route-log.js <log> [output.json] [probe-jsonl|granite]\n',
    );
    return 2;
  }

  const absoluteInput = path.resolve(input);
  const result = summarizeText(
    fs.readFileSync(absoluteInput, 'utf8'),
    explicitFormat,
  );

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
  fs.writeFileSync(
    output,
    JSON.stringify(result.summary, null, 2) + '\n',
  );

  process.stdout.write(
    'ROUTE_SUMMARY_READY\n' +
      'SOURCE_FORMAT ' + result.summary.sourceFormat + '\n' +
      'HTTP_REQUESTS ' + result.summary.httpRequests + '\n' +
      'UNIQUE_ROUTES ' + result.summary.uniqueRoutes + '\n' +
      'DIAGNOSTICS ' + result.diagnostics.length + '\n' +
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
  detectFormat,
  summarizeText,
  main,
};
