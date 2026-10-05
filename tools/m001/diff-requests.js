#!/usr/bin/env node
'use strict';

// Compares every captured request for one route (M001 search-blocker step 2):
// which fields are constant, which change between polls, and whether retries
// are byte-identical. Read-only. Private values are never printed: a field
// that is redacted by the sanitizer is reported only as constant / varying.
//
//   node tools/m001/diff-requests.js --captures <dir> --route park/search [--out file.json]

const Crypto = require('node:crypto');
const Fs = require('node:fs');
const Path = require('node:path');
const Lib = require('./lib');

function Main() {
    const Options = Lib.Args(process.argv.slice(2));
    if (!Options.captures || !Options.route) throw new Error('usage: diff-requests.js --captures <dir> --route <route_key> [--out file.json]');
    const Directory = Path.resolve(Options.captures);
    const All = Lib.LoadCaptures(Directory);
    const Secrets = Lib.CollectSecrets(All);
    const Rows = All.filter((Capture) => Lib.SplitUrl(Capture.Request.url).Route === String(Options.route).toLowerCase());
    if (!Rows.length) throw new Error(`no captured request for route ${Options.route}`);

    const Sessions = new Map();
    const Digest = (Capture) => Crypto.createHash('sha256').update(Fs.readFileSync(Path.join(Directory, `${Capture.Base}.bin`))).digest('hex');
    const Raw = (Field) => JSON.stringify(Field.RawHex ?? Field.value?.HeadHex ?? Field.value ?? null) + `/${Field.length ?? Field.value?.length ?? ''}`;
    const Slots = new Map(); // "crc#occurrence" -> per-request raw + sanitized
    const Requests = Rows.map((Capture, Index) => {
        const Key = Lib.SplitUrl(Capture.Request.url).SessionKey;
        if (!Sessions.has(Key)) Sessions.set(Key, `S${Sessions.size + 1}`);
        const Seen = new Map();
        for (const Field of Lib.FieldsOf(Capture.Request)) {
            const Occurrence = Seen.get(Field.CrcHex) || 0;
            Seen.set(Field.CrcHex, Occurrence + 1);
            const Slot = `${Field.CrcHex}#${Occurrence}`;
            if (!Slots.has(Slot)) Slots.set(Slot, { crc: Field.CrcHex, occurrence: Occurrence, type_name: Field.TypeName, raw: [], clean: [] });
            const Entry = Slots.get(Slot);
            Entry.raw[Index] = Raw(Field);
            Entry.clean[Index] = Lib.SanitizeField(Field, Secrets);
        }
        const Previous = Rows[Index - 1];
        return {
            n: Index + 1,
            captured_at: Capture.Request.CapturedAt,
            seconds_since_previous: Previous ? Number(((Date.parse(Capture.Request.CapturedAt) - Date.parse(Previous.Request.CapturedAt)) / 1000).toFixed(1)) : null,
            session_ref: Sessions.get(Key),
            server_run: `pid-${Capture.Pid}`,
            body_bytes: Capture.Request.BodyBytes,
            field_count: Lib.FieldsOf(Capture.Request).length,
            body_digest: Digest(Capture).slice(0, 12),
            response_shape: Lib.Shape(Capture.Response),
            response_result: (() => {
                const Result = Lib.FieldsOf(Capture.Response).find((Field) => (Number(Field.Crc) >>> 0) === Lib.ResultCrc);
                return Result ? { crc: Lib.Hex32(Result.value), name: Lib.NameOf(Result.value) } : null;
            })(),
        };
    });

    const Fields = [...Slots.values()].map((Slot) => {
        const Present = Slot.raw.filter((Value) => Value !== undefined);
        const Distinct = new Set(Present);
        const First = Slot.clean.find(Boolean);
        const Published = First.redacted ? null : Slot.clean.map((Item) => (Item ? Item.value : undefined));
        return {
            crc: Slot.crc,
            occurrence: Slot.occurrence,
            name: First.name,
            type_name: Slot.type_name,
            present_in: Present.length,
            behaviour: Present.length < Requests.length ? 'not-always-present' : Distinct.size === 1 ? 'constant' : 'varies',
            distinct_values: Distinct.size,
            redacted: First.redacted || null,
            bytes: First.bytes ?? null,
            values: Published && Distinct.size > 1 ? Published : undefined,
            value: Published && Distinct.size === 1 ? Published.find((Item) => Item !== undefined) : undefined,
        };
    });

    const Digests = new Set(Requests.map((Request) => Request.body_digest));
    const Report = {
        schema_version: 0,
        kind: 'request-comparison',
        route_key: String(Options.route).toLowerCase(),
        requests: Requests.length,
        sessions: Sessions.size,
        byte_identical: Digests.size === 1,
        distinct_bodies: Digests.size,
        body_bytes: [...new Set(Requests.map((Request) => Request.body_bytes))],
        field_counts: [...new Set(Requests.map((Request) => Request.field_count))],
        constant_fields: Fields.filter((Field) => Field.behaviour === 'constant').length,
        varying_fields: Fields.filter((Field) => Field.behaviour !== 'constant').map((Field) => `${Field.crc}#${Field.occurrence}`),
        note: 'Field names appear only where CRC32(name) equals the id. "varies" for a redacted field means its private value changed; the value itself is never published. Binary fields are compared by length and leading bytes only, so a binary reported constant may still differ deeper in; body_digest is the authority on whether two requests are byte-identical.',
        timeline: Requests,
        fields: Fields,
    };
    const Text = `${JSON.stringify(Report, null, 2)}\n`;
    Lib.AssertNoSecrets(Text.replace(/"body_digest": "[0-9a-f]+",?/g, ''), Secrets, 'request comparison');
    if (Options.out) {
        Fs.mkdirSync(Path.dirname(Path.resolve(Options.out)), { recursive: true });
        Fs.writeFileSync(Path.resolve(Options.out), Text, 'utf8');
    }
    const { fields, timeline, ...Summary } = Report;
    console.log(JSON.stringify(Summary, null, 2));
    for (const Request of timeline) console.log(`${String(Request.n).padStart(3)} ${Request.captured_at.slice(11, 23)} +${String(Request.seconds_since_previous ?? '-').padStart(6)}s ${Request.session_ref} ${Request.server_run} ${Request.body_bytes}B ${Request.field_count}f ${Request.body_digest} -> ${Request.response_result?.name || Request.response_result?.crc} [${Request.response_shape.length} fields]`);
    for (const Field of fields) console.log(`${Field.crc}#${String(Field.occurrence).padEnd(2)} ${Field.type_name.padEnd(9)} ${Field.behaviour.padEnd(18)} ${Field.redacted ? `<${Field.redacted}${Field.bytes ? ` ${Field.bytes}B` : ''}> distinct=${Field.distinct_values}` : Field.value !== undefined ? Field.value : JSON.stringify([...new Set(Field.values)])}`);
}

try {
    Main();
} catch (Failure) {
    console.error(`diff-requests: ${Failure.message}`);
    process.exit(1);
}
