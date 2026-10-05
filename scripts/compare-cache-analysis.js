'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  compareStructureReports,
} = require('../server/src/artifact/compare-structure');

function main(argv = process.argv.slice(2)) {
  const [leftPath, rightPath, outputPath] = argv;

  if (!leftPath || !rightPath) {
    process.stderr.write(
      'Usage: node scripts/compare-cache-analysis.js <left-report.json> <right-report.json> [output.json]\n',
    );
    return 2;
  }

  const left = JSON.parse(
    fs.readFileSync(path.resolve(leftPath), 'utf8'),
  );
  const right = JSON.parse(
    fs.readFileSync(path.resolve(rightPath), 'utf8'),
  );

  const comparison = compareStructureReports(left, right);
  const text = JSON.stringify(comparison, null, 2) + '\n';

  if (outputPath) {
    const output = path.resolve(outputPath);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, text);
    process.stdout.write('OUTPUT ' + output + '\n');
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

module.exports = { main };
