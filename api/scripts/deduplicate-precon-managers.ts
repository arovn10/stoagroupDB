#!/usr/bin/env ts-node
/**
 * Deduplicate PreConManagers
 * 
 * Finds duplicate PreConManagers (by normalized name) and merges them:
 * 1. Keeps the PreConManagerId with the most usage in DealPipeline (or lowest ID if none used)
 * 2. Updates all DealPipeline references to point to the kept PreConManagerId
 * 3. Merges email/phone from duplicates into the kept record
 * 4. Deletes duplicate PreConManager records
 */

import { getPool } from './db-manipulate';
import sql from 'mssql';

interface DuplicateGroup {
  normalizedName: string;
  preConManagerIds: number[];
  names: string[];
}

async function deduplicatePreConManagers() {
  const pool = await getPool();
  
  try {
    console.log('🔍 Finding duplicate PreConManagers...');
    console.log('');
    
    // Find duplicates by normalized name
    const duplicatesResult = await pool.request().query(`
      SELECT 
        LOWER(LTRIM(RTRIM(FullName))) AS NormalizedName,
        STRING_AGG(CAST(PreConManagerId AS NVARCHAR), ',') WITHIN GROUP (ORDER BY PreConManagerId) AS PreConManagerIds,
        STRING_AGG(FullName, '|') WITHIN GROUP (ORDER BY PreConManagerId) AS Names
      FROM core.PreConManager
      GROUP BY LOWER(LTRIM(RTRIM(FullName)))
      HAVING COUNT(*) > 1
    `);
    
    if (duplicatesResult.recordset.length === 0) {
      console.log('✅ No duplicates found!');
      return;
    }
    
    console.log(`Found ${duplicatesResult.recordset.length} duplicate group(s)`);
    console.log('');
    
    let totalMerged = 0;
    let totalUpdated = 0;
    let totalDeleted = 0;
    
    for (const dup of duplicatesResult.recordset) {
      const normalizedName = dup.NormalizedName;
      const preConManagerIds = dup.PreConManagerIds.split(',').map(id => parseInt(id.trim()));
      const names = dup.Names.split('|');
      
      console.log(`📋 Processing: "${names[0]}" (${preConManagerIds.length} duplicates)`);
      console.log(`   IDs: ${preConManagerIds.join(', ')}`);
      
      // Check usage in DealPipeline for each ID
      const usageMap = new Map<number, number>();
      for (const id of preConManagerIds) {
        const usageResult = await pool.request()
          .input('PreConManagerId', sql.Int, id)
          .query('SELECT COUNT(*) AS Count FROM pipeline.DealPipeline WHERE PreConManagerId = @PreConManagerId');
        
        const usageCount = usageResult.recordset[0].Count;
        usageMap.set(id, usageCount);
        console.log(`   - PreConManagerId ${id}: Used in ${usageCount} DealPipeline record(s)`);
      }
      
      // Determine which ID to keep:
      // 1. The one with most usage
      // 2. If tied, keep the lowest ID
      let keepId = preConManagerIds[0];
      let maxUsage = usageMap.get(keepId) || 0;
      
      for (const id of preConManagerIds) {
        const usage = usageMap.get(id) || 0;
        if (usage > maxUsage || (usage === maxUsage && id < keepId)) {
          keepId = id;
          maxUsage = usage;
        }
      }
      
      const duplicateIds = preConManagerIds.filter(id => id !== keepId);
      
      console.log(`   ✅ Keeping PreConManagerId ${keepId} (${maxUsage} usage)`);
      console.log(`   🗑️  Will merge/delete: ${duplicateIds.join(', ')}`);
      
      // Get the kept record to merge email/phone into
      const keptRecord = await pool.request()
        .input('PreConManagerId', sql.Int, keepId)
        .query('SELECT FullName, Email, Phone FROM core.PreConManager WHERE PreConManagerId = @PreConManagerId');
      
      let mergedEmail = keptRecord.recordset[0].Email;
      let mergedPhone = keptRecord.recordset[0].Phone;
      
      // Merge email/phone from duplicates (keep first non-null value)
      for (const dupId of duplicateIds) {
        const dupRecord = await pool.request()
          .input('PreConManagerId', sql.Int, dupId)
          .query('SELECT Email, Phone FROM core.PreConManager WHERE PreConManagerId = @PreConManagerId');
        
        if (!mergedEmail && dupRecord.recordset[0].Email) {
          mergedEmail = dupRecord.recordset[0].Email;
        }
        if (!mergedPhone && dupRecord.recordset[0].Phone) {
          mergedPhone = dupRecord.recordset[0].Phone;
        }
      }
      
      // Update kept record with merged email/phone if changed
      if (mergedEmail !== keptRecord.recordset[0].Email || mergedPhone !== keptRecord.recordset[0].Phone) {
        await pool.request()
          .input('PreConManagerId', sql.Int, keepId)
          .input('Email', sql.NVarChar, mergedEmail)
          .input('Phone', sql.NVarChar, mergedPhone)
          .query(`
            UPDATE core.PreConManager
            SET Email = @Email,
                Phone = @Phone,
                UpdatedAt = SYSDATETIME()
            WHERE PreConManagerId = @PreConManagerId
          `);
        console.log(`   📝 Updated kept record with merged email/phone`);
      }
      
      // Update DealPipeline references from duplicates to kept ID
      for (const dupId of duplicateIds) {
        const updateResult = await pool.request()
          .input('OldPreConManagerId', sql.Int, dupId)
          .input('NewPreConManagerId', sql.Int, keepId)
          .query(`
            UPDATE pipeline.DealPipeline
            SET PreConManagerId = @NewPreConManagerId,
                UpdatedAt = SYSDATETIME()
            WHERE PreConManagerId = @OldPreConManagerId
          `);
        
        const updated = updateResult.rowsAffected[0];
        if (updated > 0) {
          totalUpdated += updated;
          console.log(`   ✅ Updated ${updated} DealPipeline record(s) from PreConManagerId ${dupId} to ${keepId}`);
        }
      }
      
      // Delete duplicate PreConManager records
      for (const dupId of duplicateIds) {
        const deleteResult = await pool.request()
          .input('PreConManagerId', sql.Int, dupId)
          .query('DELETE FROM core.PreConManager WHERE PreConManagerId = @PreConManagerId');
        
        if (deleteResult.rowsAffected[0] > 0) {
          totalDeleted++;
          console.log(`   🗑️  Deleted PreConManagerId ${dupId}`);
        }
      }
      
      totalMerged++;
      console.log('');
    }
    
    console.log('============================================================');
    console.log('DEDUPLICATION SUMMARY');
    console.log('============================================================');
    console.log(`   - Duplicate groups processed: ${totalMerged}`);
    console.log(`   - DealPipeline records updated: ${totalUpdated}`);
    console.log(`   - Duplicate PreConManagers deleted: ${totalDeleted}`);
    console.log('');
    
    // Show final PreConManager list
    const finalResult = await pool.request().query(`
      SELECT 
        PreConManagerId,
        FullName,
        Email,
        Phone,
        (SELECT COUNT(*) FROM pipeline.DealPipeline WHERE PreConManagerId = pm.PreConManagerId) AS UsageCount
      FROM core.PreConManager pm
      ORDER BY FullName
    `);
    
    console.log('📊 Final PreConManager List:');
    console.log(JSON.stringify(finalResult.recordset, null, 2));
    console.log('');
    console.log('✅ Deduplication complete!');
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await pool.close();
  }
}

if (require.main === module) {
  deduplicatePreConManagers().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { deduplicatePreConManagers };
