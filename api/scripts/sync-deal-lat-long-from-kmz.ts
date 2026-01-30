#!/usr/bin/env ts-node
/**
 * For every deal that has a KMZ attachment: unzip the KMZ, extract longitude and latitude,
 * and update pipeline.DealPipeline with Latitude and Longitude.
 *
 * Prereq: Run schema/add_deal_pipeline_latitude_longitude.sql if columns don't exist.
 * Usage: npm run db:sync-deal-lat-long-from-kmz
 */

import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';
import sql from 'mssql';
import { getConnection, closeConnection } from '../src/config/database';
import { isBlobStorageConfigured, downloadBlobToBuffer } from '../src/config/azureBlob';
import { getFullPath } from '../src/middleware/uploadMiddleware';
import { extractCoordinatesFromKmzBuffer } from './extract-kmz-coordinates';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });

async function main() {
  if (!process.env.DB_SERVER || !process.env.DB_DATABASE || !process.env.DB_USER || !process.env.DB_PASSWORD) {
    console.error('Set DB_SERVER, DB_DATABASE, DB_USER, DB_PASSWORD (e.g. in repo root .env)');
    process.exit(1);
  }

  const pool = await getConnection();

  // List all KMZ attachments
  const result = await pool.request().query(`
    SELECT a.DealPipelineAttachmentId, a.DealPipelineId, a.StoragePath, a.FileName
    FROM pipeline.DealPipelineAttachment a
    WHERE LOWER(a.FileName) LIKE '%.kmz'
    ORDER BY a.DealPipelineId, a.DealPipelineAttachmentId
  `);

  const rows = result.recordset as { DealPipelineAttachmentId: number; DealPipelineId: number; StoragePath: string; FileName: string }[];
  if (rows.length === 0) {
    console.log('No KMZ attachments found.');
    await closeConnection();
    process.exit(0);
  }

  console.log(`Found ${rows.length} KMZ attachment(s).`);
  const useBlob = isBlobStorageConfigured();
  if (useBlob) console.log('Using Azure Blob for file access.\n');

  let updated = 0;
  let errors = 0;

  for (const row of rows) {
    let buffer: Buffer | null = null;
    try {
      if (useBlob) {
        buffer = await downloadBlobToBuffer(row.StoragePath);
      } else {
        const fullPath = getFullPath(row.StoragePath);
        if (fs.existsSync(fullPath)) buffer = fs.readFileSync(fullPath);
      }
      if (!buffer || buffer.length === 0) {
        console.log(`  Skip ${row.FileName}: file not found or empty`);
        errors++;
        continue;
      }
      const coords = extractCoordinatesFromKmzBuffer(buffer);
      if (!coords) {
        console.log(`  Skip ${row.FileName}: no coordinates in KMZ`);
        errors++;
        continue;
      }
      await pool.request()
        .input('dealId', sql.Int, row.DealPipelineId)
        .input('lat', sql.Decimal(18, 8), coords.latitude)
        .input('lon', sql.Decimal(18, 8), coords.longitude)
        .query(`
          UPDATE pipeline.DealPipeline
          SET Latitude = @lat, Longitude = @lon, UpdatedAt = SYSDATETIME()
          WHERE DealPipelineId = @dealId
        `);
      updated++;
      console.log(`  Updated DealPipelineId=${row.DealPipelineId} (${row.FileName}): lat=${coords.latitude}, lon=${coords.longitude}`);
    } catch (e) {
      errors++;
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`  Error ${row.FileName}: ${msg}`);
    }
  }

  await closeConnection();
  console.log('\n---');
  console.log(`Updated ${updated} deal(s) with Latitude/Longitude from KMZ.`);
  if (errors > 0) console.log(`Errors/skips: ${errors}`);
  process.exit(errors > 0 && updated === 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
