'use strict';

const fs = require('node:fs');
const path = require('node:path');

const INTERESTING_CALLS = Object.freeze([
  'RequestLobbyList',
  'CreateLobby',
  'JoinLobby',
  'LeaveLobby',
  'GetLobbyByIndex',
  'GetLobbyData',
  'SetLobbyData',
  'GetLobbyMemberByIndex',
  'GetNumLobbyMembers',
  'InviteUserToLobby',
  'SetLobbyJoinable',
  'SetLobbyMemberLimit',
  'SetLobbyType',
  'GetLobbyOwner',
  'SetLobbyOwner',
  'SendLobbyChatMsg',
  'GetLobbyChatEntry',
]);

function classifyLine(line, index = 0) {
  const text = String(line || '');
  for (const call of INTERESTING_CALLS) {
    if (text.includes(call)) {
      return {
        sourceLine: index + 1,
        call,
      };
    }
  }
  return null;
}

function summarizeSteamLog(text) {
  const events = [];
  const counts = new Map();

  String(text || '')
    .split(/\r?\n/)
    .forEach((line, index) => {
      const event = classifyLine(line, index);
      if (!event) return;
      events.push(event);
      counts.set(event.call, (counts.get(event.call) || 0) + 1);
    });

  const calls = Array.from(counts.entries())
    .map(([call, count]) => ({ call, count }))
    .sort((a, b) => a.call.localeCompare(b.call));

  return {
    schema: '2k17-compat-lab.steam-lobby-observation.v1',
    evidenceClass: 'LOCAL_LOG_SUMMARY',
    totalInterestingCalls: events.length,
    calls,
    events,
    hypothesisRelevance: {
      H3_LOBBY_STATE_DEPENDENCY:
        calls.some((entry) =>
          ['RequestLobbyList', 'CreateLobby', 'JoinLobby'].includes(entry.call),
        ),
    },
    claimsPromoted: [],
    note:
      'This report summarizes observed Steam matchmaking API call names only. It does not prove success, causality, lobby contents, or authentication state.',
  };
}

function main(argv = process.argv.slice(2)) {
  const input = argv[0];
  const explicitOutput = argv[1];

  if (!input) {
    process.stderr.write(
      'Usage: node scripts/summarize-steam-lobby-log.js <STEAM_LOG.txt> [output.json]\n',
    );
    return 2;
  }

  const absoluteInput = path.resolve(input);
  const report = summarizeSteamLog(
    fs.readFileSync(absoluteInput, 'utf8'),
  );

  const output = explicitOutput
    ? path.resolve(explicitOutput)
    : path.join(
        process.cwd(),
        'server',
        'captures',
        'steam-lobby-observation-local',
        path.basename(absoluteInput) + '.summary.json',
      );

  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');

  process.stdout.write(
    'STEAM_LOBBY_SUMMARY_READY\n' +
      'INTERESTING_CALLS ' + report.totalInterestingCalls + '\n' +
      'H3_RELEVANT ' + report.hypothesisRelevance.H3_LOBBY_STATE_DEPENDENCY + '\n' +
      'CLAIMS_PROMOTED 0\n' +
      'OUTPUT ' + output + '\n',
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
  INTERESTING_CALLS,
  classifyLine,
  summarizeSteamLog,
  main,
};
