'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function sha256File(filePath) {
  const bytes = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function relative(filePath) {
  return path.relative(ROOT, filePath).replace(/\\/g, '/');
}

function buildHandoff(inputDir) {
  const dir = path.resolve(inputDir);
  const manifestPath = path.join(dir, 'session-manifest.json');
  const stopPath = path.join(dir, 'session-stop.json');
  const wsPath = path.join(dir, 'websocket-events.json');
  const udpPath = path.join(dir, 'udp-events.json');

  if (!fs.existsSync(manifestPath)) {
    throw new Error('session-manifest.json not found in ' + dir);
  }

  const manifest = readJsonIfExists(manifestPath);
  const stop = readJsonIfExists(stopPath);
  const ws = readJsonIfExists(wsPath);
  const udp = readJsonIfExists(udpPath);

  const files = [manifestPath, stopPath, wsPath, udpPath]
    .filter((filePath) => fs.existsSync(filePath))
    .map((filePath) => ({
      path: relative(filePath),
      byteSize: fs.statSync(filePath).size,
      sha256: sha256File(filePath),
    }));

  return {
    schema: '2k17-compat-lab.claude-handoff.v1',
    generatedAtUtc: new Date().toISOString(),
    sourceSession: {
      startedAtUtc: manifest.startedAtUtc || null,
      stoppedAtUtc: stop ? stop.stoppedAtUtc || null : null,
      mode: manifest.mode || null,
    },
    evidenceSummary: {
      websocketEvents:
        ws && Array.isArray(ws.events) ? ws.events.length : null,
      udpEvents:
        udp && Array.isArray(udp.events) ? udp.events.length : null,
      artifact: manifest.artifact
        ? {
            basename: manifest.artifact.basename,
            byteSize: manifest.artifact.byteSize,
            sha256: manifest.artifact.sha256,
            evidenceClass: manifest.artifact.evidenceClass,
          }
        : null,
      claimsPromoted: [],
    },
    files,
    instructions: [
      'Treat all evidence classes literally.',
      'Do not promote a protocol claim from synthetic, cross-version, or generic transport evidence.',
      'Prefer deterministic observations: byte sizes, hashes, offsets, headers, framing, compression, and repeatability.',
      'If evidence is insufficient, mark the claim unresolved instead of guessing.',
      'Do not contact live 2K infrastructure.',
      'Do not bypass certificate pinning, DRM, anti-cheat, authentication, or other security verification.',
      'Propose the smallest next controlled experiment that can distinguish competing hypotheses.',
    ],
  };
}

function renderPrompt(pack) {
  return [
    '# Claude Reconstruction Handoff',
    '',
    'You are continuing a clean-room NBA 2K17 interoperability investigation.',
    '',
    '## Non-negotiable evidence rules',
    '',
    ...pack.instructions.map((item) => '- ' + item),
    '',
    '## Session summary',
    '',
    '- Mode: ' + (pack.sourceSession.mode || 'unknown'),
    '- Started: ' + (pack.sourceSession.startedAtUtc || 'unknown'),
    '- Stopped: ' + (pack.sourceSession.stoppedAtUtc || 'not recorded'),
    '- WebSocket events: ' + String(pack.evidenceSummary.websocketEvents),
    '- UDP events: ' + String(pack.evidenceSummary.udpEvents),
    '- Artifact: ' +
      (pack.evidenceSummary.artifact
        ? pack.evidenceSummary.artifact.basename +
          ' (' +
          pack.evidenceSummary.artifact.byteSize +
          ' bytes, SHA-256 ' +
          pack.evidenceSummary.artifact.sha256 +
          ')'
        : 'none'),
    '',
    '## Files to inspect',
    '',
    ...pack.files.map(
      (item) =>
        '- ' +
        item.path +
        ' — ' +
        item.byteSize +
        ' bytes — SHA-256 ' +
        item.sha256,
    ),
    '',
    '## Required output',
    '',
    '1. Separate observed facts from hypotheses.',
    '2. Identify deterministic protocol or file-structure facts only.',
    '3. List contradictions, missing evidence, and parser/capture defects.',
    '4. Rank the next experiments by information gain.',
    '5. Produce concrete code changes only where the evidence supports them.',
    '6. Keep all unverified 2K17 semantics explicitly unverified.',
    '',
  ].join('\n');
}

function main(argv = process.argv.slice(2)) {
  const inputDir =
    argv[0] ||
    path.join(
      ROOT,
      'server',
      'captures',
      'parallel-reconstruction-local',
    );
  const outputDir =
    argv[1] ||
    path.join(ROOT, 'handoffs', 'claude', Date.now().toString());

  const pack = buildHandoff(inputDir);
  fs.mkdirSync(outputDir, { recursive: true });

  const jsonPath = path.join(outputDir, 'handoff.json');
  const promptPath = path.join(outputDir, 'CLAUDE_PROMPT.md');

  fs.writeFileSync(jsonPath, JSON.stringify(pack, null, 2) + '\n');
  fs.writeFileSync(promptPath, renderPrompt(pack));

  process.stdout.write(
    'CLAUDE_HANDOFF_READY\n' +
      'JSON ' +
      jsonPath +
      '\n' +
      'PROMPT ' +
      promptPath +
      '\n',
  );
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      (error && error.stack ? error.stack : String(error)) + '\n',
    );
    process.exitCode = 1;
  }
}

module.exports = {
  sha256File,
  buildHandoff,
  renderPrompt,
};
