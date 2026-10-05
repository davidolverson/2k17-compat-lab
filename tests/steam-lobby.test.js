'use strict';

const {
  summarizeSteamLog,
} = require('../scripts/summarize-steam-lobby-log');

module.exports = function registerSteamLobbyTests({ test, assert }) {
  test('Steam lobby summarizer counts relevant matchmaking calls without inferring success', () => {
    const report = summarizeSteamLog(
      'Steam_Matchmaking::RequestLobbyList\n' +
      'Steam_Matchmaking::GetLobbyByIndex 0\n' +
      'Steam_Matchmaking::JoinLobby 123\n' +
      'callback LobbyEnter_t result\n' +
      'unrelated line\n',
    );

    assert.equal(report.totalInterestingCalls, 3);
    assert.equal(report.totalInterestingCallbacks, 1);
    assert.equal(
      report.hypothesisRelevance.H3_CALLBACK_ACTIVITY,
      true,
    );
    assert.equal(
      report.hypothesisRelevance.H3_LOBBY_STATE_DEPENDENCY,
      true,
    );
    assert.deepEqual(report.claimsPromoted, []);
    assert.match(report.note, /does not prove success, causality/i);
  });

  test('Steam lobby summarizer stays negative when no lobby lifecycle calls are present', () => {
    const report = summarizeSteamLog(
      'Steam_UGC::AddContentDescriptor 1 2\n',
    );

    assert.equal(report.totalInterestingCalls, 0);
    assert.equal(report.totalInterestingCallbacks, 0);
    assert.equal(
      report.hypothesisRelevance.H3_LOBBY_STATE_DEPENDENCY,
      false,
    );
  });
};
