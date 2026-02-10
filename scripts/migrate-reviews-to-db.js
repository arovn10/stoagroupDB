#!/usr/bin/env node
/**
 * Migrate existing reviews (JSON or CSV) into reviews.Review via API POST /api/reviews/bulk.
 * Duplicates are skipped by DB (ReviewDedupeKey). Set API_BASE_URL or pass --api <url>.
 *
 * Usage:
 *   node scripts/migrate-reviews-to-db.js <path-to-reviews.json>
 *   node scripts/migrate-reviews-to-db.js reviews.json --api https://stoagroupdb-ddre.onrender.com
 *
 * JSON format: array of objects with keys like Property, review_text/Review_Text, rating,
 * reviewer_name, review_date, review_date_original, scraped_at, source, extraction_method,
 * property_url, request.ip (-> request_ip), request.timestamp (-> request_timestamp),
 * category, sentiment, common_phrase, review_year, review_month, review_month_name, review_day_of_week.
 */

const fs = require('fs');
const path = require('path');

const API_BASE = process.env.API_BASE_URL || process.env.STOA_DB_API_URL || 'https://stoagroupdb-ddre.onrender.com';

function mapRow(r) {
  return {
    Property: r.Property || r.property || '',
    Review_Text: r.Review_Text ?? r.review_text ?? null,
    rating: r.rating != null ? r.rating : null,
    reviewer_name: r.reviewer_name ?? r.reviewername ?? null,
    review_date: r.review_date ?? r.reviewdate ?? null,
    review_date_original: r.review_date_original ?? r.reviewdateoriginal ?? null,
    review_year: r.review_year ?? r.reviewyear ?? null,
    review_month: r.review_month ?? r.reviewmonth ?? null,
    review_month_name: r.review_month_name ?? r.reviewmonthname ?? null,
    review_day_of_week: r.review_day_of_week ?? r.reviewdayofweek ?? null,
    scraped_at: r.scraped_at ?? r.scrapedat ?? null,
    source: r.source ?? null,
    extraction_method: r.extraction_method ?? r.extractionmethod ?? null,
    property_url: r.property_url ?? r.propertyurl ?? null,
    request_ip: r.request_ip ?? r['request.ip'] ?? null,
    request_timestamp: r.request_timestamp ?? r['request.timestamp'] ?? null,
    category: r.category ?? null,
    sentiment: r.sentiment ?? null,
    common_phrase: r.common_phrase ?? r.commonphrase ?? null,
    Location: r.Location ?? null,
    Total_Units: r.Total_Units ?? r.TotalUnits ?? null,
    Birth_Order: r.Birth_Order ?? r.BirthOrder ?? null,
    Rank: r.Rank ?? null,
  };
}

async function postBulk(apiBase, batch) {
  const url = `${apiBase.replace(/\/$/, '')}/api/reviews/bulk`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reviews: batch }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`HTTP ${res.status}: ${t}`);
  }
  return res.json();
}

async function main() {
  const args = process.argv.slice(2);
  let filePath = args.find(a => !a.startsWith('--'));
  const apiArg = args.find(a => a.startsWith('--api='));
  const apiBase = apiArg ? apiArg.split('=')[1] : API_BASE;

  if (!filePath || !fs.existsSync(filePath)) {
    console.error('Usage: node scripts/migrate-reviews-to-db.js <reviews.json> [--api=URL]');
    process.exit(1);
  }

  const ext = path.extname(filePath).toLowerCase();
  let rows = [];
  const raw = fs.readFileSync(filePath, 'utf8');

  if (ext === '.json') {
    const data = JSON.parse(raw);
    rows = Array.isArray(data) ? data : (data.data || data.reviews || []);
  } else if (ext === '.csv') {
    const lines = raw.split(/\r?\n/).filter(Boolean);
    const header = lines[0].split(',').map(h => h.replace(/^\s*"|"\s*$/g, '').trim());
    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].split(',').map(v => v.replace(/^\s*"|"\s*$/g, '').trim());
      const obj = {};
      header.forEach((h, j) => { obj[h] = vals[j]; });
      rows.push(obj);
    }
  } else {
    console.error('Unsupported format. Use .json (array of objects) or .csv.');
    process.exit(1);
  }

  if (rows.length === 0) {
    console.log('No rows to migrate.');
    return;
  }

  const payloads = rows.map(mapRow);
  const batchSize = 100;
  let totalInserted = 0, totalSkipped = 0;

  console.log(`Migrating ${payloads.length} reviews to ${apiBase} in batches of ${batchSize}...`);
  for (let i = 0; i < payloads.length; i += batchSize) {
    const batch = payloads.slice(i, i + batchSize);
    const result = await postBulk(apiBase, batch);
    const d = result.data || result;
    totalInserted += d.inserted || 0;
    totalSkipped += d.skipped || 0;
    console.log(`  Batch ${Math.floor(i / batchSize) + 1}: inserted ${d.inserted}, skipped ${d.skipped}`);
  }
  console.log(`Done. Total inserted: ${totalInserted}, skipped (duplicates): ${totalSkipped}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
