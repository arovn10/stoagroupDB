#!/usr/bin/env ts-node
/**
 * Parse Deal Pipeline Notes and pre-populate structured fields:
 *   Broker/Referral: <name>  -> find or create BrokerReferralContact, set BrokerReferralContactId
 *   Price (raw): <value>      -> PriceRaw
 *   Listed/Unlisted: <value> -> ListingStatus
 *   Zoning: <value>          -> Zoning
 *   County: <value>         -> County
 *
 * Usage:
 *   npm run db:parse-deal-notes          # dry run (log only)
 *   npm run db:parse-deal-notes -- --apply   # update DB
 *   npm run db:parse-deal-notes -- --apply --strip   # update DB and remove parsed lines from Notes
 *
 * Prereq: BrokerReferralContact table and DealPipeline columns (BrokerReferralContactId, PriceRaw, etc.) exist.
 */

import * as path from 'path';
import dotenv from 'dotenv';
import sql from 'mssql';
import { getConnection, closeConnection } from '../src/config/database';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });

const APPLY = process.argv.includes('--apply');
const STRIP = process.argv.includes('--strip');

interface ParsedNotes {
  brokerReferralName: string | null;
  priceRaw: string | null;
  listingStatus: string | null;
  zoning: string | null;
  county: string | null;
  /** Lines that were parsed (for stripping); include label + value for removal */
  parsedLines: string[];
}

/** Parse Notes text for the known label: value lines. Returns trimmed values; empty string becomes null. */
function parseNotes(notes: string | null): ParsedNotes {
  const out: ParsedNotes = {
    brokerReferralName: null,
    priceRaw: null,
    listingStatus: null,
    zoning: null,
    county: null,
    parsedLines: [],
  };
  if (!notes || typeof notes !== 'string') return out;

  const lines = notes.split(/\r?\n/).map((l) => l.trim());
  for (const line of lines) {
    let m: RegExpMatchArray | null = null;
    if ((m = line.match(/^Broker\/Referral:\s*(.+)$/i))) {
      const v = m[1].trim();
      if (v && v !== '-') {
        out.brokerReferralName = v;
        out.parsedLines.push(line);
      }
    } else if ((m = line.match(/^Price\s*\(raw\):\s*(.+)$/i))) {
      const v = m[1].trim();
      out.priceRaw = v; // allow "-" or empty
      out.parsedLines.push(line);
    } else if ((m = line.match(/^Listed\/Unlisted:\s*(.+)$/i))) {
      const v = m[1].trim();
      if (v) {
        out.listingStatus = v;
        out.parsedLines.push(line);
      }
    } else if ((m = line.match(/^Zoning:\s*(.+)$/i))) {
      const v = m[1].trim();
      if (v) {
        out.zoning = v;
        out.parsedLines.push(line);
      }
    } else if ((m = line.match(/^County(?:\/Parish)?:\s*(.+)$/i))) {
      const v = m[1].trim();
      if (v) {
        out.county = v;
        out.parsedLines.push(line);
      }
    }
  }
  return out;
}

/** Remove parsed lines from notes; preserve rest of text. */
function stripParsedLines(notes: string, parsedLines: string[]): string {
  if (!parsedLines.length) return notes;
  const set = new Set(parsedLines.map((l) => l.trim()));
  const lines = notes.split(/\r?\n/);
  const kept = lines.filter((l) => !set.has(l.trim()));
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

async function main() {
  if (!process.env.DB_SERVER || !process.env.DB_DATABASE || !process.env.DB_USER || !process.env.DB_PASSWORD) {
    console.error('Set DB_SERVER, DB_DATABASE, DB_USER, DB_PASSWORD (e.g. in repo root .env)');
    process.exit(1);
  }

  if (!APPLY) {
    console.log('DRY RUN (use --apply to write to DB). Use --strip with --apply to remove parsed lines from Notes.\n');
  }

  const pool = await getConnection();

  const dealsResult = await pool.request().query(`
    SELECT dp.DealPipelineId, dp.ProjectId, dp.Notes,
           dp.BrokerReferralContactId, dp.PriceRaw, dp.ListingStatus, dp.Zoning, dp.County,
           p.ProjectName
    FROM pipeline.DealPipeline dp
    LEFT JOIN core.Project p ON dp.ProjectId = p.ProjectId
    WHERE dp.Notes IS NOT NULL AND LEN(LTRIM(RTRIM(dp.Notes))) > 0
    ORDER BY dp.DealPipelineId
  `);

  const deals = dealsResult.recordset as {
    DealPipelineId: number;
    ProjectId: number;
    Notes: string;
    BrokerReferralContactId: number | null;
    PriceRaw: string | null;
    ListingStatus: string | null;
    Zoning: string | null;
    County: string | null;
    ProjectName: string;
  }[];

  console.log(`Deals with notes: ${deals.length}\n`);

  let updated = 0;
  let skipped = 0;
  let createdContacts = 0;

  for (const deal of deals) {
    const parsed = parseNotes(deal.Notes);
    const hasAny =
      parsed.brokerReferralName != null ||
      parsed.priceRaw != null ||
      parsed.listingStatus != null ||
      parsed.zoning != null ||
      parsed.county != null;

    if (!hasAny) {
      skipped++;
      continue;
    }

    let brokerReferralContactId: number | null = deal.BrokerReferralContactId ?? null;

    if (parsed.brokerReferralName) {
      const existing = await pool
        .request()
        .input('name', sql.NVarChar(255), parsed.brokerReferralName)
        .query(`
          SELECT BrokerReferralContactId FROM pipeline.BrokerReferralContact
          WHERE LTRIM(RTRIM(Name)) = LTRIM(RTRIM(@name))
        `);
      if (existing.recordset.length > 0) {
        brokerReferralContactId = (existing.recordset[0] as { BrokerReferralContactId: number }).BrokerReferralContactId;
      } else if (APPLY) {
        const insertResult = await pool
          .request()
          .input('Name', sql.NVarChar(255), parsed.brokerReferralName)
          .input('Email', sql.NVarChar(255), null)
          .input('Phone', sql.NVarChar(50), null)
          .query(`
            INSERT INTO pipeline.BrokerReferralContact (Name, Email, Phone)
            OUTPUT INSERTED.BrokerReferralContactId
            VALUES (@Name, @Email, @Phone)
          `);
        brokerReferralContactId = (insertResult.recordset[0] as { BrokerReferralContactId: number }).BrokerReferralContactId;
        createdContacts++;
        console.log(`  Created contact: "${parsed.brokerReferralName}" (id ${brokerReferralContactId})`);
      } else {
        brokerReferralContactId = -1; // signal "would create" for dry-run log
      }
    }

    const updates: string[] = [];
    const req = pool.request().input('DealPipelineId', sql.Int, deal.DealPipelineId);

    if (parsed.brokerReferralName != null && brokerReferralContactId != null && brokerReferralContactId > 0) {
      updates.push('BrokerReferralContactId = @BrokerReferralContactId');
      req.input('BrokerReferralContactId', sql.Int, brokerReferralContactId);
    }
    if (parsed.priceRaw != null) {
      updates.push('PriceRaw = @PriceRaw');
      req.input('PriceRaw', sql.NVarChar(100), parsed.priceRaw);
    }
    if (parsed.listingStatus != null) {
      updates.push('ListingStatus = @ListingStatus');
      req.input('ListingStatus', sql.NVarChar(50), parsed.listingStatus);
    }
    if (parsed.zoning != null) {
      updates.push('Zoning = @Zoning');
      req.input('Zoning', sql.NVarChar(100), parsed.zoning);
    }
    if (parsed.county != null) {
      updates.push('County = @County');
      req.input('County', sql.NVarChar(100), parsed.county);
    }

    let newNotes: string | null = null;
    if (STRIP && APPLY && parsed.parsedLines.length > 0) {
      newNotes = stripParsedLines(deal.Notes, parsed.parsedLines);
      updates.push('Notes = @Notes');
      req.input('Notes', sql.NVarChar(sql.MAX), newNotes);
    }

    if (updates.length === 0) continue;

    if (APPLY) {
      updates.push('UpdatedAt = SYSDATETIME()');
      await req.query(`
        UPDATE pipeline.DealPipeline
        SET ${updates.join(', ')}
        WHERE DealPipelineId = @DealPipelineId
      `);
      updated++;
      console.log(
        `  DealPipelineId ${deal.DealPipelineId} (${deal.ProjectName ?? 'no name'}): ` +
          [
            parsed.brokerReferralName != null && `BrokerReferralContactId=${brokerReferralContactId}`,
            parsed.priceRaw != null && `PriceRaw="${parsed.priceRaw}"`,
            parsed.listingStatus != null && `ListingStatus="${parsed.listingStatus}"`,
            parsed.zoning != null && `Zoning="${parsed.zoning}"`,
            parsed.county != null && `County="${parsed.county}"`,
            newNotes != null && 'Notes stripped',
          ]
            .filter(Boolean)
            .join(', ')
      );
    } else {
      updated++;
      console.log(
        `[DRY RUN] DealPipelineId ${deal.DealPipelineId} (${deal.ProjectName ?? 'no name'}): would set ` +
          [
            parsed.brokerReferralName != null &&
              (brokerReferralContactId != null && brokerReferralContactId > 0
                ? `BrokerReferralContactId=${brokerReferralContactId}`
                : `BrokerReferralContactId=create "${parsed.brokerReferralName}"`),
            parsed.priceRaw != null && `PriceRaw="${parsed.priceRaw}"`,
            parsed.listingStatus != null && `ListingStatus="${parsed.listingStatus}"`,
            parsed.zoning != null && `Zoning="${parsed.zoning}"`,
            parsed.county != null && `County="${parsed.county}"`,
            STRIP && parsed.parsedLines.length && 'strip from Notes',
          ]
            .filter(Boolean)
            .join(', ')
      );
    }
  }

  console.log(`\nDeals with parsed data: ${updated} (would update or updated)`);
  console.log(`Deals skipped (no matching lines): ${skipped}`);
  if (APPLY) console.log(`New BrokerReferralContact rows created: ${createdContacts}`);

  await closeConnection();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
