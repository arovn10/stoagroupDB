#!/usr/bin/env ts-node
/**
 * Fix Review Dates
 *
 * Updates review_date for rows where review_date_original contains "X years ago",
 * "X months ago", etc. Computes correct date from scraped_at (day 15 of target month).
 *
 * Usage:
 *   npm run db:fix-review-dates
 *   npm run db:fix-review-dates -- --dry-run
 */

import { getPool } from './db-manipulate';

const DRY_RUN = process.argv.includes('--dry-run');

function parseRelativeDate(txt: string, ref: Date): { year: number; month: number; day: number } | null {
  if (!txt || typeof txt !== 'string') return null;
  const s = txt.toLowerCase().trim();
  let m: RegExpMatchArray | null;
  m = s.match(/(?:a|one|\d+)\s*years?\s*ago/);
  if (m) {
    const num = m[0].match(/\d+/);
    const years = num ? parseInt(num[0], 10) : 1;
    const d = new Date(ref);
    d.setFullYear(d.getFullYear() - years);
    return { year: d.getFullYear(), month: d.getMonth() + 1, day: 15 };
  }
  m = s.match(/(?:a|one|\d+)\s*months?\s*ago/);
  if (m) {
    const num = m[0].match(/\d+/);
    const months = num ? parseInt(num[0], 10) : 1;
    const d = new Date(ref);
    d.setMonth(d.getMonth() - months);
    return { year: d.getFullYear(), month: d.getMonth() + 1, day: 15 };
  }
  m = s.match(/(?:a|one|\d+)\s*weeks?\s*ago/);
  if (m) {
    const num = m[0].match(/\d+/);
    const weeks = num ? parseInt(num[0], 10) : 1;
    const d = new Date(ref);
    d.setDate(d.getDate() - weeks * 7);
    return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
  }
  if (s.includes('yesterday') || /1\s*day\s*ago/.test(s)) {
    const d = new Date(ref);
    d.setDate(d.getDate() - 1);
    return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
  }
  m = s.match(/(\d+)\s*days?\s*ago/);
  if (m) {
    const d = new Date(ref);
    d.setDate(d.getDate() - parseInt(m[1], 10));
    return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
  }
  m = s.match(/(\d+)\s*hours?\s*ago/);
  if (m) {
    const d = new Date(ref.getTime() - parseInt(m[1], 10) * 60 * 60 * 1000);
    return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
  }
  return null;
}

async function fixReviewDates() {
  const pool = await getPool();

  try {
    console.log('🔍 Finding reviews with relative dates (X years ago, etc.)...');
    if (DRY_RUN) console.log('   (dry-run: no updates)\n');

    const rows = await pool.request().query(`
      SELECT ReviewId, review_date_original, scraped_at, review_date, CreatedAt
      FROM reviews.Review
      WHERE review_date_original IS NOT NULL
        AND LEN(LTRIM(RTRIM(review_date_original))) > 0
        AND (
          review_date_original LIKE N'%years%ago%'
          OR review_date_original LIKE N'%year%ago%'
          OR review_date_original LIKE N'%months%ago%'
          OR review_date_original LIKE N'%month%ago%'
          OR review_date_original LIKE N'%weeks%ago%'
          OR review_date_original LIKE N'%week%ago%'
          OR review_date_original LIKE N'%days%ago%'
          OR review_date_original LIKE N'%day%ago%'
          OR review_date_original LIKE N'%hours%ago%'
          OR review_date_original LIKE N'%hour%ago%'
          OR review_date_original LIKE N'%yesterday%'
        )
    `);

    const records = rows.recordset || [];
    let updated = 0;

    for (const r of records) {
      const orig = (r.review_date_original || '').toString().trim();
      const refDate = r.scraped_at ? new Date(r.scraped_at) : (r.CreatedAt ? new Date(r.CreatedAt) : new Date());
      if (Number.isNaN(refDate.getTime())) continue;

      const parsed = parseRelativeDate(orig, refDate);
      if (!parsed) continue;

      const newDateStr = `${parsed.year}-${String(parsed.month).padStart(2, '0')}-${String(parsed.day).padStart(2, '0')}`;
      const oldDate = r.review_date ? new Date(r.review_date).toISOString().slice(0, 10) : null;
      if (oldDate === newDateStr) continue;

      if (!DRY_RUN) {
        await pool.request()
          .input('ReviewId', r.ReviewId)
          .input('ReviewDate', newDateStr)
          .input('ReviewYear', parsed.year)
          .input('ReviewMonth', parsed.month)
          .query(`
            UPDATE reviews.Review
            SET review_date = @ReviewDate, review_year = @ReviewYear, review_month = @ReviewMonth
            WHERE ReviewId = @ReviewId
          `);
      }
      updated++;
      if (updated <= 5) {
        console.log(`   ${r.ReviewId}: "${orig}" → ${newDateStr} (was ${oldDate || 'null'})`);
      }
    }

    console.log(`\n✅ ${DRY_RUN ? 'Would update' : 'Updated'} ${updated} review(s).`);
  } finally {
    await pool.close();
  }
}

fixReviewDates().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
