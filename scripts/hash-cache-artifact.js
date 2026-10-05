'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function usage() {
  process.stderr.write(
    'Usage: node scripts/hash-cache-artifact.js <file> <AUTHORIZED|UNVERIFIED> <source-description> [output.json]\n',
  );
}

function hashFile(filePath) {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(filePath, 'r');
  const buffer = Buffer.allocUnsafe(1024 * 1024);

  try {
    while (true) {
      const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      hash.update(buffer.subarray(0, bytesRead));
    }
  } finally {
    fs.closeSync(fd);
  }

  return hash.digest('hex');
}

function createMetadata(filePath, authorizationStatus, sourceDescription) {
  const absolute = path.resolve(filePath);
  const stat = fs.statSync(absolute);

  if (!stat.isFile()) {
    throw new Error('artifact path must point to a regular file');
  }

  if (!['AUTHORIZED', 'UNVERIFIED'].includes(authorizationStatus)) {
    throw new Error(
      'authorization status must be AUTHORIZED or UNVERIFIED',
    );
  }

  const sha256 = hashFile(absolute);
  const artifactId =
    'ART-' +
    crypto
      .createHash('sha256')
      .update(
        path.basename(absolute) +
          '\0' +
          String(stat.size) +
          '\0' +
          sha256,
        'utf8',
      )
      .digest('hex')
      .slice(0, 20)
      .toUpperCase();

  return {
    schema: '2k17-compat-lab.cache-artifact-metadata.v1',
    artifactId,
    basename: path.basename(absolute),
    byteSize: stat.size,
    sha256,
    sourceDescription: String(sourceDescription),
    authorizationStatus,
    modifiedUtc: Number.isFinite(stat.mtimeMs)
      ? stat.mtime.toISOString()
      : null,
    contentCommitted: false,
  };
}

function main(argv = process.argv.slice(2)) {
  const [filePath, authorizationStatus, sourceDescription, output] = argv;

  if (!filePath || !authorizationStatus || !sourceDescription) {
    usage();
    return 2;
  }

  const metadata = createMetadata(
    filePath,
    authorizationStatus,
    sourceDescription,
  );

  const text = JSON.stringify(metadata, null, 2) + '\n';

  if (output) {
    const out = path.resolve(output);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, text);
    process.stdout.write('OUTPUT ' + out + '\n');
  } else {
    process.stdout.write(text);
  }

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
  hashFile,
  createMetadata,
  main,
};
