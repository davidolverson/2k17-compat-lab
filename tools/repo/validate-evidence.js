#!/usr/bin/env node
'use strict';

// Schema and privacy validation for everything under evidence/ and
// sanitized-fixtures/. Fails closed: an unknown document kind, an unparseable
// file or a dangling fixture reference is a failure, never a skip.
//
//   node tools/repo/validate-evidence.js

const Fs = require('node:fs');
const Path = require('node:path');
const Gate = require('../m001/gate');

const EvidenceClasses = ['OBSERVED', 'DERIVED', 'REFERENCE', 'HYPOTHESIS', 'IMPLEMENTED'];
const ResponseClasses = ['intentional', 'reference-derived', 'generic-fallback', 'error'];
const Redactions = ['identity', 'repeats-identity-value', 'opaque', 'large-integer'];
const IdentityNames = ['USERID', 'SESSION_KEY', 'GAMERTAG'];
// Keys that would carry a fingerprint of raw, identity-bearing bytes. A
// manifest may carry the client executable hash and a sanitized config digest.
const FingerprintKey = /(digest|(^|_)sha\d*(_|$)|hash|fingerprint|checksum)/i;
const AllowedFingerprintKeys = { 'experiment-manifest': ['sha256', 'config_digest'] };

const IsObject = (Value) => Value !== null && typeof Value === 'object' && !Array.isArray(Value);
const IsCrc = (Value) => typeof Value === 'string' && /^0x[0-9A-F]{8}$/.test(Value);

function Walk(Value, Visit, Trail = '') {
    if (Array.isArray(Value)) Value.forEach((Item, Index) => Walk(Item, Visit, `${Trail}[${Index}]`));
    else if (IsObject(Value)) {
        for (const [Key, Item] of Object.entries(Value)) {
            Visit(Key, Item, `${Trail}.${Key}`);
            Walk(Item, Visit, `${Trail}.${Key}`);
        }
    }
}

function CheckFields(Fields, Need, Where) {
    Need(Array.isArray(Fields), `${Where}: fields must be a list`);
    for (const Field of Array.isArray(Fields) ? Fields : []) {
        Need(IsCrc(Field.crc), `${Where}: field crc must be 0x + 8 upper-case hex`);
        Need(typeof Field.type_name === 'string', `${Where}: field type_name is required`);
        if (Field.redacted !== undefined) {
            Need(Redactions.includes(Field.redacted), `${Where}: unknown redaction "${Field.redacted}"`);
            Need(Field.value === null, `${Where}: a redacted field must have value null`);
        }
        if (IdentityNames.includes(Field.name)) Need(Field.value === null && Field.redacted === 'identity', `${Where}: identity field ${Field.name} is not redacted`);
        if (['String8', 'String16', 'Binary'].includes(Field.type_name)) Need(Field.value === null, `${Where}: ${Field.type_name} content must never be published`);
    }
}

const Validators = {
    'sanitized-request'(Document, Need) {
        Need(typeof Document.path === 'string' && !Document.path.includes('?'), 'path must not carry a query string');
        Need(typeof Document.route === 'string', 'route is required');
        Need(IsObject(Document.headers) && Object.keys(Document.headers).every((Name) => ['user-agent', 'content-type', 'vcfieldlist_size', 'content-length'].includes(Name)), 'only whitelisted headers may be published');
        CheckFields(Document.fields, Need, 'request');
    },
    'sanitized-response'(Document, Need) {
        Need(typeof Document.path === 'string' && !Document.path.includes('?'), 'path must not carry a query string');
        Need(typeof Document.source === 'string' && /NOT an original-service capture/.test(Document.source), 'a replacement-runtime reply must say it is not an original-service capture');
        CheckFields(Document.fields, Need, 'response');
    },
    'park-dependency-ledger'(Document, Need, Exists) {
        Need(typeof Document.label === 'string', 'label is required');
        Need(IsObject(Document.window), 'window is required');
        Need(Number.isInteger(Document.summary?.classification_mismatches), 'summary.classification_mismatches must be a number');
        Need(Array.isArray(Document.entries) && Document.entries.length > 0, 'entries are required');
        for (const Entry of Document.entries || []) {
            const Where = `entry ${Entry.order}`;
            Need(EvidenceClasses.includes(Entry.evidence_class), `${Where}: evidence_class "${Entry.evidence_class}" is not an allowed class`);
            Need(ResponseClasses.includes(Entry.response_class), `${Where}: response_class "${Entry.response_class}" is not an allowed class`);
            Need(/^S\d+$/.test(Entry.session_ref || ''), `${Where}: session_ref must be a neutral label`);
            Need(typeof Entry.route === 'string' && !Entry.route.includes('?'), `${Where}: route must not carry a query string`);
            // The server cannot see the loading screen: a client stage in a ledger would be a guess.
            Need(Entry.client_stage === null, `${Where}: client_stage must stay null`);
            for (const Key of ['request_fixture', 'response_fixture']) {
                if (Entry[Key] !== null && Entry[Key] !== undefined) Need(Exists(Entry[Key]), `${Where}: ${Key} does not exist: ${Entry[Key]}`);
            }
        }
    },
    'request-comparison'(Document, Need) {
        Need(Array.isArray(Document.timeline) && Document.timeline.length === Document.requests, 'timeline length must equal requests');
        for (const Row of Document.timeline || []) {
            Need(/^B\d+$/.test(Row.body_variant || ''), `timeline ${Row.n}: body_variant must be a neutral label (B1, B2, ...)`);
            Need(/^S\d+$/.test(Row.session_ref || ''), `timeline ${Row.n}: session_ref must be a neutral label`);
        }
        const Variants = new Set((Document.timeline || []).map((Row) => Row.body_variant));
        Need(Variants.size === Document.distinct_bodies, 'distinct_bodies must equal the number of distinct body_variant labels');
    },
    'route-outcome-comparison'(Document, Need) {
        Need(typeof Document.route_key === 'string', 'route_key is required');
        Need(Array.isArray(Document.runs), 'runs must be a list');
    },
    'reply-provenance-analysis'(Document, Need) {
        Need(typeof Document.route === 'string', 'route is required');
        Need(Array.isArray(Document.fields_in_order), 'fields_in_order must be a list');
    },
    'experiment-manifest'(Document, Need, Exists) {
        for (const Problem of Gate.ValidateManifest(Document)) Need(false, Problem);
        for (const File of Array.isArray(Document.fixture_refs) ? Document.fixture_refs : []) Need(Exists(File), `fixture_refs names a missing file: ${File}`);
    },
};

// Problems for one parsed JSON document. Exists(path) resolves repository paths.
function ValidateDocument(Document, Exists = () => true) {
    const Problems = [];
    const Need = (Ok, Message) => {
        if (!Ok) Problems.push(Message);
    };
    if (!IsObject(Document)) return ['document is not a JSON object'];
    Need(Number.isInteger(Document.schema_version), 'schema_version is required');
    const Validator = Validators[Document.kind];
    if (!Validator) return [...Problems, `unknown document kind "${Document.kind}": add a validator before committing a new kind of evidence`];
    Validator(Document, Need, Exists);
    const Allowed = AllowedFingerprintKeys[Document.kind] || [];
    Walk(Document, (Key, _, Trail) => {
        if (FingerprintKey.test(Key) && !Allowed.includes(Key)) Need(false, `${Trail}: fingerprint-like key "${Key}" is not allowed in public evidence; use a neutral label`);
    });
    return Problems;
}

// Checks that apply to the raw text of any evidence file, JSON or JSONL.
function ValidateText(Text) {
    const Problems = [];
    if (/(?<!\d)\d{15,}(?!\d)/.test(Text)) Problems.push('a 15+ digit number is present (platform ids and session keys live in that range)');
    if (/[?&]x=\d+/.test(Text)) Problems.push('a session key query parameter is present');
    return Problems;
}

function ListFiles(Directory) {
    if (!Fs.existsSync(Directory)) return [];
    return Fs.readdirSync(Directory, { recursive: true, withFileTypes: true })
        .filter((Entry) => Entry.isFile())
        .map((Entry) => Path.join(Entry.parentPath || Entry.path, Entry.name));
}

function Main() {
    const Root = Path.resolve(__dirname, '../..');
    const Exists = (File) => typeof File === 'string' && Fs.existsSync(Path.join(Root, File));
    const Files = [...ListFiles(Path.join(Root, 'evidence')), ...ListFiles(Path.join(Root, 'sanitized-fixtures'))].sort();
    if (!Files.length) throw new Error('no evidence files found: refusing to report a clean result for an empty scan');
    let Failures = 0;
    const Kinds = {};
    for (const File of Files) {
        const Relative = Path.relative(Root, File).split(Path.sep).join('/');
        const Problems = [];
        let Text = null;
        try {
            Text = Fs.readFileSync(File, 'utf8');
        } catch {
            Problems.push('file could not be read');
        }
        if (Text !== null) {
            Problems.push(...ValidateText(Text));
            if (File.endsWith('.json')) {
                try {
                    const Document = JSON.parse(Text);
                    Kinds[Document.kind] = (Kinds[Document.kind] || 0) + 1;
                    Problems.push(...ValidateDocument(Document, Exists));
                } catch (Failure) {
                    Problems.push(`not valid JSON: ${Failure.message}`);
                }
            } else if (File.endsWith('.jsonl')) {
                Text.split(/\r?\n/).filter(Boolean).forEach((Line, Index) => {
                    try {
                        JSON.parse(Line);
                    } catch {
                        Problems.push(`line ${Index + 1} is not valid JSON`);
                    }
                });
                Kinds.jsonl = (Kinds.jsonl || 0) + 1;
            } else if (!File.endsWith('.md') && Path.basename(File) !== '.gitkeep') Problems.push('unexpected file type in an evidence directory');
        }
        for (const Problem of Problems) console.log(`FAIL  ${Relative}  ${Problem}`);
        Failures += Problems.length;
    }
    console.log(`\nevidence validation: ${Failures ? 'FAIL' : 'PASS'}  (${Files.length} files, ${Failures} problems; ${JSON.stringify(Kinds)})`);
    process.exitCode = Failures ? 1 : 0;
}

if (require.main === module) {
    try {
        Main();
    } catch (Failure) {
        console.error(`validate-evidence: ${Failure.message}`);
        process.exit(2);
    }
}

module.exports = { ValidateDocument, ValidateText, EvidenceClasses, ResponseClasses };
