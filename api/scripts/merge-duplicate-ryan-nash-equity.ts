/**
 * Merge duplicate "Ryan Nash" equity partners into one.
 * Combines the partner WITH email in the name (e.g. "Ryan Nash (rnash@stoagroup.com)")
 * into the partner WITHOUT email in the name ("Ryan Nash").
 * Reassigns EquityCommitment (lead) and EquityCommitmentRelatedParty to the kept partner,
 * dedupes related-party rows, then deletes the duplicate EquityPartner.
 *
 * Usage (dry-run): npm run db:merge-duplicate-ryan-nash-equity
 * Usage (apply):  npm run db:merge-duplicate-ryan-nash-equity -- --apply
 *
 * Run from api/ folder. Requires .env with DB_SERVER, DB_DATABASE, DB_USER, DB_PASSWORD.
 */

import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });

import sql from 'mssql';
import { getConnection } from '../src/config/database';

const APPLY = process.argv.includes('--apply');

async function main(): Promise<void> {
  const pool = await getConnection();

  const partners = await pool.request().query(`
    SELECT EquityPartnerId, PartnerName, PartnerType, InvestorRepId, Notes
    FROM core.EquityPartner
    WHERE PartnerName LIKE N'Ryan Nash%'
    ORDER BY EquityPartnerId
  `);
  const rows = partners.recordset as Array<{ EquityPartnerId: number; PartnerName: string; PartnerType: string | null; InvestorRepId: number | null; Notes: string | null }>;

  if (rows.length < 2) {
    console.log(`Found ${rows.length} "Ryan Nash" equity partner(s). Need 2 to merge. Nothing to do.`);
    return;
  }

  // Keep the one WITHOUT @ in the name; merge the one WITH @ (email) into it.
  const withEmail = rows.find((r) => r.PartnerName.includes('@'));
  const withoutEmail = rows.find((r) => !r.PartnerName.includes('@'));

  if (!withEmail || !withoutEmail) {
    console.log('Could not identify one partner with email and one without. Rows:', rows.map((r) => r.PartnerName));
    return;
  }

  const keepId = withoutEmail.EquityPartnerId;
  const mergeId = withEmail.EquityPartnerId;

  console.log(`Keep: EquityPartnerId=${keepId} "${withoutEmail.PartnerName}"`);
  console.log(`Merge into keep (then delete): EquityPartnerId=${mergeId} "${withEmail.PartnerName}"`);

  const commitmentsAsLead = await pool.request()
    .input('mergeId', sql.Int, mergeId)
    .query('SELECT COUNT(*) AS cnt FROM banking.EquityCommitment WHERE EquityPartnerId = @mergeId');
  const commitmentsAsRelated = await pool.request()
    .input('mergeId', sql.Int, mergeId)
    .query('SELECT COUNT(*) AS cnt FROM banking.EquityCommitmentRelatedParty WHERE RelatedPartyId = @mergeId');

  const nLead = commitmentsAsLead.recordset[0]?.cnt ?? 0;
  const nRelated = commitmentsAsRelated.recordset[0]?.cnt ?? 0;
  console.log(`  Commitments as lead: ${nLead}`);
  console.log(`  Related-party links: ${nRelated}`);

  if (!APPLY) {
    console.log('\nDry-run only. Run with --apply to merge and delete the duplicate.');
    return;
  }

  await pool.request()
    .input('keepId', sql.Int, keepId)
    .input('mergeId', sql.Int, mergeId)
    .query('UPDATE banking.EquityCommitment SET EquityPartnerId = @keepId WHERE EquityPartnerId = @mergeId');
  console.log('  Updated EquityCommitment (lead) to kept partner.');

  await pool.request()
    .input('keepId', sql.Int, keepId)
    .input('mergeId', sql.Int, mergeId)
    .query('UPDATE banking.EquityCommitmentRelatedParty SET RelatedPartyId = @keepId WHERE RelatedPartyId = @mergeId');
  console.log('  Updated EquityCommitmentRelatedParty to kept partner.');

  // Remove duplicate (EquityCommitmentId, RelatedPartyId) rows; keep one per pair.
  await pool.request().query(`
    ;WITH cte AS (
      SELECT EquityCommitmentRelatedPartyId,
        ROW_NUMBER() OVER (PARTITION BY EquityCommitmentId, RelatedPartyId ORDER BY EquityCommitmentRelatedPartyId) AS rn
      FROM banking.EquityCommitmentRelatedParty
    )
    DELETE FROM banking.EquityCommitmentRelatedParty
    WHERE EquityCommitmentRelatedPartyId IN (SELECT EquityCommitmentRelatedPartyId FROM cte WHERE rn > 1)
  `);
  console.log('  Deduped related-party rows.');

  await pool.request()
    .input('mergeId', sql.Int, mergeId)
    .query('DELETE FROM core.EquityPartner WHERE EquityPartnerId = @mergeId');
  console.log(`  Deleted duplicate EquityPartner (EquityPartnerId=${mergeId}).`);

  console.log(`Done. One "Ryan Nash" equity partner remains (EquityPartnerId=${keepId}).`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
