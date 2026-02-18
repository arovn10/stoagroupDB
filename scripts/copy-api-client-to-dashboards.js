#!/usr/bin/env node
/**
 * Copy the universal api-client.js from stoagroupDB to all dashboard repos.
 * Run from stoagroupDB root: npm run distribute
 * Dashboards then use this single source of truth; update once here and push from each repo.
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const SOURCE = path.join(REPO_ROOT, 'api-client.js');
const PARENT = path.resolve(REPO_ROOT, '..');

const TARGETS = [
  path.join(PARENT, 'banking dashboard', 'api-client.js'),
  path.join(PARENT, 'deal pipeline', 'api-client.js'),
  path.join(PARENT, 'leasing velocity report', 'api-client.js'),
  path.join(PARENT, 'reviews dashboard', 'api-client.js'),
];

if (!fs.existsSync(SOURCE)) {
  console.error('Source not found:', SOURCE);
  process.exit(1);
}

const content = fs.readFileSync(SOURCE, 'utf8');
let copied = 0;
let skipped = 0;

for (const dest of TARGETS) {
  const dir = path.dirname(dest);
  const name = path.basename(dir);
  if (!fs.existsSync(dir)) {
    console.log('Skip (dir missing):', name);
    skipped++;
    continue;
  }
  try {
    fs.writeFileSync(dest, content, 'utf8');
    console.log('Copied ->', name);
    copied++;
  } catch (err) {
    console.error('Failed', name, err.message);
  }
}

console.log('\nDone:', copied, 'copied', skipped ? ', ' + skipped + ' skipped (dir missing)' : '');
