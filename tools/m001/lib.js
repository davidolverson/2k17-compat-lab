'use strict';

// Shared helpers for the M001 evidence tools. These read the replacement
// runtime's capture sidecars (request + response JSON written next to each raw
// body) and never touch the running server or the game client.

const Fs = require('node:fs');
const Path = require('node:path');

const CrcTable = (() => {
    const Table = new Uint32Array(256);
    for (let N = 0; N < 256; N++) {
        let C = N;
        for (let K = 0; K < 8; K++) C = C & 1 ? 0xedb88320 ^ (C >>> 1) : C >>> 1;
        Table[N] = C >>> 0;
    }
    return Table;
})();

function Crc32(Text) {
    const Bytes = Buffer.isBuffer(Text) ? Text : Buffer.from(String(Text), 'utf8');
    let C = 0xffffffff;
    for (let I = 0; I < Bytes.length; I++) C = CrcTable[(C ^ Bytes[I]) & 0xff] ^ (C >>> 8);
    return (C ^ 0xffffffff) >>> 0;
}

const Hex32 = (Value) => `0x${(Number(Value) >>> 0).toString(16).toUpperCase().padStart(8, '0')}`;

// A name is only ever attached to a CRC by recomputing CRC32(name) and matching
// it. That makes every label here DERIVED and reproducible; a name that does
// not hash to the observed id is never shown.
const CandidateNames = [
    'RESULT', 'SUCCESS', 'USERID', 'SESSION_KEY', 'GAMERTAG', 'TEAM_ID', 'EXTRA_DATA_SIZE', 'VERSION',
    'FILETYPE', 'FILENAME', 'DESCRIPTION', 'FILEID', 'DATASIZE', 'FILEPATH', 'TITLEID', 'STRING',
    'PARK_AFFILIATION', 'PARK_RIVAL_PARK', 'PARK_STREAK', 'PARK_TYPE', 'ACCESS_DENIED', 'MAXRESULTS',
    'CATEGORY', 'FILTER', 'ORDERBY', 'DISPLAYNAME', 'MOREAVAILABLE', 'CORRELATION_ID', 'NOT_FOUND', 'IN_PROGRESS',
];
const NameByCrc = new Map(CandidateNames.map((Name) => [Crc32(Name), Name]));
const NameOf = (Crc) => NameByCrc.get(Number(Crc) >>> 0) || null;

// Fields whose VALUE identifies a person, an account, a session or a save.
const IdentityCrcs = new Set([
    Crc32('USERID'),
    Crc32('SESSION_KEY'),
    Crc32('GAMERTAG'),
    0x3e6d9a3b, // display name carried by login / keep-alive
    0xd5e5f21d, // career save id
]);

// Value types that are safe to publish as-is (subject to the large-integer rule).
const ScalarTypes = new Set(['U32', 'U64', 'S64', 'StringCrc', 'VCDate', 'F32', 'Bool']);
const LargeInteger = 10n ** 15n; // platform ids and session keys live above this

function ParseCaptureName(Name) {
    const Match = /^(\d{17})_(\d+)_(\d{6})_([A-Za-z]+)_(.*)$/.exec(Name);
    if (!Match) return null;
    return { Stamp: Match[1], Pid: Number(Match[2]), Seq: Number(Match[3]), Method: Match[4] };
}

function LoadCaptures(Directory) {
    const Rows = [];
    for (const File of Fs.readdirSync(Directory)) {
        if (!File.endsWith('.json') || File.endsWith('.response.json')) continue;
        const Base = File.slice(0, -'.json'.length);
        const Meta = ParseCaptureName(Base);
        if (!Meta) continue;
        const Read = (Suffix) => {
            try {
                return JSON.parse(Fs.readFileSync(Path.join(Directory, `${Base}${Suffix}`), 'utf8'));
            } catch {
                return null;
            }
        };
        const Request = Read('.json');
        if (!Request) continue;
        Rows.push({ Base, ...Meta, Request, Response: Read('.response.json') });
    }
    Rows.sort((A, B) => (A.Base < B.Base ? -1 : A.Base > B.Base ? 1 : 0));
    return Rows;
}

function SplitUrl(Url) {
    const Parsed = new URL(String(Url || '/'), 'https://replacement.invalid');
    const Parts = Parsed.pathname.split('/').filter(Boolean);
    return {
        Pathname: Parsed.pathname,
        Route: Parts.slice(-2).join('/').toLowerCase(),
        SessionKey: Parsed.searchParams.get('x') || '',
    };
}

function FieldsOf(Sidecar) {
    return Sidecar?.Parse?.Status === 'ok' ? Sidecar.Parse.value.Fields || [] : [];
}

// Secrets: lower-cased private values (see CollectSecrets). A scalar that merely
// REPEATS an identity value under an unrelated field id is redacted too.
function SanitizeField(Field, Secrets = null) {
    const Crc = Number(Field.Crc) >>> 0;
    const Out = { index: Field.index, crc: Hex32(Crc), name: NameOf(Crc), type: Field.TypeHex, type_name: Field.TypeName };
    if (IdentityCrcs.has(Crc)) return { ...Out, value: null, redacted: 'identity' };
    if (Secrets && (typeof Field.value === 'string' || typeof Field.value === 'number') && Secrets.has(String(Field.value).toLowerCase())) {
        return { ...Out, value: null, redacted: 'repeats-identity-value' };
    }
    if (!ScalarTypes.has(Field.TypeName)) {
        const Bytes = typeof Field.length === 'number' ? Field.length : null;
        return { ...Out, value: null, redacted: 'opaque', bytes: Bytes };
    }
    if (Field.TypeName === 'U64' || Field.TypeName === 'S64') {
        let Big = null;
        try {
            Big = BigInt(Field.value);
        } catch {}
        if (Big === null || Big >= LargeInteger || Big <= -LargeInteger) return { ...Out, value: null, redacted: 'large-integer' };
        return { ...Out, value: String(Field.value) };
    }
    if (Field.TypeName === 'VCDate') {
        // A timestamp, not an identifier; published as its decoded date plus raw hex.
        return { ...Out, value: Field.IsoDate ?? null, value_hex: Field.ValueHex ?? null };
    }
    if (Field.TypeName === 'StringCrc') {
        return { ...Out, value: Hex32(Field.value), value_name: NameOf(Field.value) };
    }
    if (Field.TypeName === 'F32') return { ...Out, value: Number(Number(Field.value).toPrecision(7)) };
    return { ...Out, value: typeof Field.value === 'bigint' ? String(Field.value) : Field.value };
}

function SanitizeBody(Sidecar, Secrets = null) {
    const Value = Sidecar?.Parse?.Status === 'ok' ? Sidecar.Parse.value : null;
    return {
        body_bytes: Sidecar?.BodyBytes ?? null,
        declared_fieldlist_bytes: Sidecar?.DeclaredFieldListBytes ?? null,
        parse_status: Sidecar?.Parse?.Status ?? 'missing',
        fields: FieldsOf(Sidecar).map((Field) => SanitizeField(Field, Secrets)),
        data_bytes: Value?.Data?.length ?? 0,
        trailing_bytes: Value?.Trailing?.length ?? 0,
    };
}

const PublicHeaders = ['user-agent', 'content-type', 'vcfieldlist_size', 'content-length'];

function SanitizeRequest(Capture, Secrets = null) {
    const { Pathname, Route } = SplitUrl(Capture.Request.url);
    const Headers = {};
    for (const Name of PublicHeaders) if (Capture.Request.headers?.[Name] !== undefined) Headers[Name] = Capture.Request.headers[Name];
    return {
        schema_version: 0,
        kind: 'sanitized-request',
        title: 'nba2k17-pc',
        method: Capture.Request.method,
        path: Pathname,
        route: Route,
        captured_at: Capture.Request.CapturedAt,
        headers: Headers,
        ...SanitizeBody(Capture.Request, Secrets),
    };
}

function SanitizeResponse(Capture, Secrets = null) {
    const { Pathname, Route } = SplitUrl(Capture.Request.url);
    return {
        schema_version: 0,
        kind: 'sanitized-response',
        source: 'replacement-runtime (NOT an original-service capture)',
        path: Pathname,
        route: Route,
        captured_at: Capture.Response?.CapturedAt ?? null,
        ...SanitizeBody(Capture.Response, Secrets),
    };
}

// Every private value seen in the raw captures. Output is refused if any of
// them survives sanitization, so a new field type fails closed instead of leaking.
function CollectSecrets(Captures) {
    const Secrets = new Set();
    const Add = (Value) => {
        const Text = String(Value ?? '').trim();
        if (Text.length >= 4) Secrets.add(Text.toLowerCase());
    };
    for (const Capture of Captures) {
        const Key = SplitUrl(Capture.Request.url).SessionKey;
        if (Key) {
            Add(Key);
            try {
                Add(BigInt(Key).toString(16));
            } catch {}
        }
        for (const Side of [Capture.Request, Capture.Response]) {
            for (const Field of FieldsOf(Side)) {
                const Crc = Number(Field.Crc) >>> 0;
                const IsText = Field.TypeName === 'String8' || Field.TypeName === 'String16';
                if (IsText && typeof Field.value === 'string') Add(Field.value);
                if (IdentityCrcs.has(Crc) && (typeof Field.value === 'string' || typeof Field.value === 'number')) {
                    Add(Field.value);
                    try {
                        Add(BigInt(Field.value).toString(16));
                    } catch {}
                }
            }
        }
    }
    return Secrets;
}

function AssertNoSecrets(Text, Secrets, Label) {
    const Lower = String(Text).toLowerCase();
    for (const Secret of Secrets) {
        if (Lower.includes(Secret)) throw new Error(`refusing to write ${Label}: a private value survived sanitization (length ${Secret.length})`);
    }
    if (/\d{15,}/.test(Text.replace(/"captured_at"[^,]*,/g, ''))) {
        throw new Error(`refusing to write ${Label}: a 15+ digit number survived sanitization`);
    }
}

const ResultCrc = Crc32('RESULT');
const SuccessCrc = Crc32('SUCCESS');

// A response is a "bare ack" when it carries RESULT=SUCCESS and nothing else.
function IsBareAck(Sidecar) {
    const Fields = FieldsOf(Sidecar);
    return Fields.length === 1 && (Number(Fields[0].Crc) >>> 0) === ResultCrc && (Number(Fields[0].value) >>> 0) === SuccessCrc;
}

const Shape = (Sidecar) => FieldsOf(Sidecar).map((Field) => `${Field.CrcHex}:${Field.TypeName}`);

function Args(Argv) {
    const Out = {};
    for (let I = 0; I < Argv.length; I++) {
        if (!Argv[I].startsWith('--')) continue;
        const Next = Argv[I + 1];
        if (Next === undefined || Next.startsWith('--')) Out[Argv[I].slice(2)] = true;
        else Out[Argv[I].slice(2)] = Argv[++I];
    }
    return Out;
}

module.exports = {
    Crc32, Hex32, NameOf, CandidateNames, IdentityCrcs, LoadCaptures, SplitUrl, FieldsOf, SanitizeField,
    SanitizeRequest, SanitizeResponse, CollectSecrets, AssertNoSecrets, IsBareAck, Shape, Args,
    ResultCrc, SuccessCrc,
};
