#!/usr/bin/env node
'use strict';

// Prints a ledger as a compact table:  node tools/m001/show-ledger.js <ledger.json>

const Fs = require('node:fs');

const Ledger = JSON.parse(Fs.readFileSync(process.argv[2], 'utf8'));
console.log(`${Ledger.label}  (${Ledger.window.start_basis})`);
for (const Entry of Ledger.entries) {
    console.log(
        [
            String(Entry.order).padStart(3),
            `${(Entry.offset_ms / 1000).toFixed(1)}s`.padStart(7),
            Entry.method.padEnd(4),
            Entry.route_key.padEnd(36),
            String(Entry.request_bytes).padStart(6),
            '->',
            String(Entry.response_bytes).padStart(5),
            Entry.response_bare_ack ? 'ack ' : 'data',
            Entry.response_class.padEnd(17),
            Entry.evidence_class.padEnd(11),
            Entry.experimental ? 'EXPERIMENTAL' : '',
            /CLASSIFICATION_MISMATCH/.test(Entry.notes || '') ? 'MISMATCH' : '',
        ].join(' '),
    );
}
console.log(JSON.stringify(Ledger.summary, null, 2));
