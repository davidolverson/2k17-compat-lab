'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  parseSanitizedCaptureText,
  buildEvidenceCandidate,
} = require('../server/src/evidence/import-capture');

function usage() {
  process.stderr.write(
    'Usage: node scripts/import-sanitized-capture.js <sanitized-request-v2.json> [output.json]\n',
  );
}

function main(argv = process.argv.slice(2)) {
  const inputPath = argv[0];
  const explicitOutput = argv[1];

  if (!inputPath) {
    usage();
    return 2;
  }

  const absoluteInput = path.resolve(inputPath);
  const text = fs.readFileSync(absoluteInput, 'utf8');
  const document = parseSanitizedCaptureText(text);
  const candidate = buildEvidenceCandidate(document);

  const outputPath = explicitOutput
    ? path.resolve(explicitOutput)
    : path.join(
        process.cwd(),
        'server',
        'captures',
        'imported-local',
        candidate.candidateId + '.candidate.json',
      );

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(
    outputPath,
    JSON.stringify(candidate, null, 2) + '\n',
  );

  process.stdout.write(
    'VALID_SANITIZED_CAPTURE ' + document.captureId + '\n',
  );
  process.stdout.write(
    'CANDIDATE_CLASS ' + candidate.candidateClass + '\n',
  );
  process.stdout.write(
    'PROMOTION_STATUS ' + candidate.promotionStatus + '\n',
  );
  process.stdout.write(
    'OUTPUT ' + outputPath + '\n',
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
  main,
};
