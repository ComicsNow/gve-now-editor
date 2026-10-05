#!/usr/bin/env node
'use strict';

// Preflight CLI. `check` resolves the config, opens the DB read-only and prints
// the census the server would serve — without listening and without writing.

const fs = require('fs');
const path = require('path');

const { loadConfig, validateConfig } = require('../src/server/config');
const { openDatabase } = require('../src/server/db');
const { buildCheckReport } = require('../src/server/check');

function printReport(report, configPath) {
  const { config, db, sidecars } = report;
  console.log('gve-now check');
  console.log(`  config file:     ${configPath}${fs.existsSync(configPath) ? '' : ' (not found — using defaults)'}`);
  console.log(`  port:            ${config.port} (bind ${config.bind})`);
  console.log(`  comics-now root: ${config.comicsNowRoot}`);
  if (db.ok) {
    console.log(`  database:        ${config.dbPath} — ok, ${db.comics} comics, ${db.guidedCompleted} completed`);
  } else {
    console.log(`  database:        ${config.dbPath} — UNREADABLE`);
  }
  console.log(
    sidecars.present
      ? `  guided view dir: ${config.guidedViewDir} — ok, ${sidecars.files} sidecars`
      : `  guided view dir: ${config.guidedViewDir} — not created yet`
  );
  if (sidecars.orphans.length > 0) {
    console.log(`  orphans:         ${sidecars.orphans.length} sidecars with no comics row`);
  }
  if (sidecars.missing.length > 0) {
    console.log(`  missing files:   ${sidecars.missing.length} completed rows with no sidecar`);
  }
}

function main(argv = process.argv.slice(2)) {
  const command = argv[0] || 'check';
  if (command !== 'check') {
    console.error(`unknown command: ${command}`);
    console.error('usage: node bin/gve-now.js check');
    return 2;
  }

  const configPath = process.env.GVE_NOW_CONFIG || path.join(__dirname, '..', 'config.json');
  const config = loadConfig({ configPath });
  const { errors, warnings } = validateConfig(config);
  for (const w of warnings) console.warn(`warning: ${w}`);
  if (errors.length > 0) {
    for (const e of errors) console.error(`error: ${e}`);
    return 1;
  }

  let db;
  try {
    db = openDatabase(config.dbPath, { readonly: true });
  } catch (err) {
    console.error(`error: cannot open database ${config.dbPath}: ${err.message}`);
    return 1;
  }
  try {
    const report = buildCheckReport({ config, db });
    printReport(report, configPath);
    for (const e of report.errors) console.error(`error: ${e}`);
    return report.errors.length > 0 ? 1 : 0;
  } finally {
    db.close();
  }
}

if (require.main === module) process.exit(main());

module.exports = { main, printReport };
