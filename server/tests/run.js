'use strict';

const assert = require('node:assert/strict');
const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

require('../../tests/transport.test')({ test, assert });
require('./gates.test')({ test, assert });

async function main() {
  let passed = 0;
  for (const { name, fn } of tests) {
    try {
      await fn();
      passed += 1;
      process.stdout.write('PASS ' + name + '\n');
    } catch (error) {
      process.stderr.write('FAIL ' + name + '\n');
      process.stderr.write(
        (error && error.stack ? error.stack : String(error)) + '\n',
      );
    }
  }

  process.stdout.write('\nRESULT ' + passed + '/' + tests.length + ' tests passed\n');
  if (passed !== tests.length) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(
    'TEST HARNESS FAILURE\n' +
    (error && error.stack ? error.stack : String(error)) + '\n',
  );
  process.exitCode = 1;
});
