#!/usr/bin/env ts-node
/**
 * Verify Deal Pipeline and BrokerReferralContact data after parse-deal-notes --apply.
 * Checks counts, referential integrity, and spot-checks Hobby Lobby / Research Park (no "-" contact).
 *
 * Usage: npm run db:verify-parse-deal-notes
 */

import * as path from 'path';
import dotenv from 'dotenv';
import { getConnection, closeConnection } from '../src/config/database';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });

async function main() {
  if (!process.env.DB_SERVER || !process.env.DB_DATABASE || !process.env.DB_USER || !process.env.DB_PASSWORD) {
    console.error('Set DB_SERVER, DB_DATABASE, DB_USER, DB_PASSWORD (e.g. in repo root .env)');
    process.exit(1);
  }

  const pool = await getConnection();

  console.log('=== BrokerReferralContact ===');
  const contactsResult = await pool.request().query(`
    SELECT COUNT(*) AS Total FROM pipeline.BrokerReferralContact
  `);
  const totalContacts = (contactsResult.recordset[0] as { Total: number }).Total;
  console.log(`Total contacts: ${totalContacts}`);

  const dashResult = await pool.request().query(`
    SELECT BrokerReferralContactId, Name FROM pipeline.BrokerReferralContact WHERE LTRIM(RTRIM(Name)) = '-'
  `);
  if (dashResult.recordset.length > 0) {
    console.log('WARNING: Found contact(s) with Name "-":', dashResult.recordset);
  } else {
    console.log('OK: No contact with Name "-"');
  }

  console.log('\n=== DealPipeline field counts ===');
  const countsResult = await pool.request().query(`
    SELECT
      COUNT(*) AS TotalDeals,
      SUM(CASE WHEN BrokerReferralContactId IS NOT NULL THEN 1 ELSE 0 END) AS WithBroker,
      SUM(CASE WHEN PriceRaw IS NOT NULL AND LEN(LTRIM(RTRIM(PriceRaw))) > 0 THEN 1 ELSE 0 END) AS WithPriceRaw,
      SUM(CASE WHEN ListingStatus IS NOT NULL AND LEN(LTRIM(RTRIM(ListingStatus))) > 0 THEN 1 ELSE 0 END) AS WithListingStatus,
      SUM(CASE WHEN Zoning IS NOT NULL AND LEN(LTRIM(RTRIM(Zoning))) > 0 THEN 1 ELSE 0 END) AS WithZoning,
      SUM(CASE WHEN County IS NOT NULL AND LEN(LTRIM(RTRIM(County))) > 0 THEN 1 ELSE 0 END) AS WithCounty
    FROM pipeline.DealPipeline
  `);
  const c = countsResult.recordset[0] as {
    TotalDeals: number;
    WithBroker: number;
    WithPriceRaw: number;
    WithListingStatus: number;
    WithZoning: number;
    WithCounty: number;
  };
  console.log(`Total deals: ${c.TotalDeals}`);
  console.log(`With BrokerReferralContactId: ${c.WithBroker}`);
  console.log(`With PriceRaw: ${c.WithPriceRaw}`);
  console.log(`With ListingStatus: ${c.WithListingStatus}`);
  console.log(`With Zoning: ${c.WithZoning}`);
  console.log(`With County: ${c.WithCounty}`);

  console.log('\n=== Referential integrity (orphaned BrokerReferralContactId) ===');
  const orphanResult = await pool.request().query(`
    SELECT dp.DealPipelineId, p.ProjectName, dp.BrokerReferralContactId
    FROM pipeline.DealPipeline dp
    LEFT JOIN core.Project p ON dp.ProjectId = p.ProjectId
    WHERE dp.BrokerReferralContactId IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM pipeline.BrokerReferralContact br WHERE br.BrokerReferralContactId = dp.BrokerReferralContactId)
  `);
  if (orphanResult.recordset.length > 0) {
    console.log('ERROR: Deals referencing non-existent contact:', orphanResult.recordset);
  } else {
    console.log('OK: Every DealPipeline.BrokerReferralContactId references an existing contact.');
  }

  console.log('\n=== Spot-check: Hobby Lobby (152) and Research Park (161) ===');
  const spotResult = await pool.request().query(`
    SELECT dp.DealPipelineId, p.ProjectName, dp.BrokerReferralContactId, dp.ListingStatus, dp.Zoning, dp.County,
           br.Name AS BrokerName
    FROM pipeline.DealPipeline dp
    LEFT JOIN core.Project p ON dp.ProjectId = p.ProjectId
    LEFT JOIN pipeline.BrokerReferralContact br ON dp.BrokerReferralContactId = br.BrokerReferralContactId
    WHERE dp.DealPipelineId IN (152, 161)
  `);
  for (const row of spotResult.recordset as any[]) {
    console.log(
      `  DealPipelineId ${row.DealPipelineId} (${row.ProjectName}): ` +
        `BrokerReferralContactId=${row.BrokerReferralContactId ?? 'NULL'}, ` +
        `BrokerName=${row.BrokerName ?? 'N/A'}, ` +
        `ListingStatus=${row.ListingStatus ?? 'NULL'}, County=${row.County ?? 'NULL'}`
    );
  }
  const hobbyLobby = (spotResult.recordset as any[]).find((r) => r.DealPipelineId === 152);
  const researchPark = (spotResult.recordset as any[]).find((r) => r.DealPipelineId === 161);
  if (hobbyLobby?.BrokerReferralContactId == null && researchPark?.BrokerReferralContactId == null) {
    console.log('OK: Neither has a broker contact (Notes had "Broker/Referral: -").');
  }

  console.log('\n=== Sample: 5 deals with broker + 2 without ===');
  const sampleWith = await pool.request().query(`
    SELECT TOP 5 dp.DealPipelineId, p.ProjectName, br.Name AS BrokerName, dp.PriceRaw, dp.ListingStatus, dp.County
    FROM pipeline.DealPipeline dp
    LEFT JOIN core.Project p ON dp.ProjectId = p.ProjectId
    LEFT JOIN pipeline.BrokerReferralContact br ON dp.BrokerReferralContactId = br.BrokerReferralContactId
    WHERE dp.BrokerReferralContactId IS NOT NULL
    ORDER BY dp.DealPipelineId
  `);
  const sampleWithout = await pool.request().query(`
    SELECT TOP 2 dp.DealPipelineId, p.ProjectName, dp.BrokerReferralContactId, dp.PriceRaw, dp.ListingStatus, dp.County
    FROM pipeline.DealPipeline dp
    LEFT JOIN core.Project p ON dp.ProjectId = p.ProjectId
    WHERE dp.BrokerReferralContactId IS NULL AND (dp.ListingStatus IS NOT NULL OR dp.County IS NOT NULL)
    ORDER BY dp.DealPipelineId
  `);
  console.log('With broker:');
  for (const row of (sampleWith.recordset as any[])) {
    console.log(`  ${row.DealPipelineId} ${row.ProjectName} | Broker: ${row.BrokerName} | PriceRaw: ${row.PriceRaw ?? 'NULL'} | County: ${row.County ?? 'NULL'}`);
  }
  console.log('Without broker (but with other parsed fields):');
  for (const row of (sampleWithout.recordset as any[])) {
    console.log(`  ${row.DealPipelineId} ${row.ProjectName} | ListingStatus: ${row.ListingStatus ?? 'NULL'} | County: ${row.County ?? 'NULL'}`);
  }

  console.log('\n=== Contacts with most deals ===');
  const topContacts = await pool.request().query(`
    SELECT br.BrokerReferralContactId, br.Name, COUNT(dp.DealPipelineId) AS DealCount
    FROM pipeline.BrokerReferralContact br
    LEFT JOIN pipeline.DealPipeline dp ON dp.BrokerReferralContactId = br.BrokerReferralContactId
    GROUP BY br.BrokerReferralContactId, br.Name
    ORDER BY DealCount DESC
    OFFSET 0 ROWS FETCH NEXT 8 ROWS ONLY
  `);
  for (const row of (topContacts.recordset as any[])) {
    console.log(`  ${row.Name} (id ${row.BrokerReferralContactId}): ${row.DealCount} deal(s)`);
  }

  await closeConnection();
  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
