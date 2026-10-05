'use strict';

// node --test tools/m001/sanitizer.test.js
//
// Adversarial and golden tests for the sanitizer. Every value below is
// synthetic. The point of each case is a way a private value could reach a
// public fixture; the sanitizer must redact it or refuse to write.

const Test = require('node:test');
const Assert = require('node:assert/strict');
const Fs = require('node:fs');
const Path = require('node:path');
const Lib = require('./lib');

const SessionKey = '4242424242424242';
const Handle = 'Synthetic_Handle';
const Field = (Crc, TypeName, Value, Extra = {}) => ({ index: 0, Crc, CrcHex: Lib.Hex32(Crc), TypeHex: '0x00000000', TypeName, value: Value, ...Extra });
const Sidecar = (Fields, Extra = {}) => ({ BodyBytes: 64, DeclaredFieldListBytes: 64, CapturedAt: '2026-01-01T00:00:00.000Z', Parse: { Status: 'ok', value: { Fields } }, ...Extra });
const Capture = (RequestFields, ResponseFields = [], Headers = {}) => ({
    Base: '20260101000000000_100_000001_POST_example',
    Pid: 100,
    Seq: 1,
    Request: { ...Sidecar(RequestFields), method: 'POST', url: `/nba/2k17/Example/Route?x=${SessionKey}&token=abc`, headers: { 'user-agent': 'EXAMPLE/1.0', 'content-length': '64', ...Headers } },
    Response: Sidecar(ResponseFields),
});

Test('the session key never survives: URL query, decimal, hex and mixed case', () => {
    const Row = Capture([Field(0xaaaa0001, 'U64', '7')]);
    const Secrets = Lib.CollectSecrets([Row]);
    const Hex = BigInt(SessionKey).toString(16);
    Assert.ok(Secrets.has(SessionKey));
    Assert.ok(Secrets.has(Hex));
    const Clean = JSON.stringify(Lib.SanitizeRequest(Row, Secrets));
    Assert.ok(!Clean.includes(SessionKey));
    Assert.ok(!Clean.includes('token=abc'), 'the query string is dropped, not copied');
    for (const Leak of [SessionKey, Hex, Hex.toUpperCase(), `0x${Hex.toUpperCase()}`]) {
        Assert.throws(() => Lib.AssertNoSecrets(`{"note":"saw ${Leak}"}`, Secrets, 'unit'), /private value/, Leak);
    }
});

Test('an identity value repeated under an unrelated field id is redacted in every scalar form', () => {
    const UserId = '1234567890';
    const Row = Capture([Field(Lib.Crc32('USERID'), 'U64', UserId), Field(0xaaaa0002, 'U64', UserId), Field(0xaaaa0003, 'U32', Number(UserId)), Field(0xaaaa0004, 'U64', BigInt(UserId))]);
    const Secrets = Lib.CollectSecrets([Row]);
    const Clean = Lib.SanitizeRequest(Row, Secrets);
    Assert.deepEqual(Clean.fields.map((Item) => Item.redacted), ['identity', 'repeats-identity-value', 'repeats-identity-value', 'repeats-identity-value']);
    Assert.ok(!JSON.stringify(Clean).includes(UserId));
});

Test('an identity carried as a bigint is still collected as a secret', () => {
    const Secrets = Lib.CollectSecrets([Capture([Field(Lib.Crc32('USERID'), 'U64', 9876543210n)])]);
    Assert.ok(Secrets.has('9876543210'));
    Assert.ok(Secrets.has((9876543210n).toString(16)));
});

Test('free text is never published, and its content becomes a secret', () => {
    const Row = Capture([Field(0xaaaa0005, 'String8', Handle, { length: Handle.length }), Field(0xaaaa0006, 'String16', 'user@example.invalid', { length: 20 })]);
    const Secrets = Lib.CollectSecrets([Row]);
    const Clean = JSON.stringify(Lib.SanitizeRequest(Row, Secrets));
    Assert.ok(!Clean.toLowerCase().includes(Handle.toLowerCase()));
    Assert.ok(!Clean.includes('example.invalid'));
    Assert.throws(() => Lib.AssertNoSecrets(`{"x":"${Handle.toUpperCase()}"}`, Secrets, 'unit'), /private value/);
});

Test('unknown and structured value types fail closed to opaque', () => {
    for (const Value of [{ HeadHex: 'deadbeef', length: 4 }, ['a', 'b'], Buffer.from('secret-bytes'), null, undefined]) {
        const Out = Lib.SanitizeField(Field(0xaaaa0007, 'TypeAddedNextYear', Value));
        Assert.equal(Out.value, null);
        Assert.equal(Out.redacted, 'opaque');
        Assert.ok(!JSON.stringify(Out).includes('deadbeef'));
    }
});

Test('integers at or above the platform-id range are redacted whatever the field', () => {
    for (const Value of ['1000000000000000', '-1000000000000000', '76561190000000000', 'not-a-number']) {
        Assert.equal(Lib.SanitizeField(Field(0xaaaa0008, 'U64', Value)).value, null, Value);
    }
    Assert.equal(Lib.SanitizeField(Field(0xaaaa0008, 'S64', '999999999999999')).value, '999999999999999');
});

Test('only whitelisted headers are published', () => {
    const Row = Capture([], [], { cookie: 'sid=private', authorization: 'Bearer private', 'x-forwarded-for': '203.0.113.9', host: 'private.example.invalid' });
    const Clean = Lib.SanitizeRequest(Row, Lib.CollectSecrets([Row]));
    Assert.deepEqual(Object.keys(Clean.headers).sort(), ['content-length', 'user-agent']);
    Assert.ok(!JSON.stringify(Clean).includes('private'));
});

Test('the leak check refuses long digit runs wherever they hide', () => {
    for (const Text of ['{"a":123456789012345}', '{"a":"id-123456789012345-x"}', '{"path":"/u/7656119000000000/"}']) {
        Assert.throws(() => Lib.AssertNoSecrets(Text, new Set(), 'unit'), /15\+ digit/, Text);
    }
    Lib.AssertNoSecrets('{"captured_at": "2026-01-01T00:00:00.000Z", "a": 12345678901234}', new Set(), 'unit');
});

Test('a response is labelled as replacement-runtime output, never as an original-service capture', () => {
    const Clean = Lib.SanitizeResponse(Capture([], [Field(Lib.ResultCrc, 'StringCrc', Lib.SuccessCrc)]));
    Assert.match(Clean.source, /NOT an original-service capture/);
    Assert.equal(Clean.fields[0].value_name, 'SUCCESS');
});

Test('golden: a synthetic capture sanitizes to exactly the committed fixture', () => {
    const Row = Capture(
        [
            Field(Lib.Crc32('USERID'), 'U64', '1234567890'),
            Field(Lib.Crc32('GAMERTAG'), 'String8', Handle, { length: Handle.length }),
            Field(Lib.Crc32('TEAM_ID'), 'U64', '903'),
            Field(0xaaaa0009, 'U64', '1234567890'),
            Field(0xaaaa000a, 'Binary', { HeadHex: '00ff', length: 28 }, { length: 28 }),
            Field(0xaaaa000b, 'VCDate', '212657953297509', { IsoDate: '2026-01-01T00:00:00.000Z', ValueHex: '0xC16949C3D465' }),
            Field(0xaaaa000c, 'F32', 0.30000001192092896),
            Field(0xaaaa000d, 'Bool', true),
        ],
        [],
        { cookie: 'sid=private' },
    );
    const Secrets = Lib.CollectSecrets([Row]);
    const Text = `${JSON.stringify(Lib.SanitizeRequest(Row, Secrets), null, 2)}\n`;
    Lib.AssertNoSecrets(Text, Secrets, 'golden');
    const Golden = Path.join(__dirname, 'golden', 'sanitized-request.golden.json');
    if (process.env.UPDATE_GOLDEN === '1') Fs.writeFileSync(Golden, Text, 'utf8');
    Assert.equal(Text, Fs.readFileSync(Golden, 'utf8').replace(/\r\n/g, '\n'), 'sanitizer output changed: review the diff, then regenerate with UPDATE_GOLDEN=1');
});
