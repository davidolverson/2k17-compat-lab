'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {
  extractExactBundle,
} = require('../server/src/persistence/user-content-bundle');

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function compareUploadDownload(uploadBytes, downloadBytes) {
  if (!Buffer.isBuffer(uploadBytes) || !Buffer.isBuffer(downloadBytes)) {
    throw new TypeError('upload and download must be Buffers');
  }

  const upload = extractExactBundle(uploadBytes);
  const download = extractExactBundle(downloadBytes);

  const uploadHash = sha256(upload.bytes);
  const downloadHash = sha256(download.bytes);

  return {
    schema: '2k17-compat-lab.user-content-return-proof.v1',
    upload: {
      magic: upload.info.magic,
      offset: upload.info.offset,
      byteSize: upload.bytes.length,
      sha256: uploadHash,
      evidenceClass: upload.info.provenance.evidenceClass,
    },
    download: {
      magic: download.info.magic,
      offset: download.info.offset,
      byteSize: download.bytes.length,
      sha256: downloadHash,
      evidenceClass: download.info.provenance.evidenceClass,
    },
    exactMatch: upload.bytes.equals(download.bytes),
    sha256Match: uploadHash === downloadHash,
    claimsPromoted: [],
    note:
      'Exact upload/download bundle equality proves byte preservation only. It does not prove the client accepted or applied the returned object.',
  };
}

function main(argv = process.argv.slice(2)) {
  const [uploadPath, downloadPath, outputPath] = argv;

  if (!uploadPath || !downloadPath) {
    process.stderr.write(
      'Usage: node scripts/verify-user-content-return.js <upload.bin> <download-response.bin> [output.json]\n',
    );
    return 2;
  }

  const report = compareUploadDownload(
    fs.readFileSync(path.resolve(uploadPath)),
    fs.readFileSync(path.resolve(downloadPath)),
  );

  const output = outputPath
    ? path.resolve(outputPath)
    : path.join(
        process.cwd(),
        'server',
        'captures',
        'persistence-roundtrip-local',
        'upload-download-proof.json',
      );

  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');

  process.stdout.write(
    'USER_CONTENT_RETURN_CHECK\n' +
      'UPLOAD_SHA256 ' + report.upload.sha256 + '\n' +
      'DOWNLOAD_SHA256 ' + report.download.sha256 + '\n' +
      'EXACT_MATCH ' + report.exactMatch + '\n' +
      'SHA256_MATCH ' + report.sha256Match + '\n' +
      'CLAIMS_PROMOTED 0\n' +
      'OUTPUT ' + output + '\n',
  );

  return report.exactMatch && report.sha256Match ? 0 : 1;
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
  compareUploadDownload,
  main,
};
