#!/usr/bin/env node
'use strict';

// Mutation check for the reservation lifecycle. Re-introduces each past bug into the service
// source, runs the Postgres integration suite, and reports which tests catch it. A mutation that
// no test catches ("survived") makes the script exit non-zero. Source files are always restored.
//
// Run (from backend/), against a throwaway database whose name ends in "-test":
//   TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55434/sneaker-drop-mut-test \
//     node scripts/mutation-check.js
//
// Optional: MUTATION_LOG_DIR=<dir> writes the full test output of each mutation to <dir>/<id>.log.

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const svc = (name) => path.join(root, 'src', 'services', `${name}.js`);

const MUTATIONS = [
  {
    id: 'a', name: 'purchase no longer requires status = pending',
    file: svc('PurchaseService'),
    edits: [["AND status = 'pending' AND \"expiresAt\" > now()", 'AND "expiresAt" > now()']],
  },
  {
    id: 'b', name: 'purchase does not enforce the deadline',
    file: svc('PurchaseService'),
    edits: [["AND status = 'pending' AND \"expiresAt\" > now()", "AND status = 'pending'"]],
  },
  {
    id: 'c', name: 'sweeper ignores status',
    file: svc('ExpiryService'),
    edits: [
      ["WHERE status = 'pending' AND \"expiresAt\" <=", 'WHERE "expiresAt" <='],
      ["WHERE r.id = due.id AND r.status = 'pending'", 'WHERE r.id = due.id'],
    ],
  },
  {
    id: 'd', name: 'sweeper waits on locked rows (no SKIP LOCKED)',
    file: svc('ExpiryService'),
    edits: [['FOR UPDATE SKIP LOCKED', 'FOR UPDATE']],
  },
  {
    id: 'e', name: 'reserve has no stock condition',
    file: svc('ReservationService'),
    edits: [['WHERE id = :dropId AND "availableStock" + :released > 0', 'WHERE id = :dropId']],
  },
  {
    id: 'f', name: 'sweeper advisory lock is a no-op',
    file: svc('ExpiryService'),
    edits: [['pg_try_advisory_xact_lock(:key) AS acquired', 'true AS acquired']],
  },
  {
    id: 'g', name: "reserve leaves the caller's overdue hold to the sweeper",
    file: svc('ReservationService'),
    edits: [[`AND status = 'pending' AND "expiresAt" <= now()`, 'AND false']],
  },
  {
    id: 'h', name: "reserve expires the caller's hold before its deadline",
    file: svc('ReservationService'),
    edits: [[`AND status = 'pending' AND "expiresAt" <= now()`, "AND status = 'pending'"]],
  },
];

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  console.error('TEST_DATABASE_URL is required.');
  process.exit(2);
}
const dbName = decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
if (!dbName.endsWith('-test')) {
  console.error(`Refusing to run: database "${dbName}" does not end in "-test".`);
  process.exit(2);
}

const originals = new Map();
function restoreAll() {
  for (const [file, text] of originals) fs.writeFileSync(file, text);
  originals.clear();
}
process.on('SIGINT', () => { restoreAll(); process.exit(130); });
process.on('SIGTERM', () => { restoreAll(); process.exit(143); });

function apply(m) {
  let text = fs.readFileSync(m.file, 'utf8');
  if (!originals.has(m.file)) originals.set(m.file, text);
  for (const [search, replace] of m.edits) {
    const count = text.split(search).length - 1;
    if (count !== 1) throw new Error(`mutation ${m.id}: expected exactly one match for ${JSON.stringify(search)} in ${m.file}, found ${count}`);
    text = text.replace(search, () => replace);
  }
  fs.writeFileSync(m.file, text);
}

function runSuite() {
  const r = spawnSync('npm', ['run', 'test:db', '--silent'], {
    cwd: root, env: process.env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
  const out = `${r.stdout || ''}\n${r.stderr || ''}`;
  // Top-level failing tests are reported as "✖ name (123ms)" with no indentation.
  const failing = [...new Set(out.split('\n')
    .filter((l) => l.startsWith('✖') && !l.startsWith('✖ failing tests'))
    .map((l) => l.replace(/^✖\s*/, '').replace(/\s*\([\d.]+ms\)\s*$/, '')))];
  return { failing, out, status: r.status };
}

const results = [];
const started = Date.now();
try {
  // Baseline: the unmutated suite must pass, otherwise the table means nothing.
  const base = runSuite();
  if (base.status !== 0 || base.failing.length) {
    console.error('Baseline suite is not green; aborting.\n' + base.out.slice(-4000));
    process.exitCode = 2;
  } else {
    for (const m of MUTATIONS) {
      try {
        apply(m);
        const r = runSuite();
        results.push({ m, ...r });
        if (process.env.MUTATION_LOG_DIR) {
          fs.mkdirSync(process.env.MUTATION_LOG_DIR, { recursive: true });
          fs.writeFileSync(path.join(process.env.MUTATION_LOG_DIR, `${m.id}.log`), r.out);
        }
      } finally {
        restoreAll();
      }
    }
    console.log('| mutation | failing tests | count |');
    console.log('| --- | --- | --- |');
    for (const { m, failing } of results) {
      const names = failing.length ? failing.join('<br>') : 'SURVIVED';
      console.log(`| ${m.id}. ${m.name} | ${names} | ${failing.length} |`);
    }
    console.log(`\nRun time: ${((Date.now() - started) / 1000).toFixed(0)}s`);
    const survived = results.filter((r) => r.failing.length === 0);
    if (survived.length) {
      console.error(`Survived mutations: ${survived.map((r) => r.m.id).join(', ')}`);
      process.exitCode = 1;
    }
  }
} finally {
  restoreAll();
}
