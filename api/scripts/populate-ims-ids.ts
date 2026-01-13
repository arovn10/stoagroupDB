#!/usr/bin/env ts-node
/**
 * Populate IMS Investor Profile IDs
 * 
 * Reads the IMS mapping file and updates EquityPartner records with IMS IDs
 * where the PartnerName is currently an IMS ID (all digits).
 * 
 * Usage: npm run db:populate-ims-ids
 */

import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import { getPool } from './db-manipulate';
import sql from 'mssql';

function readExcelFile(filePath: string): any[][] {
  try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null });
    return data as any[][];
  } catch (error: any) {
    console.error(`  ❌ Error reading Excel file ${filePath}: ${error.message}`);
    return [];
  }
}

function findColumnIndex(headers: string[], ...names: string[]): number {
  for (const name of names) {
    const index = headers.findIndex(h => h && String(h).toLowerCase().includes(name.toLowerCase()));
    if (index >= 0) return index;
  }
  return -1;
}

async function main() {
  console.log('🚀 Starting IMS ID Population...\n');
  
  const pool = await getPool();
  const imsDataDir = path.join(__dirname, '../../stoa_seed_csvs/IMSData');
  
  // Find mapping file
  const mappingFiles = fs.readdirSync(imsDataDir).filter(f => 
    f.toLowerCase().includes('mapping') && f.endsWith('.xlsx')
  );
  
  if (mappingFiles.length === 0) {
    console.log('⚠️  No IMS mapping file found');
    console.log('   Looking for files with "mapping" in name in:', imsDataDir);
    await pool.close();
    return;
  }
  
  const mappingFile = path.join(imsDataDir, mappingFiles[0]);
  console.log(`📄 Reading mapping file: ${mappingFiles[0]}\n`);
  
  const rows = readExcelFile(mappingFile);
  if (rows.length < 2) {
    console.log('⚠️  No data rows found in mapping file');
    await pool.close();
    return;
  }
  
  const headers = rows[0].map((h: any) => String(h || '').trim());
  console.log(`   Found ${headers.length} columns`);
  console.log(`   Headers: ${headers.slice(0, 10).join(', ')}...\n`);
  
  // Find ID and name columns
  const idCol = findColumnIndex(headers, 'investor profile id', 'profile id', 'id', 'investor id', 'ims id');
  const nameCol = findColumnIndex(headers, 'investor name', 'name', 'legal name', 'investor legal name', 'partner name');
  
  console.log(`   Column mapping: ID=${idCol}${idCol >= 0 ? ` (${headers[idCol]})` : ''}, Name=${nameCol}${nameCol >= 0 ? ` (${headers[nameCol]})` : ''}\n`);
  
  if (idCol === -1 || nameCol === -1) {
    console.log('⚠️  Could not find ID or Name columns');
    console.log(`   Available columns: ${headers.join(', ')}`);
    await pool.close();
    return;
  }
  
  let updated = 0;
  let created = 0;
  let skipped = 0;
  
  // Create mapping of IMS ID to Name
  const idToNameMap: { [key: string]: string } = {};
  
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length <= Math.max(idCol, nameCol)) continue;
    
    const imsId = row[idCol] ? String(row[idCol]).trim() : null;
    const investorName = row[nameCol] ? String(row[nameCol]).trim() : null;
    
    if (imsId && investorName && imsId.length >= 6 && investorName.length >= 2) {
      idToNameMap[imsId] = investorName;
    }
  }
  
  console.log(`📊 Found ${Object.keys(idToNameMap).length} IMS ID to Name mappings\n`);
  
  // Update equity partners where PartnerName is an IMS ID
  console.log('🔄 Updating Equity Partners...\n');
  
  const partnersToUpdate = await pool.request().query(`
    SELECT EquityPartnerId, PartnerName
    FROM core.EquityPartner
    WHERE ISNUMERIC(PartnerName) = 1
      AND LEN(PartnerName) >= 6
  `);
  
  console.log(`   Found ${partnersToUpdate.recordset.length} partners with numeric names (likely IMS IDs)\n`);
  
  for (const partner of partnersToUpdate.recordset) {
    const imsId = partner.PartnerName;
    const investorName = idToNameMap[imsId];
    
    if (investorName) {
      // Update with actual name and set IMS ID
      try {
        await pool.request()
          .input('EquityPartnerId', sql.Int, partner.EquityPartnerId)
          .input('PartnerName', sql.NVarChar, investorName)
          .input('IMSInvestorProfileId', sql.NVarChar(50), imsId)
          .query(`
            UPDATE core.EquityPartner
            SET PartnerName = @PartnerName,
                IMSInvestorProfileId = @IMSInvestorProfileId
            WHERE EquityPartnerId = @EquityPartnerId
          `);
        updated++;
        console.log(`   ✅ Updated: ${imsId} → ${investorName}`);
      } catch (error: any) {
        if (error.number === 2627) {
          // Unique constraint - partner name already exists
          // Try to merge or update IMS ID only
          try {
            await pool.request()
              .input('EquityPartnerId', sql.Int, partner.EquityPartnerId)
              .input('IMSInvestorProfileId', sql.NVarChar(50), imsId)
              .query(`
                UPDATE core.EquityPartner
                SET IMSInvestorProfileId = @IMSInvestorProfileId
                WHERE EquityPartnerId = @EquityPartnerId
              `);
            console.log(`   ⚠️  Updated IMS ID only (name conflict): ${imsId} → ${investorName}`);
            updated++;
          } catch (e: any) {
            console.log(`   ❌ Error updating ${imsId}: ${e.message}`);
            skipped++;
          }
        } else {
          console.log(`   ❌ Error updating ${imsId}: ${error.message}`);
          skipped++;
        }
      }
    } else {
      // Set IMS ID even if we don't have the name
      try {
        await pool.request()
          .input('EquityPartnerId', sql.Int, partner.EquityPartnerId)
          .input('IMSInvestorProfileId', sql.NVarChar(50), imsId)
          .query(`
            UPDATE core.EquityPartner
            SET IMSInvestorProfileId = @IMSInvestorProfileId
            WHERE EquityPartnerId = @EquityPartnerId
              AND (IMSInvestorProfileId IS NULL OR IMSInvestorProfileId = '')
          `);
        console.log(`   📝 Set IMS ID for: ${imsId} (name not found in mapping)`);
        created++;
      } catch (error: any) {
        console.log(`   ❌ Error setting IMS ID for ${imsId}: ${error.message}`);
        skipped++;
      }
    }
  }
  
  console.log(`\n✅ Completed!`);
  console.log(`   Updated: ${updated} partners`);
  console.log(`   Set IMS IDs: ${created} partners`);
  console.log(`   Skipped: ${skipped} partners`);
  
  await pool.close();
}

if (require.main === module) {
  main().catch(console.error);
}
