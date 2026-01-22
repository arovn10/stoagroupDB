#!/usr/bin/env ts-node
/**
 * Check and Add: The Flats at Niceville
 * Checks if project exists, and adds it if missing
 */

import { getPool } from './db-manipulate';
import sql from 'mssql';

async function checkAndAddFlatsAtNiceville() {
  const pool = await getPool();
  
  try {
    console.log('Checking for "The Flats at Niceville"...');
    
    // Check if project exists
    const projectCheck = await pool.request()
      .query(`
        SELECT ProjectId, ProjectName, City, State, Region, Units, ProductType, Stage
        FROM core.Project
        WHERE ProjectName = 'The Flats at Niceville'
      `);
    
    let projectId: number;
    
    if (projectCheck.recordset.length > 0) {
      projectId = projectCheck.recordset[0].ProjectId;
      console.log(`✅ Project EXISTS (ProjectId: ${projectId})`);
      console.log('Current data:', projectCheck.recordset[0]);
      
      // Update project
      await pool.request()
        .input('ProjectId', sql.Int, projectId)
        .input('City', sql.NVarChar, 'Niceville')
        .input('State', sql.NVarChar, 'FL')
        .input('Region', sql.NVarChar, 'Gulf Coast')
        .input('Units', sql.Int, 208)
        .input('ProductType', sql.NVarChar, 'Flats')
        .input('Stage', sql.NVarChar, 'Under Contract')
        .input('EstimatedConstructionStartDate', sql.Date, '2026-01-14')
        .query(`
          UPDATE core.Project
          SET 
            City = @City,
            State = @State,
            Region = @Region,
            Units = @Units,
            ProductType = COALESCE(ProductType, @ProductType),
            Stage = COALESCE(Stage, @Stage),
            EstimatedConstructionStartDate = COALESCE(EstimatedConstructionStartDate, @EstimatedConstructionStartDate),
            UpdatedAt = SYSDATETIME()
          WHERE ProjectId = @ProjectId
        `);
      
      console.log('✅ Updated project');
    } else {
      console.log('❌ Project NOT FOUND - creating it...');
      
      await pool.request()
        .input('ProjectName', sql.NVarChar, 'The Flats at Niceville')
        .input('City', sql.NVarChar, 'Niceville')
        .input('State', sql.NVarChar, 'FL')
        .input('Region', sql.NVarChar, 'Gulf Coast')
        .input('Units', sql.Int, 208)
        .input('ProductType', sql.NVarChar, 'Flats')
        .input('Stage', sql.NVarChar, 'Under Contract')
        .input('EstimatedConstructionStartDate', sql.Date, '2026-01-14')
        .query(`
          INSERT INTO core.Project (
            ProjectName, City, State, Region, Units, ProductType, Stage, EstimatedConstructionStartDate
          )
          VALUES (
            @ProjectName, @City, @State, @Region, @Units, @ProductType, @Stage, @EstimatedConstructionStartDate
          );
          SELECT SCOPE_IDENTITY() AS ProjectId;
        `);
      
      // Get the ProjectId
      const getIdResult = await pool.request()
        .input('ProjectName', sql.NVarChar, 'The Flats at Niceville')
        .query('SELECT ProjectId FROM core.Project WHERE ProjectName = @ProjectName');
      
      projectId = getIdResult.recordset[0].ProjectId;
      console.log(`✅ Created project (ProjectId: ${projectId})`);
    }
    
    // Check if DealPipeline exists
    const dealPipelineCheck = await pool.request()
      .input('ProjectId', sql.Int, projectId)
      .query(`
        SELECT DealPipelineId
        FROM pipeline.DealPipeline
        WHERE ProjectId = @ProjectId
      `);
    
    if (dealPipelineCheck.recordset.length > 0) {
      const dealPipelineId = dealPipelineCheck.recordset[0].DealPipelineId;
      console.log(`✅ DealPipeline EXISTS (DealPipelineId: ${dealPipelineId})`);
      
      // Update DealPipeline
      await pool.request()
        .input('DealPipelineId', sql.Int, dealPipelineId)
        .input('Acreage', sql.Decimal(18, 4), 8.3)
        .input('LandPrice', sql.Decimal(18, 2), 4570500.00)
        .input('SqFtPrice', sql.Decimal(18, 2), 12.64)
        .input('ExecutionDate', sql.Date, '2026-01-14')
        .input('DueDiligenceDate', sql.Date, '2026-08-12')
        .input('ClosingDate', sql.Date, '2026-09-11')
        .query(`
          UPDATE pipeline.DealPipeline
          SET 
            Acreage = @Acreage,
            LandPrice = @LandPrice,
            SqFtPrice = @SqFtPrice,
            ExecutionDate = @ExecutionDate,
            DueDiligenceDate = @DueDiligenceDate,
            ClosingDate = @ClosingDate,
            PurchasingEntity = NULL,
            Cash = 0,
            OpportunityZone = 0,
            ClosingNotes = NULL,
            UpdatedAt = SYSDATETIME()
          WHERE DealPipelineId = @DealPipelineId
        `);
      
      console.log('✅ Updated DealPipeline');
    } else {
      console.log('❌ DealPipeline NOT FOUND - creating it...');
      
      await pool.request()
        .input('ProjectId', sql.Int, projectId)
        .input('Acreage', sql.Decimal(18, 4), 8.3)
        .input('LandPrice', sql.Decimal(18, 2), 4570500.00)
        .input('SqFtPrice', sql.Decimal(18, 2), 12.64)
        .input('ExecutionDate', sql.Date, '2026-01-14')
        .input('DueDiligenceDate', sql.Date, '2026-08-12')
        .input('ClosingDate', sql.Date, '2026-09-11')
        .query(`
          INSERT INTO pipeline.DealPipeline (
            ProjectId, Acreage, LandPrice, SqFtPrice, ExecutionDate, 
            DueDiligenceDate, ClosingDate, PurchasingEntity, Cash, OpportunityZone, ClosingNotes
          )
          VALUES (
            @ProjectId, @Acreage, @LandPrice, @SqFtPrice, @ExecutionDate,
            @DueDiligenceDate, @ClosingDate, NULL, 0, 0, NULL
          )
        `);
      
      console.log('✅ Created DealPipeline');
    }
    
    // Show final result
    const finalResult = await pool.request()
      .input('ProjectName', sql.NVarChar, 'The Flats at Niceville')
      .query(`
        SELECT 
          p.ProjectId,
          p.ProjectName,
          p.City,
          p.State,
          p.Region,
          p.Units,
          p.ProductType,
          p.Stage,
          dp.DealPipelineId,
          dp.Acreage,
          dp.LandPrice,
          dp.SqFtPrice,
          dp.ExecutionDate,
          dp.DueDiligenceDate,
          dp.ClosingDate
        FROM core.Project p
        LEFT JOIN pipeline.DealPipeline dp ON dp.ProjectId = p.ProjectId
        WHERE p.ProjectName = @ProjectName
      `);
    
    console.log('\n📊 Final Result:');
    console.log(JSON.stringify(finalResult.recordset[0], null, 2));
    console.log('\n✅ Complete!');
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await pool.close();
  }
}

if (require.main === module) {
  checkAndAddFlatsAtNiceville().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { checkAndAddFlatsAtNiceville };
