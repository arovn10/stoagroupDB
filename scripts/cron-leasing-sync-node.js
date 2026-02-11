#!/usr/bin/env node
/**
 * Render cron: check for Domo changes; if changes, run sync. Needs API_BASE_URL and LEASING_SYNC_WEBHOOK_SECRET (optional).
 */
const https = require('https');
const http = require('http');

const base = (process.env.API_BASE_URL || '').replace(/\/$/, '');
const secret = process.env.LEASING_SYNC_WEBHOOK_SECRET || '';
if (!base) {
  console.error('API_BASE_URL not set');
  process.exit(1);
}

const lib = base.startsWith('https') ? https : http;
const headers = { 'Content-Type': 'application/json' };
if (secret) headers['X-Sync-Secret'] = secret;

function get(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, base);
    const req = lib.get(url, { headers }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve(body));
    });
    req.on('error', reject);
  });
}

function post(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, base);
    const req = lib.request(url, { method: 'POST', headers }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve(body));
    });
    req.on('error', reject);
    req.end();
  });
}

(async () => {
  try {
    const check = await get('/api/leasing/sync-check');
    if (!check.includes('"changes":true')) process.exit(0);
    await post('/api/leasing/sync-from-domo');
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
