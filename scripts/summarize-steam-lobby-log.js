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

const INTERESTING_CALLBACKS = Object.freeze([
  'LobbyMatchList_t',
  'LobbyCreated_t',
  'LobbyEnter_t',
  'LobbyDataUpdate_t',
  'LobbyChatUpdate_t',
  'LobbyChatMsg_t',
]);

function classifyLine(line, index = 0) {
  const text = String(line || '');
  for (const call of INTERESTING_CALLS) {
    if (text.includes(call)) {
      return {
        sourceLine: index + 1,
        kind: 'call',
        name: call,
      };
    }
  }

  for (const callback of INTERESTING_CALLBACKS) {
    if (text.includes(callback)) {
      return {
        sourceLine: index + 1,
        kind: 'callback',
        name: callback,
      };
    }
  }

  return null;
}

function summarizeSteamLog(text) {
  const events = [];
  const callCounts = new Map();
  const callbackCounts = new Map();

  String(text || '')
    .split(/\r?\n/)
    .forEach((line, index) => {
      const event = classifyLine(line, index);
      if (!event) return;
      events.push(event);
      const target = event.kind === 'callback' ? callbackCounts : callCounts;
      target.set(event.name, (target.get(event.name) || 0) + 1);
    });

  const calls = Array.from(callCounts.entries())
    .map(([call, count]) => ({ call, count }))
    .sort((a, b) => a.call.localeCompare(b.call));
  const callbacks = Array.from(callbackCounts.entries())
    .map(([callback, count]) => ({ callback, count }))
    .sort((a, b) => a.callback.localeCompare(b.callback));

  return {
    schema: '2k17-compat-lab.steam-lobby-observation.v1',
    evidenceClass: 'LOCAL_LOG_SUMMARY',
    totalInterestingEvents: events.length,
    totalInterestingCalls: calls.reduce((sum, entry) => sum + entry.count, 0),
    totalInterestingCallbacks: callbacks.reduce((sum, entry) => sum + entry.count, 0),
    calls,
    callbacks,
    events,
    hypothesisRelevance: {
      H3_LOBBY_STATE_DEPENDENCY:
        calls.some((entry) =>
          ['RequestLobbyList', 'CreateLobby', 'JoinLobby'].includes(entry.call),
        ),
      H3_CALLBACK_ACTIVITY:
        callbacks.some((entry) =>
          ['LobbyMatchList_t', 'LobbyCreated_t', 'LobbyEnter_t'].includes(entry.callback),
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
      'INTERESTING_CALLBACKS ' + report.totalInterestingCallbacks + '\n' +
      'H3_RELEVANT ' + report.hypothesisRelevance.H3_LOBBY_STATE_DEPENDENCY + '\n' +
      'H3_CALLBACK_ACTIVITY ' + report.hypothesisRelevance.H3_CALLBACK_ACTIVITY + '\n' +
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
  INTERESTING_CALLBACKS,
  classifyLine,
  summarizeSteamLog,
  main,
};
