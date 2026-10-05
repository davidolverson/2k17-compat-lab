#!/usr/bin/env node
'use strict';

// Workflow hygiene (Master Spec section 19): third-party actions pinned to
// full commit SHAs, explicit least-privilege permissions, no secrets and no
// privileged triggers in pull-request CI.
//
//   node tools/repo/check-workflows.js

const Fs = require('node:fs');
const Path = require('node:path');

// Problems for one workflow file's text. Line-based on purpose: it has no
// dependency to trust, and anything it cannot recognise as safe is reported.
function InspectWorkflow(Text) {
    const Problems = [];
    const Lines = Text.split(/\r?\n/).map((Line) => Line.replace(/\s+#.*$/, ''));
    if (!Lines.some((Line) => /^permissions:/.test(Line))) Problems.push('no top-level permissions block: the default token would be broader than needed');
    Lines.forEach((Line, Index) => {
        const At = `line ${Index + 1}`;
        const Uses = /^\s*-?\s*uses:\s*(\S+)/.exec(Line);
        if (Uses) {
            const Target = Uses[1].replace(/^['"]|['"]$/g, '');
            const Local = Target.startsWith('./');
            if (!Local && !/@[0-9a-f]{40}$/.test(Target)) Problems.push(`${At}: action is not pinned to a full commit SHA: ${Target}`);
        }
        if (/^\s*[a-z-]+:\s*write\s*$/.test(Line) || /^\s*permissions:\s*write-all\s*$/.test(Line)) Problems.push(`${At}: write permission requested`);
        if (/\bpull_request_target\b/.test(Line)) Problems.push(`${At}: pull_request_target runs untrusted code with repository privileges`);
        if (/\bworkflow_run\b/.test(Line)) Problems.push(`${At}: workflow_run can hand privileges to untrusted input`);
        if (/\$\{\{\s*secrets\./.test(Line)) Problems.push(`${At}: a secret is referenced; CI in this repository uses none`);
        if (/\$\{\{\s*github\.event\.(pull_request|issue|comment|head_commit)\b[^}]*\}\}/.test(Line) && !/^\s*(if|group):/.test(Line)) Problems.push(`${At}: event text is interpolated into the workflow (script-injection risk)`);
    });
    return Problems;
}

function Main() {
    const Directory = Path.resolve(__dirname, '../../.github/workflows');
    const Files = Fs.existsSync(Directory) ? Fs.readdirSync(Directory).filter((Name) => /\.ya?ml$/.test(Name)) : [];
    if (!Files.length) throw new Error('no workflow files found: refusing to report a clean result for an empty scan');
    let Count = 0;
    for (const File of Files) {
        for (const Problem of InspectWorkflow(Fs.readFileSync(Path.join(Directory, File), 'utf8'))) {
            console.log(`FAIL  .github/workflows/${File}  ${Problem}`);
            Count += 1;
        }
    }
    console.log(`\nworkflow hygiene: ${Count ? 'FAIL' : 'PASS'}  (${Files.length} workflow files, ${Count} problems)`);
    process.exitCode = Count ? 1 : 0;
}

if (require.main === module) {
    try {
        Main();
    } catch (Failure) {
        console.error(`check-workflows: ${Failure.message}`);
        process.exit(2);
    }
}

module.exports = { InspectWorkflow };
