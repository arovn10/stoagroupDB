#!/usr/bin/env node
/**
 * Reseed MMR from Domo then verify budgeted occupancy columns are populated.
 * Exits 0 only if both reseed and verification succeed.
 *
 * Usage: node scripts/reseed-and-verify-mmr.js
 * Env: same as reseed-mmr-from-domo.js and verify-mmr-budgeted-occupancy.js
 */
const { execSync } = require('child_process');
const path = require('path');

const reseed = path.join(__dirname, 'reseed-mmr-from-domo.js');
const verify = path.join(__dirname, 'verify-mmr-budgeted-occupancy.js');

try {
  execSync(`node "${reseed}"`, { stdio: 'inherit' });
  execSync(`node "${verify}"`, { stdio: 'inherit' });
} catch (e) {
  process.exit(e.status ?? 1);
}
