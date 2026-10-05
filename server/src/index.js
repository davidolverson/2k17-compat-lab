'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHttpsCaptureServer } = require('./transport/https-server');

function loadConfig(configPath) {
  const absolute = path.resolve(configPath);
  return JSON.parse(fs.readFileSync(absolute, 'utf8'));
}

async function main() {
  const configPath = process.argv[2];

  if (!configPath) {
    process.stderr.write(
      'Usage: node server/src/index.js <config.json>\n',
    );
    process.exitCode = 2;
    return;
  }

  const config = loadConfig(configPath);

  const app = createHttpsCaptureServer({
    ...config,

    onCapture: ({
      record,
      rawMetadataPath,
      rawBodyPath,
      sanitizedPath,
    }) => {
      process.stdout.write(
        '[capture] ' +
          record.captureId +
          ' ' +
          record.method +
          ' ' +
          record.path +
          ' body=' +
          record.bodyLength +
          ' sha256=' +
          record.bodySha256 +
          '\n',
      );
      process.stdout.write(
        '[capture] raw metadata: ' + rawMetadataPath + '\n',
      );
      process.stdout.write(
        '[capture] raw body: ' + rawBodyPath + '\n',
      );
      if (sanitizedPath) {
        process.stdout.write(
          '[capture] sanitized: ' + sanitizedPath + '\n',
        );
      }
    },

    onTlsClientError: ({
      error,
      remoteAddress,
      remotePort,
    }) => {
      process.stderr.write(
        '[tls] client error from ' +
          remoteAddress +
          ':' +
          remotePort +
          ' code=' +
          (error.code || '') +
          ' message=' +
          error.message +
          '\n',
      );
    },

    onTlsEstablished: (event) => {
      process.stdout.write(
        '[tls] established ' +
          event.protocol +
          ' ' +
          event.cipher +
          ' sni=' +
          (event.servername || '') +
          '\n',
      );
    },

    onError: (error) => {
      process.stderr.write(
        '[server] capture error: ' +
          (error.stack || error.message) +
          '\n',
      );
    },
  });

  const address = await app.start();

  process.stdout.write(
    '[server] capture-first HTTPS listener on ' +
      address.address +
      ':' +
      address.port +
      '\n',
  );

  process.stdout.write(
    '[server] fallback response profile: ' +
      (config.fallbackProfile || 'CAPTURE_ONLY_404') +
      '\n',
  );

  const stop = async () => {
    try {
      await app.stop();
      process.stdout.write('[server] stopped\n');
    } finally {
      process.exit(0);
    }
  };

  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(
      (error && error.stack ? error.stack : String(error)) + '\n',
    );
    process.exitCode = 1;
  });
}

module.exports = {
  loadConfig,
};
