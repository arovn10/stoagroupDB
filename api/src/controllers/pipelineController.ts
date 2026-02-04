import { Request, Response, NextFunction } from 'express';
import sql from 'mssql';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getConnection } from '../config/database';
import { getFullPath, getRelativeStoragePath, buildStoragePath } from '../middleware/uploadMiddleware';
import {
  isBlobStorageConfigured,
  uploadBufferToBlob,
  downloadBlobToBuffer,
  blobExists,
  deleteBlob as deleteBlobFile,
} from '../config/azureBlob';
import { normalizeState, normalizeStateInPayload } from '../utils/stateAbbrev';

// ============================================================
// UNDER CONTRACT CONTROLLER
// ============================================================

export const getAllUnderContracts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const pool = await getConnection();
    // Pull CORE data and Land Development specific data
    const result = await pool.request().query(`
      SELECT 
        uc.UnderContractId,
        uc.ProjectId,
        -- CORE attributes (from core.Project)
        p.ProjectName,
        p.City,
        p.State,
        p.Units,
        -- Region from core.Region table
        r.RegionName AS Region,
        -- Land Development specific attributes
        uc.Acreage,
        uc.LandPrice,
        uc.SqFtPrice,
        uc.ExecutionDate,
        uc.DueDiligenceDate,
        uc.ClosingDate,
        uc.PurchasingEntity,
        uc.Cash,
        uc.OpportunityZone,
        uc.ClosingNotes
      FROM pipeline.UnderContract uc
      LEFT JOIN core.Project p ON uc.ProjectId = p.ProjectId
      LEFT JOIN core.Region r ON p.Region = r.RegionName
      ORDER BY uc.UnderContractId
    `);
    res.json({ success: true, data: normalizeStateInPayload(result.recordset) });
  } catch (error) {
    next(error);
  }
};

export const getUnderContractById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    // Pull CORE data and Land Development specific data
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT 
          uc.UnderContractId,
          uc.ProjectId,
          -- CORE attributes (from core.Project)
          p.ProjectName,
          p.City,
          p.State,
          p.Units,
          -- Region from core.Region table
          r.RegionName AS Region,
          -- Land Development specific attributes
          uc.Acreage,
          uc.LandPrice,
          uc.SqFtPrice,
          uc.ExecutionDate,
          uc.DueDiligenceDate,
          uc.ClosingDate,
          uc.PurchasingEntity,
          uc.Cash,
          uc.OpportunityZone,
          uc.ClosingNotes
        FROM pipeline.UnderContract uc
        LEFT JOIN core.Project p ON uc.ProjectId = p.ProjectId
        LEFT JOIN core.Region r ON p.Region = r.RegionName
        WHERE uc.UnderContractId = @id
      `);
    
    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Under Contract record not found' } });
      return;
    }
    
    res.json({ success: true, data: normalizeStateInPayload(result.recordset[0]) });
  } catch (error) {
    next(error);
  }
};

export const getUnderContractByProjectId = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { projectId } = req.params;
    const pool = await getConnection();
    // Pull CORE data and Land Development specific data
    const result = await pool.request()
      .input('projectId', sql.Int, projectId)
      .query(`
        SELECT 
          uc.UnderContractId,
          uc.ProjectId,
          -- CORE attributes (from core.Project)
          p.ProjectName,
          p.City,
          p.State,
          p.Units,
          -- Region from core.Region table
          r.RegionName AS Region,
          -- Land Development specific attributes
          uc.Acreage,
          uc.LandPrice,
          uc.SqFtPrice,
          uc.ExecutionDate,
          uc.DueDiligenceDate,
          uc.ClosingDate,
          uc.PurchasingEntity,
          uc.Cash,
          uc.OpportunityZone,
          uc.ClosingNotes
        FROM pipeline.UnderContract uc
        LEFT JOIN core.Project p ON uc.ProjectId = p.ProjectId
        LEFT JOIN core.Region r ON p.Region = r.RegionName
        WHERE uc.ProjectId = @projectId
      `);
    
    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Under Contract record for this project not found' } });
      return;
    }
    
    res.json({ success: true, data: normalizeStateInPayload(result.recordset[0]) });
  } catch (error) {
    next(error);
  }
};

export const createUnderContract = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      ProjectId,
      // CORE attributes (can be updated in CORE if provided)
      Units,
      // Land Development specific attributes
      Acreage,
      LandPrice,
      ExecutionDate,
      DueDiligenceDate,
      ClosingDate,
      PurchasingEntity,
      Cash,
      OpportunityZone,
      ClosingNotes
    } = req.body;

    if (!ProjectId) {
      res.status(400).json({ success: false, error: { message: 'ProjectId is required' } });
      return;
    }

    const pool = await getConnection();
    
    // Calculate SqFtPrice: LandPrice / (Acreage * 43560)
    // 43560 = square feet per acre
    let sqFtPrice: number | null = null;
    if (LandPrice && Acreage && Acreage > 0) {
      sqFtPrice = LandPrice / (Acreage * 43560);
    }

    // Update Units in CORE if provided
    if (Units !== undefined) {
      await pool.request()
        .input('ProjectId', sql.Int, ProjectId)
        .input('Units', sql.Int, Units)
        .query('UPDATE core.Project SET Units = @Units, UpdatedAt = SYSDATETIME() WHERE ProjectId = @ProjectId');
    }

    // Insert Land Development specific data
    const result = await pool.request()
      .input('ProjectId', sql.Int, ProjectId)
      .input('Acreage', sql.Decimal(18, 4), Acreage)
      .input('LandPrice', sql.Decimal(18, 2), LandPrice)
      .input('SqFtPrice', sql.Decimal(18, 2), sqFtPrice)
      .input('ExecutionDate', sql.Date, ExecutionDate)
      .input('DueDiligenceDate', sql.Date, DueDiligenceDate)
      .input('ClosingDate', sql.Date, ClosingDate)
      .input('PurchasingEntity', sql.NVarChar, PurchasingEntity)
      .input('Cash', sql.Bit, Cash)
      .input('OpportunityZone', sql.Bit, OpportunityZone)
      .input('ClosingNotes', sql.NVarChar(sql.MAX), ClosingNotes)
      .query(`
        INSERT INTO pipeline.UnderContract (
          ProjectId, Acreage, LandPrice, SqFtPrice,
          ExecutionDate, DueDiligenceDate, ClosingDate, PurchasingEntity,
          Cash, OpportunityZone, ClosingNotes
        )
        OUTPUT INSERTED.*
        VALUES (
          @ProjectId, @Acreage, @LandPrice, @SqFtPrice,
          @ExecutionDate, @DueDiligenceDate, @ClosingDate, @PurchasingEntity,
          @Cash, @OpportunityZone, @ClosingNotes
        )
      `);

    // Get the full record with CORE data
    const fullRecord = await pool.request()
      .input('id', sql.Int, result.recordset[0].UnderContractId)
      .query(`
        SELECT 
          uc.UnderContractId,
          uc.ProjectId,
          p.ProjectName,
          p.City,
          p.State,
          p.Units,
          r.RegionName AS Region,
          uc.Acreage,
          uc.LandPrice,
          uc.SqFtPrice,
          uc.ExecutionDate,
          uc.DueDiligenceDate,
          uc.ClosingDate,
          uc.PurchasingEntity,
          uc.Cash,
          uc.OpportunityZone,
          uc.ClosingNotes
        FROM pipeline.UnderContract uc
        LEFT JOIN core.Project p ON uc.ProjectId = p.ProjectId
        LEFT JOIN core.Region r ON p.Region = r.RegionName
        WHERE uc.UnderContractId = @id
      `);

    res.status(201).json({ success: true, data: fullRecord.recordset[0] });
  } catch (error: any) {
    if (error.number === 2627) {
      res.status(409).json({ success: false, error: { message: 'Under Contract record for this project already exists' } });
      return;
    }
    if (error.number === 547) {
      res.status(400).json({ success: false, error: { message: 'Invalid ProjectId' } });
      return;
    }
    next(error);
  }
};

export const updateUnderContract = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const {
      // CORE attributes (can be updated in CORE if provided)
      Units,
      // Land Development specific attributes
      Acreage,
      LandPrice,
      ExecutionDate,
      DueDiligenceDate,
      ClosingDate,
      PurchasingEntity,
      Cash,
      OpportunityZone,
      ClosingNotes
    } = req.body;

    const pool = await getConnection();
    
    // Update Units in CORE if provided
    if (Units !== undefined) {
      const ucResult = await pool.request()
        .input('id', sql.Int, id)
        .query('SELECT ProjectId FROM pipeline.UnderContract WHERE UnderContractId = @id');
      
      if (ucResult.recordset.length === 0) {
        res.status(404).json({ success: false, error: { message: 'Under Contract record not found' } });
        return;
      }

      await pool.request()
        .input('ProjectId', sql.Int, ucResult.recordset[0].ProjectId)
        .input('Units', sql.Int, Units)
        .query('UPDATE core.Project SET Units = @Units, UpdatedAt = SYSDATETIME() WHERE ProjectId = @ProjectId');
    }

    // Build dynamic update query for Land Development fields
    const fields: string[] = [];
    const request = pool.request().input('id', sql.Int, id);

    if (Acreage !== undefined) {
      fields.push('Acreage = @Acreage');
      request.input('Acreage', sql.Decimal(18, 4), Acreage);
    }
    if (LandPrice !== undefined) {
      fields.push('LandPrice = @LandPrice');
      request.input('LandPrice', sql.Decimal(18, 2), LandPrice);
    }
    if (ExecutionDate !== undefined) {
      fields.push('ExecutionDate = @ExecutionDate');
      request.input('ExecutionDate', sql.Date, ExecutionDate);
    }
    if (DueDiligenceDate !== undefined) {
      fields.push('DueDiligenceDate = @DueDiligenceDate');
      request.input('DueDiligenceDate', sql.Date, DueDiligenceDate);
    }
    if (ClosingDate !== undefined) {
      fields.push('ClosingDate = @ClosingDate');
      request.input('ClosingDate', sql.Date, ClosingDate);
    }
    if (PurchasingEntity !== undefined) {
      fields.push('PurchasingEntity = @PurchasingEntity');
      request.input('PurchasingEntity', sql.NVarChar, PurchasingEntity);
    }
    if (Cash !== undefined) {
      fields.push('Cash = @Cash');
      request.input('Cash', sql.Bit, Cash);
    }
    if (OpportunityZone !== undefined) {
      fields.push('OpportunityZone = @OpportunityZone');
      request.input('OpportunityZone', sql.Bit, OpportunityZone);
    }
    if (ClosingNotes !== undefined) {
      fields.push('ClosingNotes = @ClosingNotes');
      request.input('ClosingNotes', sql.NVarChar(sql.MAX), ClosingNotes);
    }

    // Recalculate SqFtPrice if LandPrice or Acreage changed
    if (LandPrice !== undefined || Acreage !== undefined) {
      const currentData = await pool.request()
        .input('id', sql.Int, id)
        .query('SELECT LandPrice, Acreage FROM pipeline.UnderContract WHERE UnderContractId = @id');
      
      if (currentData.recordset.length === 0) {
        res.status(404).json({ success: false, error: { message: 'Under Contract record not found' } });
        return;
      }

      const finalLandPrice = LandPrice !== undefined ? LandPrice : currentData.recordset[0].LandPrice;
      const finalAcreage = Acreage !== undefined ? Acreage : currentData.recordset[0].Acreage;

      let sqFtPrice: number | null = null;
      if (finalLandPrice && finalAcreage && finalAcreage > 0) {
        sqFtPrice = finalLandPrice / (finalAcreage * 43560);
      }
      
      fields.push('SqFtPrice = @SqFtPrice');
      request.input('SqFtPrice', sql.Decimal(18, 2), sqFtPrice);
    }

    if (fields.length === 0) {
      res.status(400).json({ success: false, error: { message: 'No fields to update' } });
      return;
    }

    await request.query(`
      UPDATE pipeline.UnderContract
      SET ${fields.join(', ')}
      WHERE UnderContractId = @id
    `);

    // Get the updated record with CORE data
    const updated = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT 
          uc.UnderContractId,
          uc.ProjectId,
          p.ProjectName,
          p.City,
          p.State,
          p.Units,
          r.RegionName AS Region,
          uc.Acreage,
          uc.LandPrice,
          uc.SqFtPrice,
          uc.ExecutionDate,
          uc.DueDiligenceDate,
          uc.ClosingDate,
          uc.PurchasingEntity,
          uc.Cash,
          uc.OpportunityZone,
          uc.ClosingNotes
        FROM pipeline.UnderContract uc
        LEFT JOIN core.Project p ON uc.ProjectId = p.ProjectId
        LEFT JOIN core.Region r ON p.Region = r.RegionName
        WHERE uc.UnderContractId = @id
      `);

    if (updated.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Under Contract record not found' } });
      return;
    }

    res.json({ success: true, data: normalizeStateInPayload(updated.recordset[0]) });
  } catch (error: any) {
    if (error.number === 547) {
      res.status(400).json({ success: false, error: { message: 'Invalid ProjectId' } });
      return;
    }
    next(error);
  }
};

export const deleteUnderContract = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM pipeline.UnderContract WHERE UnderContractId = @id');

    if (result.rowsAffected[0] === 0) {
      res.status(404).json({ success: false, error: { message: 'Under Contract record not found' } });
      return;
    }

    res.json({ success: true, message: 'Under Contract record deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// COMMERCIAL LISTED CONTROLLER
// ============================================================

export const getAllCommercialListed = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const pool = await getConnection();
    // Pull CORE data and Land Development specific data
    const result = await pool.request().query(`
      SELECT 
        cl.CommercialListedId,
        cl.ProjectId,
        -- CORE attributes (from core.Project)
        p.ProjectName,
        p.City,
        p.State,
        -- Land Development specific attributes
        cl.ListedDate,
        cl.Acreage,
        cl.LandPrice,
        cl.ListingStatus,
        cl.DueDiligenceDate,
        cl.ClosingDate,
        cl.Owner,
        cl.PurchasingEntity,
        cl.Broker,
        cl.Notes
      FROM pipeline.CommercialListed cl
      LEFT JOIN core.Project p ON cl.ProjectId = p.ProjectId
      ORDER BY cl.CommercialListedId
    `);
    res.json({ success: true, data: normalizeStateInPayload(result.recordset) });
  } catch (error) {
    next(error);
  }
};

export const getCommercialListedById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    // Pull CORE data and Land Development specific data
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT 
          cl.CommercialListedId,
          cl.ProjectId,
          -- CORE attributes (from core.Project)
          p.ProjectName,
          p.City,
          p.State,
          -- Land Development specific attributes
          cl.ListedDate,
          cl.Acreage,
          cl.LandPrice,
          cl.ListingStatus,
          cl.DueDiligenceDate,
          cl.ClosingDate,
          cl.Owner,
          cl.PurchasingEntity,
          cl.Broker,
          cl.Notes
        FROM pipeline.CommercialListed cl
        LEFT JOIN core.Project p ON cl.ProjectId = p.ProjectId
        WHERE cl.CommercialListedId = @id
      `);
    
    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Commercial Listed record not found' } });
      return;
    }
    
    res.json({ success: true, data: normalizeStateInPayload(result.recordset[0]) });
  } catch (error) {
    next(error);
  }
};

export const getCommercialListedByProjectId = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { projectId } = req.params;
    const pool = await getConnection();
    // Pull CORE data and Land Development specific data
    const result = await pool.request()
      .input('projectId', sql.Int, projectId)
      .query(`
        SELECT 
          cl.CommercialListedId,
          cl.ProjectId,
          -- CORE attributes (from core.Project)
          p.ProjectName,
          p.City,
          p.State,
          -- Land Development specific attributes
          cl.ListedDate,
          cl.Acreage,
          cl.LandPrice,
          cl.ListingStatus,
          cl.DueDiligenceDate,
          cl.ClosingDate,
          cl.Owner,
          cl.PurchasingEntity,
          cl.Broker,
          cl.Notes
        FROM pipeline.CommercialListed cl
        LEFT JOIN core.Project p ON cl.ProjectId = p.ProjectId
        WHERE cl.ProjectId = @projectId
      `);
    
    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Commercial Listed record for this project not found' } });
      return;
    }
    
    res.json({ success: true, data: normalizeStateInPayload(result.recordset[0]) });
  } catch (error) {
    next(error);
  }
};

export const createCommercialListed = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      ProjectId,
      // Land Development specific attributes
      ListedDate,
      Acreage,
      LandPrice,
      ListingStatus,
      DueDiligenceDate,
      ClosingDate,
      Owner,
      PurchasingEntity,
      Broker,
      Notes
    } = req.body;

    if (!ProjectId) {
      res.status(400).json({ success: false, error: { message: 'ProjectId is required' } });
      return;
    }

    const pool = await getConnection();
    
    // Insert Land Development specific data
    const result = await pool.request()
      .input('ProjectId', sql.Int, ProjectId)
      .input('ListedDate', sql.Date, ListedDate)
      .input('Acreage', sql.Decimal(18, 4), Acreage)
      .input('LandPrice', sql.Decimal(18, 2), LandPrice)
      .input('ListingStatus', sql.NVarChar(50), ListingStatus)
      .input('DueDiligenceDate', sql.Date, DueDiligenceDate)
      .input('ClosingDate', sql.Date, ClosingDate)
      .input('Owner', sql.NVarChar, Owner)
      .input('PurchasingEntity', sql.NVarChar, PurchasingEntity)
      .input('Broker', sql.NVarChar, Broker)
      .input('Notes', sql.NVarChar(sql.MAX), Notes)
      .query(`
        INSERT INTO pipeline.CommercialListed (
          ProjectId, ListedDate, Acreage, LandPrice, ListingStatus,
          DueDiligenceDate, ClosingDate, Owner, PurchasingEntity, Broker, Notes
        )
        OUTPUT INSERTED.*
        VALUES (
          @ProjectId, @ListedDate, @Acreage, @LandPrice, @ListingStatus,
          @DueDiligenceDate, @ClosingDate, @Owner, @PurchasingEntity, @Broker, @Notes
        )
      `);

    // Get the full record with CORE data
    const fullRecord = await pool.request()
      .input('id', sql.Int, result.recordset[0].CommercialListedId)
      .query(`
        SELECT 
          cl.CommercialListedId,
          cl.ProjectId,
          p.ProjectName,
          p.City,
          p.State,
          cl.ListedDate,
          cl.Acreage,
          cl.LandPrice,
          cl.ListingStatus,
          cl.DueDiligenceDate,
          cl.ClosingDate,
          cl.Owner,
          cl.PurchasingEntity,
          cl.Broker,
          cl.Notes
        FROM pipeline.CommercialListed cl
        LEFT JOIN core.Project p ON cl.ProjectId = p.ProjectId
        WHERE cl.CommercialListedId = @id
      `);

    res.status(201).json({ success: true, data: fullRecord.recordset[0] });
  } catch (error: any) {
    if (error.number === 2627) {
      res.status(409).json({ success: false, error: { message: 'Commercial Listed record for this project already exists' } });
      return;
    }
    if (error.number === 547) {
      res.status(400).json({ success: false, error: { message: 'Invalid ProjectId' } });
      return;
    }
    next(error);
  }
};

export const updateCommercialListed = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const {
      // Land Development specific attributes
      ListedDate,
      Acreage,
      LandPrice,
      ListingStatus,
      DueDiligenceDate,
      ClosingDate,
      Owner,
      PurchasingEntity,
      Broker,
      Notes
    } = req.body;

    const pool = await getConnection();
    
    // Build dynamic update query for Land Development fields
    const fields: string[] = [];
    const request = pool.request().input('id', sql.Int, id);

    if (ListedDate !== undefined) {
      fields.push('ListedDate = @ListedDate');
      request.input('ListedDate', sql.Date, ListedDate);
    }
    if (Acreage !== undefined) {
      fields.push('Acreage = @Acreage');
      request.input('Acreage', sql.Decimal(18, 4), Acreage);
    }
    if (LandPrice !== undefined) {
      fields.push('LandPrice = @LandPrice');
      request.input('LandPrice', sql.Decimal(18, 2), LandPrice);
    }
    if (ListingStatus !== undefined) {
      fields.push('ListingStatus = @ListingStatus');
      request.input('ListingStatus', sql.NVarChar(50), ListingStatus);
    }
    if (DueDiligenceDate !== undefined) {
      fields.push('DueDiligenceDate = @DueDiligenceDate');
      request.input('DueDiligenceDate', sql.Date, DueDiligenceDate);
    }
    if (ClosingDate !== undefined) {
      fields.push('ClosingDate = @ClosingDate');
      request.input('ClosingDate', sql.Date, ClosingDate);
    }
    if (Owner !== undefined) {
      fields.push('Owner = @Owner');
      request.input('Owner', sql.NVarChar, Owner);
    }
    if (PurchasingEntity !== undefined) {
      fields.push('PurchasingEntity = @PurchasingEntity');
      request.input('PurchasingEntity', sql.NVarChar, PurchasingEntity);
    }
    if (Broker !== undefined) {
      fields.push('Broker = @Broker');
      request.input('Broker', sql.NVarChar, Broker);
    }
    if (Notes !== undefined) {
      fields.push('Notes = @Notes');
      request.input('Notes', sql.NVarChar(sql.MAX), Notes);
    }

    if (fields.length === 0) {
      res.status(400).json({ success: false, error: { message: 'No fields to update' } });
      return;
    }

    await request.query(`
      UPDATE pipeline.CommercialListed
      SET ${fields.join(', ')}
      WHERE CommercialListedId = @id
    `);

    // Get the updated record with CORE data
    const updated = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT 
          cl.CommercialListedId,
          cl.ProjectId,
          p.ProjectName,
          p.City,
          p.State,
          cl.ListedDate,
          cl.Acreage,
          cl.LandPrice,
          cl.ListingStatus,
          cl.DueDiligenceDate,
          cl.ClosingDate,
          cl.Owner,
          cl.PurchasingEntity,
          cl.Broker,
          cl.Notes
        FROM pipeline.CommercialListed cl
        LEFT JOIN core.Project p ON cl.ProjectId = p.ProjectId
        WHERE cl.CommercialListedId = @id
      `);

    if (updated.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Commercial Listed record not found' } });
      return;
    }

    res.json({ success: true, data: normalizeStateInPayload(updated.recordset[0]) });
  } catch (error: any) {
    if (error.number === 547) {
      res.status(400).json({ success: false, error: { message: 'Invalid ProjectId' } });
      return;
    }
    next(error);
  }
};

export const deleteCommercialListed = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM pipeline.CommercialListed WHERE CommercialListedId = @id');

    if (result.rowsAffected[0] === 0) {
      res.status(404).json({ success: false, error: { message: 'Commercial Listed record not found' } });
      return;
    }

    res.json({ success: true, message: 'Commercial Listed record deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// COMMERCIAL ACREAGE CONTROLLER
// ============================================================

export const getAllCommercialAcreage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const pool = await getConnection();
    // Pull CORE data and Land Development specific data
    const result = await pool.request().query(`
      SELECT 
        ca.CommercialAcreageId,
        ca.ProjectId,
        -- CORE attributes (from core.Project)
        p.ProjectName,
        p.City,
        p.State,
        -- Land Development specific attributes
        ca.Acreage,
        ca.SquareFootage,
        ca.BuildingFootprintSF
      FROM pipeline.CommercialAcreage ca
      LEFT JOIN core.Project p ON ca.ProjectId = p.ProjectId
      ORDER BY ca.CommercialAcreageId
    `);
    res.json({ success: true, data: normalizeStateInPayload(result.recordset) });
  } catch (error) {
    next(error);
  }
};

export const getCommercialAcreageById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    // Pull CORE data and Land Development specific data
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT 
          ca.CommercialAcreageId,
          ca.ProjectId,
          -- CORE attributes (from core.Project)
          p.ProjectName,
          p.City,
          p.State,
          -- Land Development specific attributes
          ca.Acreage,
          ca.SquareFootage,
          ca.BuildingFootprintSF
        FROM pipeline.CommercialAcreage ca
        LEFT JOIN core.Project p ON ca.ProjectId = p.ProjectId
        WHERE ca.CommercialAcreageId = @id
      `);
    
    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Commercial Acreage record not found' } });
      return;
    }
    
    res.json({ success: true, data: normalizeStateInPayload(result.recordset[0]) });
  } catch (error) {
    next(error);
  }
};

export const getCommercialAcreageByProjectId = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { projectId } = req.params;
    const pool = await getConnection();
    // Pull CORE data and Land Development specific data
    const result = await pool.request()
      .input('projectId', sql.Int, projectId)
      .query(`
        SELECT 
          ca.CommercialAcreageId,
          ca.ProjectId,
          -- CORE attributes (from core.Project)
          p.ProjectName,
          p.City,
          p.State,
          -- Land Development specific attributes
          ca.Acreage,
          ca.SquareFootage,
          ca.BuildingFootprintSF
        FROM pipeline.CommercialAcreage ca
        LEFT JOIN core.Project p ON ca.ProjectId = p.ProjectId
        WHERE ca.ProjectId = @projectId
      `);
    
    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Commercial Acreage record for this project not found' } });
      return;
    }
    
    res.json({ success: true, data: normalizeStateInPayload(result.recordset[0]) });
  } catch (error) {
    next(error);
  }
};

export const createCommercialAcreage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      ProjectId,
      // Land Development specific attributes
      Acreage,
      SquareFootage,
      BuildingFootprintSF
    } = req.body;

    if (!ProjectId) {
      res.status(400).json({ success: false, error: { message: 'ProjectId is required' } });
      return;
    }

    const pool = await getConnection();
    
    // Insert Land Development specific data
    const result = await pool.request()
      .input('ProjectId', sql.Int, ProjectId)
      .input('Acreage', sql.Decimal(18, 4), Acreage)
      .input('SquareFootage', sql.Decimal(18, 2), SquareFootage)
      .input('BuildingFootprintSF', sql.Decimal(18, 2), BuildingFootprintSF)
      .query(`
        INSERT INTO pipeline.CommercialAcreage (ProjectId, Acreage, SquareFootage, BuildingFootprintSF)
        OUTPUT INSERTED.*
        VALUES (@ProjectId, @Acreage, @SquareFootage, @BuildingFootprintSF)
      `);

    // Get the full record with CORE data
    const fullRecord = await pool.request()
      .input('id', sql.Int, result.recordset[0].CommercialAcreageId)
      .query(`
        SELECT 
          ca.CommercialAcreageId,
          ca.ProjectId,
          p.ProjectName,
          p.City,
          p.State,
          ca.Acreage,
          ca.SquareFootage,
          ca.BuildingFootprintSF
        FROM pipeline.CommercialAcreage ca
        LEFT JOIN core.Project p ON ca.ProjectId = p.ProjectId
        WHERE ca.CommercialAcreageId = @id
      `);

    res.status(201).json({ success: true, data: fullRecord.recordset[0] });
  } catch (error: any) {
    if (error.number === 2627) {
      res.status(409).json({ success: false, error: { message: 'Commercial Acreage record for this project already exists' } });
      return;
    }
    if (error.number === 547) {
      res.status(400).json({ success: false, error: { message: 'Invalid ProjectId' } });
      return;
    }
    next(error);
  }
};

export const updateCommercialAcreage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const {
      // Land Development specific attributes
      Acreage,
      SquareFootage,
      BuildingFootprintSF
    } = req.body;

    const pool = await getConnection();
    
    // Build dynamic update query for Land Development fields
    const fields: string[] = [];
    const request = pool.request().input('id', sql.Int, id);

    if (Acreage !== undefined) {
      fields.push('Acreage = @Acreage');
      request.input('Acreage', sql.Decimal(18, 4), Acreage);
    }
    if (SquareFootage !== undefined) {
      fields.push('SquareFootage = @SquareFootage');
      request.input('SquareFootage', sql.Decimal(18, 2), SquareFootage);
    }
    if (BuildingFootprintSF !== undefined) {
      fields.push('BuildingFootprintSF = @BuildingFootprintSF');
      request.input('BuildingFootprintSF', sql.Decimal(18, 2), BuildingFootprintSF);
    }

    if (fields.length === 0) {
      res.status(400).json({ success: false, error: { message: 'No fields to update' } });
      return;
    }

    await request.query(`
      UPDATE pipeline.CommercialAcreage
      SET ${fields.join(', ')}
      WHERE CommercialAcreageId = @id
    `);

    // Get the updated record with CORE data
    const updated = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT 
          ca.CommercialAcreageId,
          ca.ProjectId,
          p.ProjectName,
          p.City,
          p.State,
          ca.Acreage,
          ca.SquareFootage,
          ca.BuildingFootprintSF
        FROM pipeline.CommercialAcreage ca
        LEFT JOIN core.Project p ON ca.ProjectId = p.ProjectId
        WHERE ca.CommercialAcreageId = @id
      `);

    if (updated.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Commercial Acreage record not found' } });
      return;
    }

    res.json({ success: true, data: normalizeStateInPayload(updated.recordset[0]) });
  } catch (error: any) {
    if (error.number === 547) {
      res.status(400).json({ success: false, error: { message: 'Invalid ProjectId' } });
      return;
    }
    next(error);
  }
};

export const deleteCommercialAcreage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM pipeline.CommercialAcreage WHERE CommercialAcreageId = @id');

    if (result.rowsAffected[0] === 0) {
      res.status(404).json({ success: false, error: { message: 'Commercial Acreage record not found' } });
      return;
    }

    res.json({ success: true, message: 'Commercial Acreage record deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// CLOSED PROPERTY CONTROLLER
// ============================================================

export const getAllClosedProperties = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const pool = await getConnection();
    // Pull CORE data (ProjectName, City, State, Address) and Closed Property specific data
    const result = await pool.request().query(`
      SELECT 
        cp.ClosedPropertyId,
        cp.ProjectId,
        -- CORE attributes (from core.Project)
        p.ProjectName,
        p.City,
        p.State,
        p.Address,
        -- Closed Property specific attributes
        cp.Status,
        cp.LandClosingDate AS ClosingDate,
        cp.Acreage,
        cp.Units,
        cp.Price,
        cp.PricePerSF,
        cp.ActOfSale,
        cp.DueDiligenceDate,
        cp.PurchasingEntity,
        cp.CashFlag
      FROM pipeline.ClosedProperty cp
      LEFT JOIN core.Project p ON cp.ProjectId = p.ProjectId
      ORDER BY cp.ClosedPropertyId
    `);
    res.json({ success: true, data: normalizeStateInPayload(result.recordset) });
  } catch (error) {
    next(error);
  }
};

export const getClosedPropertyById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    // Pull CORE data (ProjectName, City, State, Address) and Closed Property specific data
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT 
          cp.ClosedPropertyId,
          cp.ProjectId,
          -- CORE attributes (from core.Project)
          p.ProjectName,
          p.City,
          p.State,
          p.Address,
          -- Closed Property specific attributes
          cp.Status,
          cp.LandClosingDate AS ClosingDate,
          cp.Acreage,
          cp.Units,
          cp.Price,
          cp.PricePerSF,
          cp.ActOfSale,
          cp.DueDiligenceDate,
          cp.PurchasingEntity,
          cp.CashFlag
        FROM pipeline.ClosedProperty cp
        LEFT JOIN core.Project p ON cp.ProjectId = p.ProjectId
        WHERE cp.ClosedPropertyId = @id
      `);
    
    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Closed Property record not found' } });
      return;
    }
    
    res.json({ success: true, data: normalizeStateInPayload(result.recordset[0]) });
  } catch (error) {
    next(error);
  }
};

export const createClosedProperty = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      ProjectId,
      // CORE attributes (can be updated in CORE if provided)
      City,
      State,
      Address,
      // Closed Property specific attributes
      Status,
      ClosingDate, // Will be stored as LandClosingDate
      Acreage,
      Units,
      Price,
      PricePerSF,
      ActOfSale,
      DueDiligenceDate,
      PurchasingEntity,
      CashFlag
    } = req.body;

    if (!ProjectId) {
      res.status(400).json({ success: false, error: { message: 'ProjectId is required' } });
      return;
    }

    const pool = await getConnection();
    
    // Update City, State, and Address in CORE if provided
    if (City !== undefined || State !== undefined || Address !== undefined) {
      const updateFields: string[] = [];
      const updateRequest = pool.request().input('ProjectId', sql.Int, ProjectId);
      
      if (City !== undefined) {
        updateFields.push('City = @City');
        updateRequest.input('City', sql.NVarChar, City);
      }
      if (State !== undefined) {
        updateFields.push('State = @State');
        updateRequest.input('State', sql.NVarChar, normalizeState(State));
      }
      if (Address !== undefined) {
        updateFields.push('Address = @Address');
        updateRequest.input('Address', sql.NVarChar(500), Address);
      }
      
      updateFields.push('UpdatedAt = SYSDATETIME()');
      await updateRequest.query(`
        UPDATE core.Project
        SET ${updateFields.join(', ')}
        WHERE ProjectId = @ProjectId
      `);
    }
    
    // Insert Closed Property specific data (Address is stored in CORE, ClosingDate stored as LandClosingDate)
    const result = await pool.request()
      .input('ProjectId', sql.Int, ProjectId)
      .input('Status', sql.NVarChar, Status)
      .input('LandClosingDate', sql.Date, ClosingDate)
      .input('Acreage', sql.Decimal(18, 4), Acreage)
      .input('Units', sql.Int, Units)
      .input('Price', sql.Decimal(18, 2), Price)
      .input('PricePerSF', sql.Decimal(18, 2), PricePerSF)
      .input('ActOfSale', sql.NVarChar, ActOfSale)
      .input('DueDiligenceDate', sql.Date, DueDiligenceDate)
      .input('PurchasingEntity', sql.NVarChar, PurchasingEntity)
      .input('CashFlag', sql.Bit, CashFlag)
      .query(`
        INSERT INTO pipeline.ClosedProperty (
          ProjectId, Status, LandClosingDate, Acreage,
          Units, Price, PricePerSF, ActOfSale, DueDiligenceDate,
          PurchasingEntity, CashFlag
        )
        OUTPUT INSERTED.*
        VALUES (
          @ProjectId, @Status, @LandClosingDate, @Acreage,
          @Units, @Price, @PricePerSF, @ActOfSale, @DueDiligenceDate,
          @PurchasingEntity, @CashFlag
        )
      `);

    // Get the full record with CORE data
    const fullRecord = await pool.request()
      .input('id', sql.Int, result.recordset[0].ClosedPropertyId)
      .query(`
        SELECT 
          cp.ClosedPropertyId,
          cp.ProjectId,
          p.ProjectName,
          p.City,
          p.State,
          p.Address,
          cp.Status,
          cp.LandClosingDate AS ClosingDate,
          cp.Acreage,
          cp.Units,
          cp.Price,
          cp.PricePerSF,
          cp.ActOfSale,
          cp.DueDiligenceDate,
          cp.PurchasingEntity,
          cp.CashFlag
        FROM pipeline.ClosedProperty cp
        LEFT JOIN core.Project p ON cp.ProjectId = p.ProjectId
        WHERE cp.ClosedPropertyId = @id
      `);

    res.status(201).json({ success: true, data: fullRecord.recordset[0] });
  } catch (error: any) {
    if (error.number === 2627) {
      res.status(409).json({ success: false, error: { message: 'Closed Property record for this project already exists' } });
      return;
    }
    if (error.number === 547) {
      res.status(400).json({ success: false, error: { message: 'Invalid ProjectId' } });
      return;
    }
    next(error);
  }
};

export const updateClosedProperty = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const {
      // CORE attributes (can be updated in CORE if provided)
      City,
      State,
      Address,
      // Closed Property specific attributes
      Status,
      ClosingDate, // Will be stored as LandClosingDate
      Acreage,
      Units,
      Price,
      PricePerSF,
      ActOfSale,
      DueDiligenceDate,
      PurchasingEntity,
      CashFlag
    } = req.body;

    const pool = await getConnection();
    
    // Get ProjectId first
    const cpResult = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT ProjectId FROM pipeline.ClosedProperty WHERE ClosedPropertyId = @id');
    
    if (cpResult.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Closed Property record not found' } });
      return;
    }

    const projectId = cpResult.recordset[0].ProjectId;
    
    // Update City, State, and Address in CORE if provided
    if (City !== undefined || State !== undefined || Address !== undefined) {
      const updateFields: string[] = [];
      const updateRequest = pool.request().input('ProjectId', sql.Int, projectId);
      
      if (City !== undefined) {
        updateFields.push('City = @City');
        updateRequest.input('City', sql.NVarChar, City);
      }
      if (State !== undefined) {
        updateFields.push('State = @State');
        updateRequest.input('State', sql.NVarChar, normalizeState(State));
      }
      if (Address !== undefined) {
        updateFields.push('Address = @Address');
        updateRequest.input('Address', sql.NVarChar(500), Address);
      }
      
      updateFields.push('UpdatedAt = SYSDATETIME()');
      await updateRequest.query(`
        UPDATE core.Project
        SET ${updateFields.join(', ')}
        WHERE ProjectId = @ProjectId
      `);
    }

    // Build dynamic update query for Closed Property fields
    const fields: string[] = [];
    const request = pool.request().input('id', sql.Int, id);

    if (Status !== undefined) {
      fields.push('Status = @Status');
      request.input('Status', sql.NVarChar, Status);
    }
    if (ClosingDate !== undefined) {
      fields.push('LandClosingDate = @LandClosingDate');
      request.input('LandClosingDate', sql.Date, ClosingDate);
    }
    if (Acreage !== undefined) {
      fields.push('Acreage = @Acreage');
      request.input('Acreage', sql.Decimal(18, 4), Acreage);
    }
    if (Units !== undefined) {
      fields.push('Units = @Units');
      request.input('Units', sql.Int, Units);
    }
    if (Price !== undefined) {
      fields.push('Price = @Price');
      request.input('Price', sql.Decimal(18, 2), Price);
    }
    if (PricePerSF !== undefined) {
      fields.push('PricePerSF = @PricePerSF');
      request.input('PricePerSF', sql.Decimal(18, 2), PricePerSF);
    }
    if (ActOfSale !== undefined) {
      fields.push('ActOfSale = @ActOfSale');
      request.input('ActOfSale', sql.NVarChar, ActOfSale);
    }
    if (DueDiligenceDate !== undefined) {
      fields.push('DueDiligenceDate = @DueDiligenceDate');
      request.input('DueDiligenceDate', sql.Date, DueDiligenceDate);
    }
    if (PurchasingEntity !== undefined) {
      fields.push('PurchasingEntity = @PurchasingEntity');
      request.input('PurchasingEntity', sql.NVarChar, PurchasingEntity);
    }
    if (CashFlag !== undefined) {
      fields.push('CashFlag = @CashFlag');
      request.input('CashFlag', sql.Bit, CashFlag);
    }

    if (fields.length === 0 && City === undefined && State === undefined && Address === undefined) {
      res.status(400).json({ success: false, error: { message: 'No fields to update' } });
      return;
    }

    if (fields.length > 0) {
      await request.query(`
        UPDATE pipeline.ClosedProperty
        SET ${fields.join(', ')}
        WHERE ClosedPropertyId = @id
      `);
    }

    // Get the updated record with CORE data
    const updated = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT 
          cp.ClosedPropertyId,
          cp.ProjectId,
          p.ProjectName,
          p.City,
          p.State,
          p.Address,
          cp.Status,
          cp.LandClosingDate AS ClosingDate,
          cp.Acreage,
          cp.Units,
          cp.Price,
          cp.PricePerSF,
          cp.ActOfSale,
          cp.DueDiligenceDate,
          cp.PurchasingEntity,
          cp.CashFlag
        FROM pipeline.ClosedProperty cp
        LEFT JOIN core.Project p ON cp.ProjectId = p.ProjectId
        WHERE cp.ClosedPropertyId = @id
      `);

    if (updated.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Closed Property record not found' } });
      return;
    }

    res.json({ success: true, data: normalizeStateInPayload(updated.recordset[0]) });
  } catch (error: any) {
    if (error.number === 547) {
      res.status(400).json({ success: false, error: { message: 'Invalid ProjectId' } });
      return;
    }
    next(error);
  }
};

export const deleteClosedProperty = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM pipeline.ClosedProperty WHERE ClosedPropertyId = @id');

    if (result.rowsAffected[0] === 0) {
      res.status(404).json({ success: false, error: { message: 'Closed Property record not found' } });
      return;
    }

    res.json({ success: true, message: 'Closed Property record deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// BROKER/REFERRAL CONTACT (Land Development Pipeline)
// ============================================================

export const getAllBrokerReferralContacts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const q = (req.query.q as string) || '';
    const pool = await getConnection();
    if (q.trim()) {
      const result = await pool.request()
        .input('q', sql.NVarChar(255), `%${q.trim()}%`)
        .query(`
          SELECT BrokerReferralContactId, Name, Email, Phone, CreatedAt, ModifiedAt
          FROM pipeline.BrokerReferralContact
          WHERE Name LIKE @q OR Email LIKE @q OR Phone LIKE @q
          ORDER BY Name
        `);
      res.json({ success: true, data: result.recordset });
    } else {
      const result = await pool.request().query(`
        SELECT BrokerReferralContactId, Name, Email, Phone, CreatedAt, ModifiedAt
        FROM pipeline.BrokerReferralContact
        ORDER BY Name
      `);
      res.json({ success: true, data: result.recordset });
    }
  } catch (error) {
    next(error);
  }
};

export const getBrokerReferralContactById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ success: false, error: { message: 'Invalid id' } });
      return;
    }
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT BrokerReferralContactId, Name, Email, Phone, CreatedAt, ModifiedAt
        FROM pipeline.BrokerReferralContact
        WHERE BrokerReferralContactId = @id
      `);
    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Contact not found' } });
      return;
    }
    res.json({ success: true, data: result.recordset[0] });
  } catch (error) {
    next(error);
  }
};

export const createBrokerReferralContact = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { Name, Email, Phone } = req.body;
    if (!Name || typeof Name !== 'string' || !Name.trim()) {
      res.status(400).json({ success: false, error: { message: 'Name is required' } });
      return;
    }
    const pool = await getConnection();
    const result = await pool.request()
      .input('Name', sql.NVarChar(255), Name.trim())
      .input('Email', sql.NVarChar(255), Email ?? null)
      .input('Phone', sql.NVarChar(100), Phone ?? null)
      .query(`
        INSERT INTO pipeline.BrokerReferralContact (Name, Email, Phone)
        OUTPUT INSERTED.BrokerReferralContactId, INSERTED.Name, INSERTED.Email, INSERTED.Phone, INSERTED.CreatedAt, INSERTED.ModifiedAt
        VALUES (@Name, @Email, @Phone)
      `);
    res.status(201).json({ success: true, data: result.recordset[0] });
  } catch (error) {
    next(error);
  }
};

export const updateBrokerReferralContact = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ success: false, error: { message: 'Invalid id' } });
      return;
    }
    const { Name, Email, Phone } = req.body;
    const pool = await getConnection();
    const check = await pool.request().input('id', sql.Int, id)
      .query('SELECT BrokerReferralContactId FROM pipeline.BrokerReferralContact WHERE BrokerReferralContactId = @id');
    if (check.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Contact not found' } });
      return;
    }
    const updates: string[] = ['ModifiedAt = SYSDATETIME()'];
    const request = pool.request().input('id', sql.Int, id);
    if (Name !== undefined) { updates.push('Name = @Name'); request.input('Name', sql.NVarChar(255), Name); }
    if (Email !== undefined) { updates.push('Email = @Email'); request.input('Email', sql.NVarChar(255), Email); }
    if (Phone !== undefined) { updates.push('Phone = @Phone'); request.input('Phone', sql.NVarChar(100), Phone); }
    await request.query(`
      UPDATE pipeline.BrokerReferralContact SET ${updates.join(', ')} WHERE BrokerReferralContactId = @id
    `);
    const result = await pool.request().input('id', sql.Int, id).query(`
      SELECT BrokerReferralContactId, Name, Email, Phone, CreatedAt, ModifiedAt
      FROM pipeline.BrokerReferralContact WHERE BrokerReferralContactId = @id
    `);
    res.json({ success: true, data: result.recordset[0] });
  } catch (error) {
    next(error);
  }
};

export const deleteBrokerReferralContact = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ success: false, error: { message: 'Invalid id' } });
      return;
    }
    const pool = await getConnection();
    const inUse = await pool.request().input('id', sql.Int, id)
      .query('SELECT 1 FROM pipeline.DealPipeline WHERE BrokerReferralContactId = @id');
    if (inUse.recordset.length > 0) {
      res.status(409).json({ success: false, error: { message: 'Contact is referenced by one or more deals; clear BrokerReferralContactId on those deals first' } });
      return;
    }
    const result = await pool.request().input('id', sql.Int, id)
      .query('DELETE FROM pipeline.BrokerReferralContact WHERE BrokerReferralContactId = @id');
    if (result.rowsAffected[0] === 0) {
      res.status(404).json({ success: false, error: { message: 'Contact not found' } });
      return;
    }
    res.json({ success: true, message: 'Contact deleted' });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// DEAL PIPELINE CONTROLLER (Land Development Deal Tracker)
// ============================================================

export const getAllDealPipelines = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const pool = await getConnection();
    // Pull CORE data and Deal Pipeline specific data
    const result = await pool.request().query(`
      SELECT 
        dp.DealPipelineId,
        dp.ProjectId,
        -- CORE attributes (from core.Project)
        p.ProjectName,
        p.City,
        p.State,
        p.Region,
        p.Units,
        p.ProductType,
        p.Stage,
        p.EstimatedConstructionStartDate,
        -- Region from core.Region table
        r.RegionName AS RegionName,
        -- Pre-Con Manager
        pm.FullName AS PreConManagerName,
        pm.Email AS PreConManagerEmail,
        pm.Phone AS PreConManagerPhone,
        -- Deal Pipeline specific attributes
        dp.Bank,
        dp.StartDate,
        dp.UnitCount,
        dp.PreConManagerId,
        dp.ConstructionLoanClosingDate,
        dp.Notes,
        dp.Priority,
        dp.Acreage,
        dp.LandPrice,
        dp.SqFtPrice,
        dp.ExecutionDate,
        dp.DueDiligenceDate,
        dp.ClosingDate,
        dp.PurchasingEntity,
        dp.Cash,
        dp.OpportunityZone,
        dp.ClosingNotes,
        dp.County,
        dp.ZipCode,
        dp.MFAcreage,
        dp.Zoning,
        dp.Zoned,
        dp.ListingStatus,
        dp.PriceRaw,
        dp.BrokerReferralContactId,
        dp.BrokerReferralSource,
        dp.RejectedReason,
        dp.Latitude,
        dp.Longitude,
        dp.CoordinateSource,
        dp.AsanaTaskGid,
        dp.AsanaProjectGid,
        dp.CreatedAt,
        dp.UpdatedAt,
        br.Name AS BrokerReferralContactName,
        br.Email AS BrokerReferralContactEmail,
        br.Phone AS BrokerReferralContactPhone
      FROM pipeline.DealPipeline dp
      LEFT JOIN core.Project p ON dp.ProjectId = p.ProjectId
      LEFT JOIN core.Region r ON p.Region = r.RegionName
      LEFT JOIN core.PreConManager pm ON dp.PreConManagerId = pm.PreConManagerId
      LEFT JOIN pipeline.BrokerReferralContact br ON dp.BrokerReferralContactId = br.BrokerReferralContactId
      ORDER BY dp.DealPipelineId
    `);
    res.json({ success: true, data: normalizeStateInPayload(result.recordset) });
  } catch (error) {
    next(error);
  }
};

export const getDealPipelineById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT 
          dp.DealPipelineId,
          dp.ProjectId,
          p.ProjectName,
          p.City,
          p.State,
          p.Region,
          p.Units,
          p.ProductType,
          p.Stage,
          p.EstimatedConstructionStartDate,
          r.RegionName AS RegionName,
          pm.FullName AS PreConManagerName,
          pm.Email AS PreConManagerEmail,
          pm.Phone AS PreConManagerPhone,
          dp.Bank,
          dp.StartDate,
          dp.UnitCount,
          dp.PreConManagerId,
          dp.ConstructionLoanClosingDate,
          dp.Notes,
          dp.Priority,
          dp.Acreage,
          dp.LandPrice,
          dp.SqFtPrice,
          dp.ExecutionDate,
          dp.DueDiligenceDate,
          dp.ClosingDate,
          dp.PurchasingEntity,
          dp.Cash,
          dp.OpportunityZone,
          dp.ClosingNotes,
          dp.County,
          dp.ZipCode,
          dp.MFAcreage,
          dp.Zoning,
          dp.Zoned,
          dp.ListingStatus,
          dp.PriceRaw,
          dp.BrokerReferralContactId,
          dp.BrokerReferralSource,
          dp.RejectedReason,
          dp.Latitude,
          dp.Longitude,
          dp.CoordinateSource,
          dp.AsanaTaskGid,
          dp.AsanaProjectGid,
          dp.CreatedAt,
          dp.UpdatedAt,
          br.Name AS BrokerReferralContactName,
          br.Email AS BrokerReferralContactEmail,
          br.Phone AS BrokerReferralContactPhone
        FROM pipeline.DealPipeline dp
        LEFT JOIN core.Project p ON dp.ProjectId = p.ProjectId
        LEFT JOIN core.Region r ON p.Region = r.RegionName
        LEFT JOIN core.PreConManager pm ON dp.PreConManagerId = pm.PreConManagerId
        LEFT JOIN pipeline.BrokerReferralContact br ON dp.BrokerReferralContactId = br.BrokerReferralContactId
        WHERE dp.DealPipelineId = @id
      `);
    
    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Deal Pipeline record not found' } });
      return;
    }
    
    res.json({ success: true, data: normalizeStateInPayload(result.recordset[0]) });
  } catch (error) {
    next(error);
  }
};

export const getDealPipelineByProjectId = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { projectId } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('projectId', sql.Int, projectId)
      .query(`
        SELECT 
          dp.DealPipelineId,
          dp.ProjectId,
          -- CORE attributes (from core.Project)
          p.ProjectName,
          p.City,
          p.State,
          p.Region,
          p.Units,
          p.ProductType,
          p.Stage,
          p.EstimatedConstructionStartDate,
          -- Region from core.Region table
          r.RegionName AS RegionName,
          -- Pre-Con Manager
          pm.FullName AS PreConManagerName,
          pm.Email AS PreConManagerEmail,
          pm.Phone AS PreConManagerPhone,
          -- Deal Pipeline specific attributes
          dp.Bank,
          dp.StartDate,
          dp.UnitCount,
          dp.PreConManagerId,
          dp.ConstructionLoanClosingDate,
          dp.Notes,
          dp.Priority,
          dp.Acreage,
          dp.LandPrice,
          dp.SqFtPrice,
          dp.ExecutionDate,
          dp.DueDiligenceDate,
          dp.ClosingDate,
          dp.PurchasingEntity,
          dp.Cash,
          dp.OpportunityZone,
          dp.ClosingNotes,
          dp.County,
          dp.ZipCode,
          dp.MFAcreage,
          dp.Zoning,
          dp.Zoned,
          dp.ListingStatus,
          dp.PriceRaw,
          dp.BrokerReferralContactId,
          dp.BrokerReferralSource,
          dp.RejectedReason,
          dp.Latitude,
          dp.Longitude,
          dp.CoordinateSource,
          dp.AsanaTaskGid,
          dp.AsanaProjectGid,
          dp.CreatedAt,
          dp.UpdatedAt,
          br.Name AS BrokerReferralContactName,
          br.Email AS BrokerReferralContactEmail,
          br.Phone AS BrokerReferralContactPhone
        FROM pipeline.DealPipeline dp
        LEFT JOIN core.Project p ON dp.ProjectId = p.ProjectId
        LEFT JOIN core.Region r ON p.Region = r.RegionName
        LEFT JOIN core.PreConManager pm ON dp.PreConManagerId = pm.PreConManagerId
        LEFT JOIN pipeline.BrokerReferralContact br ON dp.BrokerReferralContactId = br.BrokerReferralContactId
        WHERE dp.ProjectId = @projectId
      `);
    
    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Deal Pipeline record for this project not found' } });
      return;
    }
    
    res.json({ success: true, data: normalizeStateInPayload(result.recordset[0]) });
  } catch (error) {
    next(error);
  }
};

export const createDealPipeline = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      ProjectId,
      // CORE attributes (can be updated in CORE if provided)
      ProjectName,
      City,
      State,
      Region,
      Units,
      ProductType,
      Stage,
      EstimatedConstructionStartDate,
      // Deal Pipeline specific attributes
      Bank,
      StartDate,
      UnitCount,
      PreConManagerId,
      ConstructionLoanClosingDate,
      Notes,
      Priority,
      Acreage,
      LandPrice,
      ExecutionDate,
      DueDiligenceDate,
      ClosingDate,
      PurchasingEntity,
      Cash,
      OpportunityZone,
      ClosingNotes,
      AsanaTaskGid,
      AsanaProjectGid,
      County,
      ZipCode,
      MFAcreage,
      Zoning,
      Zoned,
      ListingStatus,
      PriceRaw,
      BrokerReferralContactId,
      BrokerReferralSource,
      RejectedReason,
      Latitude,
      Longitude,
      CoordinateSource
    } = req.body;

    const pool = await getConnection();
    
    let actualProjectId = ProjectId;
    
    // If ProjectId not provided but ProjectName is, create the project first
    if (!ProjectId && ProjectName) {
      try {
        // Check if project already exists by name
        const existingProject = await pool.request()
          .input('ProjectName', sql.NVarChar(255), ProjectName)
          .query('SELECT ProjectId FROM core.Project WHERE ProjectName = @ProjectName');
        
        if (existingProject.recordset.length > 0) {
          actualProjectId = existingProject.recordset[0].ProjectId;
        } else {
          // Create new project
          const createProjectResult = await pool.request()
            .input('ProjectName', sql.NVarChar(255), ProjectName)
            .input('City', sql.NVarChar(100), City)
            .input('State', sql.NVarChar(50), normalizeState(State))
            .input('Region', sql.NVarChar(50), Region)
            .input('Units', sql.Int, Units)
            .input('ProductType', sql.NVarChar(50), ProductType)
            .input('Stage', sql.NVarChar(50), Stage)
            .input('EstimatedConstructionStartDate', sql.Date, EstimatedConstructionStartDate)
            .query(`
              INSERT INTO core.Project (ProjectName, City, State, Region, Units, ProductType, Stage, EstimatedConstructionStartDate)
              VALUES (@ProjectName, @City, @State, @Region, @Units, @ProductType, @Stage, @EstimatedConstructionStartDate);
              SELECT SCOPE_IDENTITY() AS ProjectId;
            `);
          
          // Get the created ProjectId
          const getIdResult = await pool.request()
            .input('ProjectName', sql.NVarChar(255), ProjectName)
            .query('SELECT ProjectId FROM core.Project WHERE ProjectName = @ProjectName');
          
          actualProjectId = getIdResult.recordset[0].ProjectId;
        }
      } catch (error: any) {
        if (error.number === 2627) {
          // Project already exists, get its ID
          const existingProject = await pool.request()
            .input('ProjectName', sql.NVarChar(255), ProjectName)
            .query('SELECT ProjectId FROM core.Project WHERE ProjectName = @ProjectName');
          actualProjectId = existingProject.recordset[0].ProjectId;
        } else {
          throw error;
        }
      }
    } else if (!ProjectId) {
      res.status(400).json({ success: false, error: { message: 'ProjectId or ProjectName is required' } });
      return;
    }
    
    // Update CORE attributes if provided
    if (ProjectName !== undefined || City !== undefined || State !== undefined || Region !== undefined || 
        Units !== undefined || ProductType !== undefined || Stage !== undefined || EstimatedConstructionStartDate !== undefined) {
      const updateFields: string[] = [];
      const updateRequest = pool.request().input('ProjectId', sql.Int, actualProjectId);
      
      if (ProjectName !== undefined) {
        updateFields.push('ProjectName = @ProjectName');
        updateRequest.input('ProjectName', sql.NVarChar(255), ProjectName);
      }
      if (City !== undefined) {
        updateFields.push('City = @City');
        updateRequest.input('City', sql.NVarChar(100), City);
      }
      if (State !== undefined) {
        updateFields.push('State = @State');
        updateRequest.input('State', sql.NVarChar(50), normalizeState(State));
      }
      if (Region !== undefined) {
        updateFields.push('Region = @Region');
        updateRequest.input('Region', sql.NVarChar(50), Region);
      }
      if (Units !== undefined) {
        updateFields.push('Units = @Units');
        updateRequest.input('Units', sql.Int, Units);
      }
      if (ProductType !== undefined) {
        updateFields.push('ProductType = @ProductType');
        updateRequest.input('ProductType', sql.NVarChar(50), ProductType);
      }
      if (Stage !== undefined) {
        updateFields.push('Stage = @Stage');
        updateRequest.input('Stage', sql.NVarChar(50), Stage);
      }
      if (EstimatedConstructionStartDate !== undefined) {
        updateFields.push('EstimatedConstructionStartDate = @EstimatedConstructionStartDate');
        updateRequest.input('EstimatedConstructionStartDate', sql.Date, EstimatedConstructionStartDate);
      }
      
      updateFields.push('UpdatedAt = SYSDATETIME()');
      await updateRequest.query(`
        UPDATE core.Project
        SET ${updateFields.join(', ')}
        WHERE ProjectId = @ProjectId
      `);
    }

    // Calculate SqFtPrice: LandPrice / (Acreage * 43560)
    let sqFtPrice: number | null = null;
    if (LandPrice && Acreage && Acreage > 0) {
      sqFtPrice = LandPrice / (Acreage * 43560);
    }

    // Use UnitCount to update Units in CORE if UnitCount is provided but Units is not
    if (UnitCount !== undefined && Units === undefined) {
      await pool.request()
        .input('ProjectId', sql.Int, actualProjectId)
        .input('UnitCount', sql.Int, UnitCount)
        .query('UPDATE core.Project SET Units = @UnitCount, UpdatedAt = SYSDATETIME() WHERE ProjectId = @ProjectId');
    }

    // Insert Deal Pipeline specific data
    const result = await pool.request()
      .input('ProjectId', sql.Int, actualProjectId)
      .input('Bank', sql.NVarChar(255), Bank)
      .input('StartDate', sql.Date, StartDate)
      .input('UnitCount', sql.Int, UnitCount)
      .input('PreConManagerId', sql.Int, PreConManagerId)
      .input('ConstructionLoanClosingDate', sql.Date, ConstructionLoanClosingDate)
      .input('Notes', sql.NVarChar(sql.MAX), Notes)
      .input('Priority', sql.NVarChar(20), Priority)
      .input('Acreage', sql.Decimal(18, 4), Acreage)
      .input('LandPrice', sql.Decimal(18, 2), LandPrice)
      .input('SqFtPrice', sql.Decimal(18, 2), sqFtPrice)
      .input('ExecutionDate', sql.Date, ExecutionDate)
      .input('DueDiligenceDate', sql.Date, DueDiligenceDate)
      .input('ClosingDate', sql.Date, ClosingDate)
      .input('PurchasingEntity', sql.NVarChar(255), PurchasingEntity)
      .input('Cash', sql.Bit, Cash)
      .input('OpportunityZone', sql.Bit, OpportunityZone)
      .input('ClosingNotes', sql.NVarChar(sql.MAX), ClosingNotes)
      .input('County', sql.NVarChar(100), County)
      .input('ZipCode', sql.NVarChar(20), ZipCode)
      .input('MFAcreage', sql.Decimal(18, 4), MFAcreage)
      .input('Zoning', sql.NVarChar(100), Zoning)
      .input('Zoned', sql.NVarChar(20), Zoned)
      .input('ListingStatus', sql.NVarChar(50), ListingStatus)
      .input('PriceRaw', sql.NVarChar(100), PriceRaw)
      .input('BrokerReferralContactId', sql.Int, BrokerReferralContactId)
      .input('BrokerReferralSource', sql.NVarChar(255), BrokerReferralSource)
      .input('RejectedReason', sql.NVarChar(500), RejectedReason)
      .input('AsanaTaskGid', sql.NVarChar(100), AsanaTaskGid)
      .input('AsanaProjectGid', sql.NVarChar(100), AsanaProjectGid)
      .input('Latitude', sql.Decimal(18, 8), Latitude)
      .input('Longitude', sql.Decimal(18, 8), Longitude)
      .input('CoordinateSource', sql.NVarChar(20), CoordinateSource ?? null)
      .query(`
        IF NOT EXISTS (SELECT 1 FROM pipeline.DealPipeline WHERE ProjectId = @ProjectId)
        BEGIN
          INSERT INTO pipeline.DealPipeline (
            ProjectId, Bank, StartDate, UnitCount, PreConManagerId,
            ConstructionLoanClosingDate, Notes, Priority, Acreage, LandPrice,
            SqFtPrice, ExecutionDate, DueDiligenceDate, ClosingDate,
            PurchasingEntity, Cash, OpportunityZone, ClosingNotes,
            County, ZipCode, MFAcreage, Zoning, Zoned, ListingStatus, PriceRaw, BrokerReferralContactId, BrokerReferralSource, RejectedReason,
            AsanaTaskGid, AsanaProjectGid, Latitude, Longitude, CoordinateSource
          )
          VALUES (
            @ProjectId, @Bank, @StartDate, @UnitCount, @PreConManagerId,
            @ConstructionLoanClosingDate, @Notes, @Priority, @Acreage, @LandPrice,
            @SqFtPrice, @ExecutionDate, @DueDiligenceDate, @ClosingDate,
            @PurchasingEntity, @Cash, @OpportunityZone, @ClosingNotes,
            @County, @ZipCode, @MFAcreage, @Zoning, @Zoned, @ListingStatus, @PriceRaw, @BrokerReferralContactId, @BrokerReferralSource, @RejectedReason,
            @AsanaTaskGid, @AsanaProjectGid, @Latitude, @Longitude, @CoordinateSource
          );
        END
      `);

    // Get the newly created or existing record
    const fullRecord = await pool.request()
      .input('ProjectId', sql.Int, actualProjectId)
      .query(`
        SELECT 
          dp.DealPipelineId,
          dp.ProjectId,
          p.ProjectName,
          p.City,
          p.State,
          p.Region,
          p.Units,
          p.ProductType,
          p.Stage,
          p.EstimatedConstructionStartDate,
          r.RegionName AS RegionName,
          pm.FullName AS PreConManagerName,
          pm.Email AS PreConManagerEmail,
          pm.Phone AS PreConManagerPhone,
          dp.Bank,
          dp.StartDate,
          dp.UnitCount,
          dp.PreConManagerId,
          dp.ConstructionLoanClosingDate,
          dp.Notes,
          dp.Priority,
          dp.Acreage,
          dp.LandPrice,
          dp.SqFtPrice,
          dp.ExecutionDate,
          dp.DueDiligenceDate,
          dp.ClosingDate,
          dp.PurchasingEntity,
          dp.Cash,
          dp.OpportunityZone,
          dp.ClosingNotes,
          dp.County,
          dp.ZipCode,
          dp.MFAcreage,
          dp.Zoning,
          dp.Zoned,
          dp.ListingStatus,
          dp.PriceRaw,
          dp.BrokerReferralContactId,
          dp.BrokerReferralSource,
          dp.RejectedReason,
          dp.AsanaTaskGid,
          dp.AsanaProjectGid,
          dp.Latitude,
          dp.Longitude,
          dp.CoordinateSource,
          dp.CreatedAt,
          dp.UpdatedAt,
          br.Name AS BrokerReferralContactName,
          br.Email AS BrokerReferralContactEmail,
          br.Phone AS BrokerReferralContactPhone
        FROM pipeline.DealPipeline dp
        LEFT JOIN core.Project p ON dp.ProjectId = p.ProjectId
        LEFT JOIN core.Region r ON p.Region = r.RegionName
        LEFT JOIN core.PreConManager pm ON dp.PreConManagerId = pm.PreConManagerId
        LEFT JOIN pipeline.BrokerReferralContact br ON dp.BrokerReferralContactId = br.BrokerReferralContactId
        WHERE dp.ProjectId = @ProjectId
      `);

    if (fullRecord.recordset.length === 0) {
      res.status(500).json({ success: false, error: { message: 'Failed to create Deal Pipeline record' } });
      return;
    }

    res.status(201).json({ success: true, data: fullRecord.recordset[0] });
  } catch (error: any) {
    if (error.number === 2627) {
      res.status(409).json({ success: false, error: { message: 'Deal Pipeline record for this project already exists' } });
      return;
    }
    if (error.number === 547) {
      res.status(400).json({ success: false, error: { message: 'Invalid ProjectId or PreConManagerId' } });
      return;
    }
    next(error);
  }
};

export const updateDealPipeline = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const {
      // CORE attributes (can be updated in CORE if provided)
      ProjectName,
      City,
      State,
      Region,
      Units,
      ProductType,
      Stage,
      EstimatedConstructionStartDate,
      // Deal Pipeline specific attributes
      Bank,
      StartDate,
      UnitCount,
      PreConManagerId,
      ConstructionLoanClosingDate,
      Notes,
      Priority,
      Acreage,
      LandPrice,
      ExecutionDate,
      DueDiligenceDate,
      ClosingDate,
      PurchasingEntity,
      Cash,
      OpportunityZone,
      ClosingNotes,
      AsanaTaskGid,
      AsanaProjectGid,
      County,
      ZipCode,
      MFAcreage,
      Zoning,
      Zoned,
      ListingStatus,
      PriceRaw,
      BrokerReferralContactId,
      BrokerReferralSource,
      RejectedReason,
      Latitude,
      Longitude,
      CoordinateSource
    } = req.body;

    const pool = await getConnection();
    
    // Get ProjectId first
    const dpResult = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT ProjectId FROM pipeline.DealPipeline WHERE DealPipelineId = @id');
    
    if (dpResult.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Deal Pipeline record not found' } });
      return;
    }

    const projectId = dpResult.recordset[0].ProjectId;
    
    // Update CORE attributes if provided
    if (ProjectName !== undefined || City !== undefined || State !== undefined || Region !== undefined || 
        Units !== undefined || ProductType !== undefined || Stage !== undefined || EstimatedConstructionStartDate !== undefined) {
      const updateFields: string[] = [];
      const updateRequest = pool.request().input('ProjectId', sql.Int, projectId);
      
      if (ProjectName !== undefined) {
        updateFields.push('ProjectName = @ProjectName');
        updateRequest.input('ProjectName', sql.NVarChar(255), ProjectName);
      }
      if (City !== undefined) {
        updateFields.push('City = @City');
        updateRequest.input('City', sql.NVarChar(100), City);
      }
      if (State !== undefined) {
        updateFields.push('State = @State');
        updateRequest.input('State', sql.NVarChar(50), normalizeState(State));
      }
      if (Region !== undefined) {
        updateFields.push('Region = @Region');
        updateRequest.input('Region', sql.NVarChar(50), Region);
      }
      if (Units !== undefined) {
        updateFields.push('Units = @Units');
        updateRequest.input('Units', sql.Int, Units);
      }
      if (ProductType !== undefined) {
        updateFields.push('ProductType = @ProductType');
        updateRequest.input('ProductType', sql.NVarChar(50), ProductType);
      }
      if (Stage !== undefined) {
        updateFields.push('Stage = @Stage');
        updateRequest.input('Stage', sql.NVarChar(50), Stage);
      }
      if (EstimatedConstructionStartDate !== undefined) {
        updateFields.push('EstimatedConstructionStartDate = @EstimatedConstructionStartDate');
        updateRequest.input('EstimatedConstructionStartDate', sql.Date, EstimatedConstructionStartDate);
      }
      
      updateFields.push('UpdatedAt = SYSDATETIME()');
      await updateRequest.query(`
        UPDATE core.Project
        SET ${updateFields.join(', ')}
        WHERE ProjectId = @ProjectId
      `);
    }

    // Use UnitCount to update Units in CORE if UnitCount is provided but Units is not
    if (UnitCount !== undefined && Units === undefined) {
      await pool.request()
        .input('ProjectId', sql.Int, projectId)
        .input('UnitCount', sql.Int, UnitCount)
        .query('UPDATE core.Project SET Units = @UnitCount, UpdatedAt = SYSDATETIME() WHERE ProjectId = @ProjectId');
    }

    // Build dynamic update query for Deal Pipeline fields
    const fields: string[] = [];
    const request = pool.request().input('id', sql.Int, id);

    if (Bank !== undefined) {
      fields.push('Bank = @Bank');
      request.input('Bank', sql.NVarChar(255), Bank);
    }
    if (StartDate !== undefined) {
      fields.push('StartDate = @StartDate');
      request.input('StartDate', sql.Date, StartDate);
    }
    if (UnitCount !== undefined) {
      fields.push('UnitCount = @UnitCount');
      request.input('UnitCount', sql.Int, UnitCount);
    }
    if (PreConManagerId !== undefined) {
      fields.push('PreConManagerId = @PreConManagerId');
      request.input('PreConManagerId', sql.Int, PreConManagerId);
    }
    if (ConstructionLoanClosingDate !== undefined) {
      fields.push('ConstructionLoanClosingDate = @ConstructionLoanClosingDate');
      request.input('ConstructionLoanClosingDate', sql.Date, ConstructionLoanClosingDate);
    }
    if (Notes !== undefined) {
      fields.push('Notes = @Notes');
      request.input('Notes', sql.NVarChar(sql.MAX), Notes);
    }
    if (Priority !== undefined) {
      fields.push('Priority = @Priority');
      request.input('Priority', sql.NVarChar(20), Priority);
    }
    if (Acreage !== undefined) {
      fields.push('Acreage = @Acreage');
      request.input('Acreage', sql.Decimal(18, 4), Acreage);
    }
    if (LandPrice !== undefined) {
      fields.push('LandPrice = @LandPrice');
      request.input('LandPrice', sql.Decimal(18, 2), LandPrice);
    }
    if (ExecutionDate !== undefined) {
      fields.push('ExecutionDate = @ExecutionDate');
      request.input('ExecutionDate', sql.Date, ExecutionDate);
    }
    if (DueDiligenceDate !== undefined) {
      fields.push('DueDiligenceDate = @DueDiligenceDate');
      request.input('DueDiligenceDate', sql.Date, DueDiligenceDate);
    }
    if (ClosingDate !== undefined) {
      fields.push('ClosingDate = @ClosingDate');
      request.input('ClosingDate', sql.Date, ClosingDate);
    }
    if (PurchasingEntity !== undefined) {
      fields.push('PurchasingEntity = @PurchasingEntity');
      request.input('PurchasingEntity', sql.NVarChar(255), PurchasingEntity);
    }
    if (Cash !== undefined) {
      fields.push('Cash = @Cash');
      request.input('Cash', sql.Bit, Cash);
    }
    if (OpportunityZone !== undefined) {
      fields.push('OpportunityZone = @OpportunityZone');
      request.input('OpportunityZone', sql.Bit, OpportunityZone);
    }
    if (ClosingNotes !== undefined) {
      fields.push('ClosingNotes = @ClosingNotes');
      request.input('ClosingNotes', sql.NVarChar(sql.MAX), ClosingNotes);
    }
    if (AsanaTaskGid !== undefined) {
      fields.push('AsanaTaskGid = @AsanaTaskGid');
      request.input('AsanaTaskGid', sql.NVarChar(100), AsanaTaskGid);
    }
    if (AsanaProjectGid !== undefined) {
      fields.push('AsanaProjectGid = @AsanaProjectGid');
      request.input('AsanaProjectGid', sql.NVarChar(100), AsanaProjectGid);
    }
    if (County !== undefined) {
      fields.push('County = @County');
      request.input('County', sql.NVarChar(100), County);
    }
    if (ZipCode !== undefined) {
      fields.push('ZipCode = @ZipCode');
      request.input('ZipCode', sql.NVarChar(20), ZipCode);
    }
    if (MFAcreage !== undefined) {
      fields.push('MFAcreage = @MFAcreage');
      request.input('MFAcreage', sql.Decimal(18, 4), MFAcreage);
    }
    if (Zoning !== undefined) {
      fields.push('Zoning = @Zoning');
      request.input('Zoning', sql.NVarChar(100), Zoning);
    }
    if (Zoned !== undefined) {
      fields.push('Zoned = @Zoned');
      request.input('Zoned', sql.NVarChar(20), Zoned);
    }
    if (ListingStatus !== undefined) {
      fields.push('ListingStatus = @ListingStatus');
      request.input('ListingStatus', sql.NVarChar(50), ListingStatus);
    }
    if (PriceRaw !== undefined) {
      fields.push('PriceRaw = @PriceRaw');
      request.input('PriceRaw', sql.NVarChar(100), PriceRaw);
    }
    if (BrokerReferralContactId !== undefined) {
      fields.push('BrokerReferralContactId = @BrokerReferralContactId');
      request.input('BrokerReferralContactId', sql.Int, BrokerReferralContactId);
    }
    if (BrokerReferralSource !== undefined) {
      fields.push('BrokerReferralSource = @BrokerReferralSource');
      request.input('BrokerReferralSource', sql.NVarChar(255), BrokerReferralSource);
    }
    if (RejectedReason !== undefined) {
      fields.push('RejectedReason = @RejectedReason');
      request.input('RejectedReason', sql.NVarChar(500), RejectedReason);
    }
    if (Latitude !== undefined) {
      fields.push('Latitude = @Latitude');
      request.input('Latitude', sql.Decimal(18, 8), Latitude);
    }
    if (Longitude !== undefined) {
      fields.push('Longitude = @Longitude');
      request.input('Longitude', sql.Decimal(18, 8), Longitude);
    }
    if (CoordinateSource !== undefined) {
      fields.push('CoordinateSource = @CoordinateSource');
      request.input('CoordinateSource', sql.NVarChar(20), CoordinateSource);
    }

    // Recalculate SqFtPrice if LandPrice or Acreage changed
    if (LandPrice !== undefined || Acreage !== undefined) {
      const currentData = await pool.request()
        .input('id', sql.Int, id)
        .query('SELECT LandPrice, Acreage FROM pipeline.DealPipeline WHERE DealPipelineId = @id');
      
      const finalLandPrice = LandPrice !== undefined ? LandPrice : currentData.recordset[0].LandPrice;
      const finalAcreage = Acreage !== undefined ? Acreage : currentData.recordset[0].Acreage;

      let sqFtPrice: number | null = null;
      if (finalLandPrice && finalAcreage && finalAcreage > 0) {
        sqFtPrice = finalLandPrice / (finalAcreage * 43560);
      }
      
      fields.push('SqFtPrice = @SqFtPrice');
      request.input('SqFtPrice', sql.Decimal(18, 2), sqFtPrice);
    }

    if (fields.length === 0 && ProjectName === undefined && City === undefined && State === undefined && 
        Region === undefined && Units === undefined && ProductType === undefined && Stage === undefined && 
        EstimatedConstructionStartDate === undefined) {
      res.status(400).json({ success: false, error: { message: 'No fields to update' } });
      return;
    }

    if (fields.length > 0) {
      fields.push('UpdatedAt = SYSDATETIME()');
      await request.query(`
        UPDATE pipeline.DealPipeline
        SET ${fields.join(', ')}
        WHERE DealPipelineId = @id
      `);
    }

    // Get the updated record with CORE data
    const updated = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT 
          dp.DealPipelineId,
          dp.ProjectId,
          p.ProjectName,
          p.City,
          p.State,
          p.Region,
          p.Units,
          p.ProductType,
          p.Stage,
          p.EstimatedConstructionStartDate,
          r.RegionName AS RegionName,
          pm.FullName AS PreConManagerName,
          pm.Email AS PreConManagerEmail,
          pm.Phone AS PreConManagerPhone,
          dp.Bank,
          dp.StartDate,
          dp.UnitCount,
          dp.PreConManagerId,
          dp.ConstructionLoanClosingDate,
          dp.Notes,
          dp.Priority,
          dp.Acreage,
          dp.LandPrice,
          dp.SqFtPrice,
          dp.ExecutionDate,
          dp.DueDiligenceDate,
          dp.ClosingDate,
          dp.PurchasingEntity,
          dp.Cash,
          dp.OpportunityZone,
          dp.ClosingNotes,
          dp.County,
          dp.ZipCode,
          dp.MFAcreage,
          dp.Zoning,
          dp.Zoned,
          dp.ListingStatus,
          dp.PriceRaw,
          dp.BrokerReferralContactId,
          dp.BrokerReferralSource,
          dp.RejectedReason,
          dp.Latitude,
          dp.Longitude,
          dp.CoordinateSource,
          dp.AsanaTaskGid,
          dp.AsanaProjectGid,
          dp.CreatedAt,
          dp.UpdatedAt,
          br.Name AS BrokerReferralContactName,
          br.Email AS BrokerReferralContactEmail,
          br.Phone AS BrokerReferralContactPhone
        FROM pipeline.DealPipeline dp
        LEFT JOIN core.Project p ON dp.ProjectId = p.ProjectId
        LEFT JOIN core.Region r ON p.Region = r.RegionName
        LEFT JOIN core.PreConManager pm ON dp.PreConManagerId = pm.PreConManagerId
        LEFT JOIN pipeline.BrokerReferralContact br ON dp.BrokerReferralContactId = br.BrokerReferralContactId
        WHERE dp.DealPipelineId = @id
      `);

    if (updated.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Deal Pipeline record not found' } });
      return;
    }

    res.json({ success: true, data: normalizeStateInPayload(updated.recordset[0]) });
  } catch (error: any) {
    if (error.number === 547) {
      res.status(400).json({ success: false, error: { message: 'Invalid ProjectId or PreConManagerId' } });
      return;
    }
    next(error);
  }
};

export const deleteDealPipeline = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM pipeline.DealPipeline WHERE DealPipelineId = @id');

    if (result.rowsAffected[0] === 0) {
      res.status(404).json({ success: false, error: { message: 'Deal Pipeline record not found' } });
      return;
    }

    res.json({ success: true, message: 'Deal Pipeline record deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// DEAL PIPELINE ATTACHMENTS (file uploads per deal)
// ============================================================

export const listDealPipelineAttachments = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id;
    const dealPipelineId = parseInt(id, 10);
    if (isNaN(dealPipelineId)) {
      res.status(400).json({ success: false, error: { message: 'Invalid deal pipeline id' } });
      return;
    }
    const pool = await getConnection();
    const exists = await pool.request()
      .input('id', sql.Int, dealPipelineId)
      .query('SELECT 1 FROM pipeline.DealPipeline WHERE DealPipelineId = @id');
    if (exists.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Deal Pipeline record not found' } });
      return;
    }
    const result = await pool.request()
      .input('dealPipelineId', sql.Int, dealPipelineId)
      .query(`
        SELECT DealPipelineAttachmentId, DealPipelineId, FileName, ContentType, FileSizeBytes, CreatedAt
        FROM pipeline.DealPipelineAttachment
        WHERE DealPipelineId = @dealPipelineId
        ORDER BY CreatedAt DESC
      `);
    res.json({ success: true, data: normalizeStateInPayload(result.recordset) });
  } catch (error) {
    next(error);
  }
};

export const uploadDealPipelineAttachment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id;
    const dealPipelineId = parseInt(id, 10);
    if (isNaN(dealPipelineId)) {
      res.status(400).json({ success: false, error: { message: 'Invalid deal pipeline id' } });
      return;
    }
    const file = (req as Request & {
      file?: { path?: string; buffer?: Buffer; originalname?: string; mimetype?: string; size?: number };
    }).file;
    if (!file || (!file.path && !file.buffer)) {
      res.status(400).json({ success: false, error: { message: 'No file uploaded; use multipart field "file"' } });
      return;
    }
    const pool = await getConnection();
    const exists = await pool.request()
      .input('id', sql.Int, dealPipelineId)
      .query('SELECT 1 FROM pipeline.DealPipeline WHERE DealPipelineId = @id');
    if (exists.recordset.length === 0) {
      try { if (file.path) fs.unlinkSync(file.path); } catch (_) {}
      res.status(404).json({ success: false, error: { message: 'Deal Pipeline record not found' } });
      return;
    }
    let storagePath: string;
    const fileName = file.originalname || (file.path ? path.basename(file.path) : 'file');
    const contentType = file.mimetype || null;
    const fileSize = file.size ?? (file.buffer ? file.buffer.length : null);
    if (isBlobStorageConfigured() && file.buffer) {
      storagePath = buildStoragePath(dealPipelineId, fileName);
      await uploadBufferToBlob(storagePath, file.buffer, contentType || undefined);
      const verified = await blobExists(storagePath);
      if (!verified) {
        throw new Error('Upload to Azure succeeded but blob was not found; not saving attachment record.');
      }
    } else if (file.path) {
      storagePath = getRelativeStoragePath(file.path);
    } else {
      res.status(500).json({ success: false, error: { message: 'Azure Blob configured but file buffer missing' } });
      return;
    }
    const result = await pool.request()
      .input('DealPipelineId', sql.Int, dealPipelineId)
      .input('FileName', sql.NVarChar(255), fileName)
      .input('StoragePath', sql.NVarChar(1000), storagePath)
      .input('ContentType', sql.NVarChar(100), contentType)
      .input('FileSizeBytes', sql.BigInt, fileSize)
      .query(`
        INSERT INTO pipeline.DealPipelineAttachment (DealPipelineId, FileName, StoragePath, ContentType, FileSizeBytes)
        OUTPUT INSERTED.DealPipelineAttachmentId, INSERTED.DealPipelineId, INSERTED.FileName, INSERTED.ContentType, INSERTED.FileSizeBytes, INSERTED.CreatedAt
        VALUES (@DealPipelineId, @FileName, @StoragePath, @ContentType, @FileSizeBytes)
      `);
    res.status(201).json({ success: true, data: normalizeStateInPayload(result.recordset[0]) });
  } catch (error) {
    next(error);
  }
};

export const downloadDealPipelineAttachment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const attachmentId = req.params.attachmentId;
    const id = parseInt(attachmentId, 10);
    if (isNaN(id)) {
      res.status(400).json({ success: false, error: { message: 'Invalid attachment id' } });
      return;
    }
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT FileName, StoragePath, ContentType FROM pipeline.DealPipelineAttachment WHERE DealPipelineAttachmentId = @id');
    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Attachment not found' } });
      return;
    }
    const row = result.recordset[0];
    if (isBlobStorageConfigured()) {
      const buffer = await downloadBlobToBuffer(row.StoragePath);
      if (buffer && buffer.length > 0) {
        res.setHeader('Content-Type', row.ContentType || 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(row.FileName)}"`);
        res.send(buffer);
        return;
      }
    }
    const fullPath = getFullPath(row.StoragePath);
    if (!fs.existsSync(fullPath)) {
      res.status(404).json({
        success: false,
        error: {
          message: 'File not found on server',
          detail: isBlobStorageConfigured()
            ? 'Attachment record exists but the file was not found in Azure Blob Storage. Re-run the attach script with AZURE_STORAGE_* set to repopulate blobs.'
            : 'Attachment record exists but the file is missing at the expected path. Set AZURE_STORAGE_CONNECTION_STRING and AZURE_STORAGE_CONTAINER to use Azure Blob, or ensure uploads are in api/uploads.',
          path: fullPath,
        },
      });
      return;
    }
    const contentType = row.ContentType || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(row.FileName)}"`);
    res.sendFile(path.resolve(fullPath));
  } catch (error) {
    next(error);
  }
};

export const updateDealPipelineAttachment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const attachmentId = req.params.attachmentId;
    const id = parseInt(attachmentId, 10);
    if (isNaN(id)) {
      res.status(400).json({ success: false, error: { message: 'Invalid attachment id' } });
      return;
    }
    const { FileName, ContentType } = req.body as { FileName?: string; ContentType?: string };
    if (FileName === undefined && ContentType === undefined) {
      res.status(400).json({ success: false, error: { message: 'Provide at least one of FileName or ContentType to update' } });
      return;
    }
    const pool = await getConnection();
    const check = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT DealPipelineAttachmentId FROM pipeline.DealPipelineAttachment WHERE DealPipelineAttachmentId = @id');
    if (check.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Attachment not found' } });
      return;
    }
    const updates: string[] = [];
    const request = pool.request().input('id', sql.Int, id);
    if (FileName !== undefined) {
      updates.push('FileName = @FileName');
      request.input('FileName', sql.NVarChar(255), FileName);
    }
    if (ContentType !== undefined) {
      updates.push('ContentType = @ContentType');
      request.input('ContentType', sql.NVarChar(100), ContentType);
    }
    await request.query(`
      UPDATE pipeline.DealPipelineAttachment
      SET ${updates.join(', ')}
      WHERE DealPipelineAttachmentId = @id
    `);
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT DealPipelineAttachmentId, DealPipelineId, FileName, ContentType, FileSizeBytes, CreatedAt
        FROM pipeline.DealPipelineAttachment
        WHERE DealPipelineAttachmentId = @id
      `);
    res.json({ success: true, data: normalizeStateInPayload(result.recordset[0]) });
  } catch (error) {
    next(error);
  }
};

export const deleteDealPipelineAttachment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const attachmentId = req.params.attachmentId;
    const id = parseInt(attachmentId, 10);
    if (isNaN(id)) {
      res.status(400).json({ success: false, error: { message: 'Invalid attachment id' } });
      return;
    }
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT StoragePath FROM pipeline.DealPipelineAttachment WHERE DealPipelineAttachmentId = @id');
    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Attachment not found' } });
      return;
    }
    const storagePath = result.recordset[0].StoragePath;
    await pool.request().input('id', sql.Int, id).query('DELETE FROM pipeline.DealPipelineAttachment WHERE DealPipelineAttachmentId = @id');
    if (isBlobStorageConfigured()) {
      await deleteBlobFile(storagePath);
    }
    try {
      const fullPath = getFullPath(storagePath);
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    } catch (_) {}
    res.json({ success: true, message: 'Attachment deleted' });
  } catch (error) {
    next(error);
  }
};