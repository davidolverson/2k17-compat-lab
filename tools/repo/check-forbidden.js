#!/usr/bin/env node
'use strict';

// Forbidden-artifact and privacy check over every file git would publish
// (tracked files plus untracked files that are not ignored).
//
//   node tools/repo/check-forbidden.js [--json]
//
// Fails closed: a file that cannot be read is a finding, not a pass. An
// exception needs an entry in forbidden-allow.json naming the path, the rule
// and the reason, so it is reviewed like any other change.

const ChildProcess = require('node:child_process');
const Crypto = require('node:crypto');
const Fs = require('node:fs');
const Path = require('node:path');

const MaxBytes = 2 * 1024 * 1024;

// Commercial binaries/assets, raw captures, key material and archives that could hide any of them.
const ForbiddenExtensions = new Set([
    'exe', 'dll', 'sys', 'msi', 'iff', 'ptf', 'arc', 'bin', 'cdx', 'pak',
    'pcap', 'pcapng', 'etl', 'har',
    'key', 'pem', 'pfx', 'p12', 'pkcs12', 'crt', 'cer', 'der', 'jks',
    'zip', '7z', 'rar', 'tar', 'gz', 'cab', 'iso',
]);
const ForbiddenNames = [/^\.env(\..*)?$/i, /^steam_emu\.ini$/i, /^steam_appid\.txt$/i, /^id_(rsa|ed25519|ecdsa)$/i];

const ContentRules = [
    { rule: 'private-key', pattern: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/ },
    { rule: 'steamid64', pattern: /(?<!\d)7656119\d{10}(?!\d)/ },
    { rule: 'session-key-in-url', pattern: /[?&]x=\d{6,}/ },
    { rule: 'windows-user-path', pattern: /[A-Za-z]:[\\/]+Users[\\/]+(?!Public\b|Default\b|<|%|\$|\{|USERNAME\b|you\b|example\b|\.\.\.)[^\\/\s"'`<>|*)]+/ },
    { rule: 'unix-home-path', pattern: /(?<![\w.])\/(?:home|Users|c\/Users)\/(?!<|\$|\{|example\b|you\b|runner\b)[A-Za-z0-9._-]+/ },
    { rule: 'github-token', pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})\b/ },
    { rule: 'aws-access-key', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
    { rule: 'bearer-token', pattern: /\bBearer\s+[A-Za-z0-9._~+/-]{24,}=*/ },
    { rule: 'email-address', pattern: /\b[A-Za-z0-9._%+-]+@(?!example\.(?:com|org|net)\b|[A-Za-z0-9.-]*\.invalid\b|anthropic\.com\b|users\.noreply\.github\.com\b)[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\b/ },
];

const Sha256 = (Text) => Crypto.createHash('sha256').update(Text, 'utf8').digest('hex');

// Private terms (account names, machine names) are listed only as SHA-256 of
// the lower-cased term, so the list itself does not publish them.
function LoadPrivateTerms(File) {
    if (!Fs.existsSync(File)) return new Set();
    return new Set(Fs.readFileSync(File, 'utf8').split(/\r?\n/).map((Line) => Line.replace(/#.*$/, '').trim().toLowerCase()).filter((Line) => /^[0-9a-f]{64}$/.test(Line)));
}

function LoadAllow(File) {
    if (!Fs.existsSync(File)) return [];
    const Entries = JSON.parse(Fs.readFileSync(File, 'utf8')).allow;
    for (const Entry of Entries) {
        if (!Entry.path || !Entry.rule || !Entry.reason) throw new Error(`${File}: every allow entry needs path, rule and reason`);
    }
    return Entries;
}

const IsBinary = (Buffer_) => Buffer_.subarray(0, 8000).includes(0);

// Findings for one file. Content is a Buffer, or null when it could not be read.
function Inspect(RelativePath, Content, PrivateTerms = new Set()) {
    const Findings = [];
    const Add = (Rule, Detail, Line = null) => Findings.push({ path: RelativePath, rule: Rule, line: Line, detail: Detail });
    const Name = Path.posix.basename(RelativePath);
    const Extension = Name.includes('.') ? Name.split('.').pop().toLowerCase() : '';
    if (ForbiddenExtensions.has(Extension)) Add('forbidden-extension', `.${Extension}`);
    if (ForbiddenNames.some((Pattern) => Pattern.test(Name))) Add('forbidden-name', Name);
    if (Content === null) {
        Add('unreadable', 'file could not be read, so it could not be checked');
        return Findings;
    }
    if (Content.length > MaxBytes) Add('too-large', `${Content.length} bytes`);
    if (IsBinary(Content)) {
        Add('binary-content', 'binary file in a text-only repository');
        return Findings;
    }
    const Lines = Content.toString('utf8').split(/\r?\n/);
    Lines.forEach((Text, Index) => {
        for (const { rule, pattern } of ContentRules) {
            // The match is never echoed: a finding must not republish the value.
            if (pattern.test(Text)) Add(rule, 'pattern matched (value not shown)', Index + 1);
        }
        if (PrivateTerms.size) {
            for (const Token of Text.toLowerCase().split(/[^a-z0-9_-]+/)) {
                if (Token.length >= 4 && PrivateTerms.has(Sha256(Token))) Add('private-term', 'listed private term (value not shown)', Index + 1);
            }
        }
    });
    return Findings;
}

function ApplyAllow(Findings, Allow) {
    const Used = new Set();
    const Kept = Findings.filter((Finding) => {
        const Index = Allow.findIndex((Entry) => Entry.path === Finding.path && Entry.rule === Finding.rule);
        if (Index < 0) return true;
        Used.add(Index);
        return false;
    });
    // An allow entry that matches nothing is stale and would silently cover a future leak.
    const Stale = Allow.filter((_, Index) => !Used.has(Index)).map((Entry) => ({ path: Entry.path, rule: 'stale-allow-entry', line: null, detail: `no ${Entry.rule} finding left to allow` }));
    return [...Kept, ...Stale];
}

function PublishableFiles(Root) {
    const List = (...Arguments) => ChildProcess.execFileSync('git', ['-C', Root, ...Arguments], { encoding: 'utf8', timeout: 30000, maxBuffer: 64 * 1024 * 1024 }).split('\0').filter(Boolean);
    return [...new Set([...List('ls-files', '-z'), ...List('ls-files', '-z', '--others', '--exclude-standard')])].sort();
}

function Main() {
    const Root = Path.resolve(__dirname, '../..');
    const PrivateTerms = LoadPrivateTerms(Path.join(__dirname, 'private-terms.sha256'));
    const Allow = LoadAllow(Path.join(__dirname, 'forbidden-allow.json'));
    const Files = PublishableFiles(Root);
    if (!Files.length) throw new Error('git listed no files: refusing to report a clean result for an empty scan');
    let Findings = [];
    for (const File of Files) {
        let Content = null;
        try {
            Content = Fs.readFileSync(Path.join(Root, File));
        } catch {}
        Findings.push(...Inspect(File, Content, PrivateTerms));
    }
    Findings = ApplyAllow(Findings, Allow);
    if (process.argv.includes('--json')) console.log(JSON.stringify({ files: Files.length, findings: Findings }, null, 2));
    else {
        for (const Finding of Findings) console.log(`FAIL  ${Finding.rule.padEnd(20)} ${Finding.path}${Finding.line ? `:${Finding.line}` : ''}  ${Finding.detail}`);
        console.log(`\nforbidden-artifact check: ${Findings.length ? 'FAIL' : 'PASS'}  (${Files.length} files, ${Findings.length} findings, ${PrivateTerms.size} private terms, ${Allow.length} allow entries)`);
    }
    process.exitCode = Findings.length ? 1 : 0;
}

if (require.main === module) {
    try {
        Main();
    } catch (Failure) {
        console.error(`check-forbidden: ${Failure.message}`);
        process.exit(2);
    }
}

module.exports = { Inspect, ApplyAllow, LoadPrivateTerms, Sha256, ForbiddenExtensions, ContentRules };
