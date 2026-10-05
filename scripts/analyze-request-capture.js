'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  analyzeApplicationRequest,
} = require('../server/src/protocol/request-analyzer');

function main(argv = process.argv.slice(2)) {
  const [metadataPath, bodyPath, outputPath] = argv;

  if (!metadataPath || !bodyPath) {
    process.stderr.write(
      'Usage: node scripts/analyze-request-capture.js <raw-request-metadata.json> <raw-body.bin> [output.json]\n',
    );
    return 2;
  }

  const metadata = JSON.parse(
    fs.readFileSync(path.resolve(metadataPath), 'utf8'),
  );
  const body = fs.readFileSync(path.resolve(bodyPath));

  if (
    metadata.bodySha256 &&
    require('node:crypto')
      .createHash('sha256')
      .update(body)
      .digest('hex') !== metadata.bodySha256
  ) {
    throw new Error(
      'raw body SHA-256 does not match capture metadata',
    );
  }

  const report = analyzeApplicationRequest({
    method: metadata.method,
    path: metadata.path,
    contentType: metadata.contentType,
    vcFieldListSize: metadata.vcFieldListSize,
    body,
  });

  const output = outputPath
    ? path.resolve(outputPath)
    : path.join(
        process.cwd(),
        'server',
        'captures',
        'request-analysis-local',
        metadata.captureId + '.analysis.json',
      );

  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(
    output,
    JSON.stringify(report, null, 2) + '\n',
  );

  process.stdout.write(
    'REQUEST ' +
      (metadata.method || '') +
      ' ' +
      (metadata.path || '') +
      '\n' +
      'BODY_BYTES ' +
      report.body.byteSize +
      '\n' +
      'REFERENCE_CODEC_COMPATIBLE ' +
      report.referenceFieldList.compatible +
      '\n' +
      'OUTPUT ' +
      output +
      '\n',
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
