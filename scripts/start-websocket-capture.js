'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  createWebSocketCaptureServer,
} = require('../server/src/realtime/websocket-capture');

async function main(argv = process.argv.slice(2)) {
  const configPath = argv[0];
  const config = configPath
    ? JSON.parse(fs.readFileSync(path.resolve(configPath), 'utf8'))
    : {};

  const app = createWebSocketCaptureServer({
    ...config,
    onUpgrade: (event) => {
      process.stdout.write(
        '[ws] upgrade ' +
          (event.path || '') +
          ' accepted=' +
          event.accepted +
          '\n',
      );
    },
    onAccepted: (event) => {
      process.stdout.write(
        '[ws] accepted ' + (event.path || '') + '\n',
      );
    },
    onFrame: (summary) => {
      process.stdout.write(
        '[ws] frame opcode=' +
          summary.opcode +
          ' bytes=' +
          summary.payloadLength +
          ' sha256=' +
          summary.payloadSha256 +
          '\n',
      );
    },
    onError: (error) => {
      process.stderr.write(
        '[ws] error ' + (error.stack || error.message) + '\n',
      );
    },
  });

  const address = await app.start();
  process.stdout.write(
    '[ws] capture listener ' +
      address.address +
      ':' +
      address.port +
      ' acceptUpgrades=' +
      Boolean(config.acceptUpgrades) +
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
