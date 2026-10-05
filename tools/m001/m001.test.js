'use strict';

// node --test tools/m001/m001.test.js

const Test = require('node:test');
const Assert = require('node:assert/strict');
const Path = require('node:path');
const Lib = require('./lib');
const Ledger = require('./park-ledger');
const EndpointId = require('./endpoint-id');

const Field = (Crc, TypeName, Value, Extra = {}) => ({ index: 0, Crc, CrcHex: Lib.Hex32(Crc), TypeHex: '0x00000000', TypeName, value: Value, ...Extra });

Test('CRC32 matches the standard check value and known field ids', () => {
    Assert.equal(Lib.Crc32('123456789'), 0xcbf43926);
    Assert.equal(Lib.Hex32(Lib.Crc32('RESULT')), '0xE3920695');
    Assert.equal(Lib.Hex32(Lib.Crc32('SUCCESS')), '0x504521A8');
    Assert.equal(Lib.Hex32(Lib.Crc32('TEAM_ID')), '0x2E646054');
});

Test('a name is only attached to an id it hashes to', () => {
    Assert.equal(Lib.NameOf(0x2e646054), 'TEAM_ID');
    Assert.equal(Lib.NameOf(0x12345678), null);
});

Test('identity fields are redacted whatever their type', () => {
    const Out = Lib.SanitizeField(Field(Lib.Crc32('USERID'), 'U64', '42'));
    Assert.equal(Out.value, null);
    Assert.equal(Out.redacted, 'identity');
});

Test('strings and binaries never publish content', () => {
    for (const Type of ['String8', 'String16', 'Binary', 'SomeFutureType']) {
        const Out = Lib.SanitizeField(Field(0xaaaa0001, Type, 'private text', { length: 12 }));
        Assert.equal(Out.value, null, Type);
        Assert.equal(Out.redacted, 'opaque', Type);
        Assert.ok(!JSON.stringify(Out).includes('private text'), Type);
    }
});

Test('large integers are redacted, small ones and timestamps are kept', () => {
    Assert.equal(Lib.SanitizeField(Field(0xaaaa0002, 'U64', '76561190000000000')).redacted, 'large-integer');
    Assert.equal(Lib.SanitizeField(Field(0xaaaa0002, 'U64', '903')).value, '903');
    const When = Lib.SanitizeField(Field(0xaaaa0003, 'VCDate', '212657953297509', { IsoDate: '2026-10-05T09:42:07.000Z', ValueHex: '0xC16949C3D465' }));
    Assert.equal(When.value, '2026-10-05T09:42:07.000Z');
    Assert.ok(!/\d{15,}/.test(JSON.stringify(When)));
});

Test('a scalar that repeats an identity value under another id is redacted', () => {
    const Secrets = new Set(['1234567890']);
    Assert.equal(Lib.SanitizeField(Field(0xaaaa0004, 'U64', '1234567890'), Secrets).redacted, 'repeats-identity-value');
});

Test('the leak check fails closed', () => {
    Assert.throws(() => Lib.AssertNoSecrets('{"x":"SomeGamertag"}', new Set(['somegamertag']), 'unit'), /private value/);
    Assert.throws(() => Lib.AssertNoSecrets('{"x":"765611979851314070"}', new Set(), 'unit'), /15\+ digit/);
    Lib.AssertNoSecrets('{"x":"903"}', new Set(['somegamertag']), 'unit');
});

Test('bare ack detection needs RESULT=SUCCESS and nothing else', () => {
    const Ack = { Parse: { Status: 'ok', value: { Fields: [Field(Lib.ResultCrc, 'StringCrc', Lib.SuccessCrc)] } } };
    const Data = { Parse: { Status: 'ok', value: { Fields: [Field(Lib.ResultCrc, 'StringCrc', Lib.SuccessCrc), Field(1, 'U64', '1')] } } };
    Assert.equal(Lib.IsBareAck(Ack), true);
    Assert.equal(Lib.IsBareAck(Data), false);
    Assert.equal(Lib.IsBareAck(null), false);
});

Test('route classification: guard wins, unknown routes fall to the catch-all', () => {
    const Rules = Ledger.LoadRules(Path.join(__dirname, 'route-classification.json'));
    Assert.equal(Ledger.Classify('parkgamestatsv3/parksummary', Rules).handler, 'Guard2K17.AckOnly');
    Assert.equal(Ledger.Classify('parkgamestatsv3/parksummary', Rules).response_class, 'generic-fallback');
    Assert.equal(Ledger.Classify('parkgamestatsv3/parkchooseaffiliation', Rules).experimental, true);
    Assert.equal(Ledger.Classify('parkgamestatsv3/toprepplayer', Rules).response_class, 'generic-fallback');
    Assert.equal(Ledger.Classify('park/search', Rules).handler_source, 'runtime-catch-all');
    Assert.equal(Ledger.Classify('session/update', Rules).evidence_class, 'REFERENCE');
    for (const Rule of [...Rules.rules, Rules.default]) {
        Assert.notEqual(Rule.evidence_class, 'OBSERVED', 'no reply on this path is evidenced as an original-service reply');
    }
});

Test('endpoint-id: matches are reported, non-matches stay unexplained, generated ids are not counted as support', () => {
    const Id = (Text) => Lib.Hex32(Lib.Crc32(Text));
    const Report = EndpointId.Analyse([
        { EndpointId: Id('ACCOUNTS:GET'), Url: 'https://h/nba/2k17/Accounts/get', EndpointIdEvidence: 'IDA_EXACT_TEST' },
        { EndpointId: '0xDEADBEEF', Url: 'https://h/nba/2k17/Accounts/update', EndpointIdEvidence: 'IDA_EXACT_TEST' },
        { EndpointId: Id('GAME_STATS:PARK_REP'), Url: 'https://h/nba/2k17/ParkGameStatsV3/ParkRep', EndpointIdEvidence: 'NOT_OBSERVED', Candidate: 'GAME_STATS:PARK_REP' },
    ]);
    Assert.equal(Report.validation_set.rows, 2);
    Assert.equal(Report.validation_set.reproduced, 1);
    Assert.equal(Report.circular_rows.rows, 1);
    Assert.match(Report.universal_rule, /^NO:/);
    Assert.equal(EndpointId.Snake('TopRepPlayer'), 'TOP_REP_PLAYER');
});
