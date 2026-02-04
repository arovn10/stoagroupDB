/**
 * Fix duplicate "Ryan Nash" person records: keep one, reassign references, delete the rest.
 * Keeps the person with the lowest PersonId (original). Reassigns banking.Guarantee and
 * core.EquityPartner.InvestorRepId to that person, then deletes the duplicate(s).
 *
 * Usage (dry-run): npm run db:fix-duplicate-ryan-nash
 * Usage (apply):   npm run db:fix-duplicate-ryan-nash -- --apply
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
  const result = await pool.request().query(`
    SELECT PersonId, FullName, Title, Email, Notes
    FROM core.Person
    WHERE FullName = N'Ryan Nash'
    ORDER BY PersonId
  `);
  const rows = result.recordset;

  if (rows.length <= 1) {
    console.log(`Found ${rows.length} "Ryan Nash" person(s). No duplicate to fix.`);
    return;
  }

  const keepId = rows[0].PersonId;
  const duplicateIds = rows.slice(1).map((r: { PersonId: number }) => r.PersonId);
  const keepRow = rows[0] as { PersonId: number; Email?: string | null; Phone?: string | null };

  console.log(`Found ${rows.length} "Ryan Nash" persons. Will keep PersonId=${keepId}, remove PersonIds=[${duplicateIds.join(', ')}].`);

  // Copy Email/Phone from a duplicate onto kept person if kept person is missing them
  const dupWithInfo = (rows.slice(1) as Array<{ PersonId: number; Email?: string | null; Phone?: string | null }>).find(
    (r) => (r.Email && r.Email.trim() !== '') || (r.Phone && r.Phone.trim() !== '')
  );
  if (dupWithInfo) {
    const needEmail = (!keepRow.Email || keepRow.Email.trim() === '') && dupWithInfo.Email && dupWithInfo.Email.trim() !== '';
    const needPhone = (!keepRow.Phone || keepRow.Phone.trim() === '') && dupWithInfo.Phone && dupWithInfo.Phone.trim() !== '';
    if (needEmail || needPhone) {
      if (APPLY) {
        const updates: string[] = [];
        const req = pool.request().input('keepId', sql.Int, keepId);
        if (needEmail) {
          updates.push('Email = @Email');
          req.input('Email', sql.NVarChar, dupWithInfo.Email);
        }
        if (needPhone) {
          updates.push('Phone = @Phone');
          req.input('Phone', sql.NVarChar, dupWithInfo.Phone);
        }
        await req.query(`UPDATE core.Person SET ${updates.join(', ')} WHERE PersonId = @keepId`);
        console.log(`  Copied ${needEmail ? 'Email' : ''} ${needEmail && needPhone ? 'and' : ''} ${needPhone ? 'Phone' : ''} from PersonId ${dupWithInfo.PersonId} to kept person.`);
      } else {
        console.log(`  Would copy Email/Phone from PersonId ${dupWithInfo.PersonId} to kept person.`);
      }
    }
  }

  for (const dupId of duplicateIds) {
    const guarantees = await pool.request()
      .input('personId', sql.Int, dupId)
      .query('SELECT GuaranteeId, ProjectId, LoanId FROM banking.Guarantee WHERE PersonId = @personId');
    const equityPartners = await pool.request()
      .input('personId', sql.Int, dupId)
      .query('SELECT EquityPartnerId, PartnerName FROM core.EquityPartner WHERE InvestorRepId = @personId');

    if (guarantees.recordset.length > 0) {
      console.log(`  PersonId ${dupId}: ${guarantees.recordset.length} guarantee(s) will be reassigned to PersonId ${keepId}.`);
      if (APPLY) {
        await pool.request()
          .input('fromId', sql.Int, dupId)
          .input('toId', sql.Int, keepId)
          .query('UPDATE banking.Guarantee SET PersonId = @toId WHERE PersonId = @fromId');
      }
    }
    if (equityPartners.recordset.length > 0) {
      console.log(`  PersonId ${dupId}: ${equityPartners.recordset.length} EquityPartner InvestorRep will be reassigned to PersonId ${keepId}.`);
      if (APPLY) {
        await pool.request()
          .input('fromId', sql.Int, dupId)
          .input('toId', sql.Int, keepId)
          .query('UPDATE core.EquityPartner SET InvestorRepId = @toId WHERE InvestorRepId = @fromId');
      }
    }
    if (APPLY) {
      await pool.request()
        .input('id', sql.Int, dupId)
        .query('DELETE FROM core.Person WHERE PersonId = @id');
      console.log(`  Deleted PersonId ${dupId}.`);
    }
  }

  if (!APPLY) {
    console.log('\nDry-run only. Run with --apply to reassign references and delete duplicate(s).');
  } else {
    console.log(`Done. One "Ryan Nash" person remains (PersonId=${keepId}).`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
