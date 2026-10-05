'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  createUdpCaptureServer,
} = require('../server/src/realtime/udp-capture');

async function main(argv = process.argv.slice(2)) {
  const configPath = argv[0];
  const config = configPath
    ? JSON.parse(fs.readFileSync(path.resolve(configPath), 'utf8'))
    : {};

  const app = createUdpCaptureServer({
    ...config,
    onDatagram: ({ summary, rawPath }) => {
      process.stdout.write(
        '[udp] bytes=' +
          summary.byteLength +
          ' from=' +
          summary.remoteAddress +
          ':' +
          summary.remotePort +
          ' sha256=' +
          summary.sha256 +
          (rawPath ? ' raw=' + rawPath : '') +
          '\n',
      );
    },
    onError: (error) => {
      process.stderr.write(
        '[udp] error ' + (error.stack || error.message) + '\n',
      );
    },
  });

  const address = await app.start();
  process.stdout.write(
    '[udp] capture listener ' +
      address.address +
      ':' +
      address.port +
      '\n',
  );

  const stop = async () => {
    await app.stop();
    process.exit(0);
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
