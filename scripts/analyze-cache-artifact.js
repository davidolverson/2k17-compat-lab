'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  analyzeFile,
} = require('../server/src/artifact/structural-analyzer');

function usage() {
  process.stderr.write(
    'Usage: node scripts/analyze-cache-artifact.js <file> [output.json]\n',
  );
}

function main(argv = process.argv.slice(2)) {
  const input = argv[0];
  const explicitOutput = argv[1];

  if (!input) {
    usage();
    return 2;
  }

  let nextProgress = 128 * 1024 * 1024;
  const report = analyzeFile(input, {
    onProgress: ({ bytesProcessed, totalBytes, referenceBytesScanned, referenceScanBudgetBytes }) => {
      if (bytesProcessed < nextProgress && bytesProcessed < totalBytes) return;
      const pct = totalBytes === 0
        ? 100
        : ((bytesProcessed / totalBytes) * 100).toFixed(1);
      process.stdout.write(
        'PROGRESS ' +
          bytesProcessed +
          '/' +
          totalBytes +
          ' (' +
          pct +
          '%)' +
          ' REFERENCE_SCAN ' +
          referenceBytesScanned +
          '/' +
          referenceScanBudgetBytes +
          '\n',
      );
      while (nextProgress <= bytesProcessed) {
        nextProgress += 128 * 1024 * 1024;
      }
    },
  });

  const output = explicitOutput
    ? path.resolve(explicitOutput)
    : path.join(
        process.cwd(),
        'server',
        'captures',
        'artifact-analysis-local',
        report.sha256.slice(0, 16) + '.structure.json',
      );

  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');

  process.stdout.write(
    'ARTIFACT ' + report.basename + '\n' +
      'SIZE ' + report.byteSize + '\n' +
      'SHA256 ' + report.sha256 + '\n' +
      'MAGIC_MATCHES ' + report.magic.length + '\n' +
      'PROTOCOL_STRINGS ' + report.relevantStrings.length + '\n' +
      'REFERENCE_CODEC_CANDIDATES ' +
        report.referenceFieldListCandidates.length + '\n' +
      'REFERENCE_SCAN_MODE ' + report.referenceScanMode + '\n' +
      'REFERENCE_BYTES_SCANNED ' + report.referenceBytesScanned + '\n' +
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

module.exports = { main };
