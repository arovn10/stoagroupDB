#!/usr/bin/env ts-node
/**
 * Fix Misattributed Review
 *
 * Moves a review from the wrong property to the correct one. Use when review text
 * clearly references one property (e.g. "The Waters at West Village") but it was
 * incorrectly stored under another (e.g. "The Waters At Promenade").
 *
 * Usage:
 *   npm run db:fix-misattributed-review -- --text "West Village" --wrong "The Waters At Promenade" --correct "The Waters at West Village"
 *   npm run db:fix-misattributed-review -- --text "West Village" --wrong "The Waters At Promenade" --correct "The Waters at West Village" --dry-run
 *
 * Options:
 *   --text "snippet"   Review_Text must contain this (case-insensitive)
 *   --wrong "name"     Current Property value (must match exactly for safety)
 *   --correct "name"   Target Property/ProjectName from core.Project
 *   --dry-run          List matches without updating
 */

import { getPool } from './db-manipulate';

const args = process.argv.slice(2);
const getArg = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : undefined;
};
const DRY_RUN = args.includes('--dry-run');
const textSnippet = getArg('--text');
const wrongProperty = getArg('--wrong');
const correctProperty = getArg('--correct');

async function main() {
  if (!textSnippet || !wrongProperty || !correctProperty) {
    console.error('Usage: npm run db:fix-misattributed-review -- --text "snippet" --wrong "current property" --correct "correct property"');
    console.error('Example: --text "West Village" --wrong "The Waters At Promenade" --correct "The Waters at West Village"');
    process.exit(1);
  }

  const pool = await getPool();

  try {
    // Find correct ProjectId
    const projects = await pool.request()
      .input('name', correctProperty)
      .query(`
        SELECT ProjectId, ProjectName
        FROM core.Project
        WHERE LTRIM(RTRIM(ProjectName)) = LTRIM(RTRIM(@name))
      `);

    if (!projects.recordset?.length) {
      console.error(`❌ No project found with name "${correctProperty}". Check core.Project.`);
      process.exit(1);
    }
    const { ProjectId: correctProjectId, ProjectName } = projects.recordset[0];
    console.log(`✅ Target project: ${ProjectName} (ProjectId ${correctProjectId})`);

    // Find matching reviews
    const reviews = await pool.request()
      .input('snippet', `%${textSnippet}%`)
      .input('wrong', wrongProperty)
      .query(`
        SELECT ReviewId, Property, ProjectId, reviewer_name, LEFT(Review_Text, 120) + '...' AS snippet
        FROM reviews.Review
        WHERE Review_Text LIKE @snippet
          AND LTRIM(RTRIM(Property)) = LTRIM(RTRIM(@wrong))
      `);

    if (!reviews.recordset?.length) {
      console.log('⚠️ No reviews found matching the criteria.');
      return;
    }

    console.log(`\n📋 Found ${reviews.recordset.length} review(s) to fix:`);
    reviews.recordset.forEach((r: { ReviewId: number; Property: string; reviewer_name: string; snippet: string }) => {
      console.log(`   ReviewId ${r.ReviewId} | ${r.Property} | ${r.reviewer_name} | "${r.snippet}"`);
    });

    if (DRY_RUN) {
      console.log('\n(dry-run: no updates)');
      return;
    }

    const ids = reviews.recordset.map((r: { ReviewId: number }) => r.ReviewId);
    const idsList = ids.join(',');
    const result = await pool.request()
      .input('correctProperty', correctProperty)
      .input('correctProjectId', correctProjectId)
      .query(`
        UPDATE reviews.Review
        SET Property = @correctProperty, ProjectId = @correctProjectId
        WHERE ReviewId IN (SELECT CAST(value AS INT) FROM STRING_SPLIT(N'${idsList}', ','))
      `);

    const affected = (result as { rowsAffected?: number | number[] }).rowsAffected;
    const count = Array.isArray(affected) ? affected[0] : affected;
    console.log(`\n✅ Updated ${count ?? ids.length} review(s) to ${correctProperty}`);
  } finally {
    await pool.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
