import { Request, Response, NextFunction } from 'express';
import sql from 'mssql';
import fs from 'fs';
import path from 'path';
import { getConnection } from '../config/database';
import { normalizeState, normalizeStateInPayload } from '../utils/stateAbbrev';
import { getFullPath, getRelativeStoragePath, buildBankingFileStoragePath } from '../middleware/uploadMiddleware';
import {
  isBlobStorageConfigured,
  uploadBufferToBlob,
  downloadBlobToBuffer,
  blobExists,
  deleteBlob as deleteBlobFile,
} from '../config/azureBlob';

// ============================================================
// LOAN CONTROLLER
// ============================================================

export const getAllLoans = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const pool = await getConnection();
    const result = await pool.request().query(`
      SELECT 
        l.*, 
        p.ProjectName, 
        b.BankName AS LenderName,
        COALESCE(b.HQState, b.State) AS LenderState,
        CASE 
          WHEN l.IOMaturityDate IS NOT NULL AND l.LoanClosingDate IS NOT NULL 
          THEN DATEDIFF(MONTH, l.LoanClosingDate, l.IOMaturityDate)
          WHEN l.MaturityDate IS NOT NULL AND l.LoanClosingDate IS NOT NULL 
          THEN DATEDIFF(MONTH, l.LoanClosingDate, l.MaturityDate)
          ELSE NULL
        END AS ConstructionIOTermMonths
      FROM banking.Loan l
      LEFT JOIN core.Project p ON l.ProjectId = p.ProjectId
      LEFT JOIN core.Bank b ON l.LenderId = b.BankId
      ORDER BY l.LoanId
    `);
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    next(error);
  }
};

export const getLoanById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT 
          l.*,
          b.BankName AS LenderName,
          COALESCE(b.HQState, b.State) AS LenderState,
          CASE 
            WHEN l.IOMaturityDate IS NOT NULL AND l.LoanClosingDate IS NOT NULL 
            THEN DATEDIFF(MONTH, l.LoanClosingDate, l.IOMaturityDate)
            WHEN l.MaturityDate IS NOT NULL AND l.LoanClosingDate IS NOT NULL 
            THEN DATEDIFF(MONTH, l.LoanClosingDate, l.MaturityDate)
            ELSE NULL
          END AS ConstructionIOTermMonths
        FROM banking.Loan l
        LEFT JOIN core.Bank b ON l.LenderId = b.BankId
        WHERE l.LoanId = @id
      `);
    
    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Loan not found' } });
      return;
    }
    
    res.json({ success: true, data: result.recordset[0] });
  } catch (error) {
    next(error);
  }
};

export const getLoansByProject = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { projectId } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('projectId', sql.Int, projectId)
      .query(`
        SELECT 
          l.*,
          b.BankName AS LenderName,
          COALESCE(b.HQState, b.State) AS LenderState,
          CASE 
            WHEN l.IOMaturityDate IS NOT NULL AND l.LoanClosingDate IS NOT NULL 
            THEN DATEDIFF(MONTH, l.LoanClosingDate, l.IOMaturityDate)
            WHEN l.MaturityDate IS NOT NULL AND l.LoanClosingDate IS NOT NULL 
            THEN DATEDIFF(MONTH, l.LoanClosingDate, l.MaturityDate)
            ELSE NULL
          END AS ConstructionIOTermMonths
        FROM banking.Loan l
        LEFT JOIN core.Bank b ON l.LenderId = b.BankId
        WHERE l.ProjectId = @projectId 
        ORDER BY l.LoanId
      `);
    
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    next(error);
  }
};

export const createLoan = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      ProjectId, BirthOrder, LoanType, Borrower, LoanPhase, FinancingStage, LenderId,
      LoanAmount, LoanClosingDate, MaturityDate, FixedOrFloating, IndexName,
      Spread, InterestRate, MiniPermMaturity, MiniPermInterestRate,
      PermPhaseMaturity, PermPhaseInterestRate, ConstructionCompletionDate,
      ConstructionCompletionSource, LeaseUpCompletedDate, IOMaturityDate, PermanentCloseDate,
      PermanentLoanAmount, Notes
    } = req.body;

    if (!ProjectId || !LoanPhase) {
      res.status(400).json({ success: false, error: { message: 'ProjectId and LoanPhase are required' } });
      return;
    }

    // Validate FixedOrFloating: must be NULL, 'Fixed', or 'Floating'
    if (FixedOrFloating && FixedOrFloating !== 'Fixed' && FixedOrFloating !== 'Floating') {
      res.status(400).json({ 
        success: false, 
        error: { message: 'FixedOrFloating must be NULL, "Fixed", or "Floating"' } 
      });
      return;
    }

    // Validate IndexName for Construction loans: must be NULL, 'Prime', or 'SOFR'
    if (LoanPhase === 'Construction' && IndexName && IndexName !== 'Prime' && IndexName !== 'SOFR') {
      res.status(400).json({ 
        success: false, 
        error: { message: 'For Construction loans, IndexName must be NULL, "Prime", or "SOFR"' } 
      });
      return;
    }

    const pool = await getConnection();
    const request = pool.request()
      .input('ProjectId', sql.Int, ProjectId)
      .input('BirthOrder', sql.Int, BirthOrder)
      .input('LoanType', sql.NVarChar, LoanType)
      .input('Borrower', sql.NVarChar, Borrower)
      .input('LoanPhase', sql.NVarChar, LoanPhase)
      .input('FinancingStage', sql.NVarChar, FinancingStage)
      .input('LenderId', sql.Int, LenderId)
      .input('LoanAmount', sql.Decimal(18, 2), LoanAmount)
      .input('LoanClosingDate', sql.Date, LoanClosingDate)
      .input('MaturityDate', sql.Date, MaturityDate)
      .input('FixedOrFloating', sql.NVarChar, FixedOrFloating)
      .input('IndexName', sql.NVarChar, IndexName)
      .input('Spread', sql.NVarChar, Spread)
      .input('InterestRate', sql.NVarChar, InterestRate)
      .input('MiniPermMaturity', sql.Date, MiniPermMaturity)
      .input('MiniPermInterestRate', sql.NVarChar, MiniPermInterestRate)
      .input('PermPhaseMaturity', sql.Date, PermPhaseMaturity)
      .input('PermPhaseInterestRate', sql.NVarChar, PermPhaseInterestRate)
      .input('ConstructionCompletionDate', sql.NVarChar, ConstructionCompletionDate)
      .input('ConstructionCompletionSource', sql.NVarChar, ConstructionCompletionSource)
      .input('LeaseUpCompletedDate', sql.NVarChar, LeaseUpCompletedDate)
      .input('IOMaturityDate', sql.Date, IOMaturityDate)
      .input('PermanentCloseDate', sql.Date, PermanentCloseDate)
      .input('PermanentLoanAmount', sql.Decimal(18, 2), PermanentLoanAmount)
      .input('Notes', sql.NVarChar(sql.MAX), Notes);

    // Insert without OUTPUT clause (triggers prevent OUTPUT INSERTED.*)
    await request.query(`
      INSERT INTO banking.Loan (
        ProjectId, BirthOrder, LoanType, Borrower, LoanPhase, FinancingStage, LenderId,
        LoanAmount, LoanClosingDate, MaturityDate, FixedOrFloating, IndexName,
        Spread, InterestRate, MiniPermMaturity, MiniPermInterestRate,
        PermPhaseMaturity, PermPhaseInterestRate, ConstructionCompletionDate,
        ConstructionCompletionSource, LeaseUpCompletedDate, IOMaturityDate, PermanentCloseDate,
        PermanentLoanAmount, Notes
      )
      VALUES (
        @ProjectId, @BirthOrder, @LoanType, @Borrower, @LoanPhase, @FinancingStage, @LenderId,
        @LoanAmount, @LoanClosingDate, @MaturityDate, @FixedOrFloating, @IndexName,
        @Spread, @InterestRate, @MiniPermMaturity, @MiniPermInterestRate,
        @PermPhaseMaturity, @PermPhaseInterestRate, @ConstructionCompletionDate,
        @ConstructionCompletionSource, @LeaseUpCompletedDate, @IOMaturityDate, @PermanentCloseDate,
        @PermanentLoanAmount, @Notes
      )
    `);

    // Get the inserted LoanId using SCOPE_IDENTITY()
    const result = await pool.request().query(`
      SELECT 
        l.*,
        CASE 
          WHEN l.IOMaturityDate IS NOT NULL AND l.LoanClosingDate IS NOT NULL 
          THEN DATEDIFF(MONTH, l.LoanClosingDate, l.IOMaturityDate)
          WHEN l.MaturityDate IS NOT NULL AND l.LoanClosingDate IS NOT NULL 
          THEN DATEDIFF(MONTH, l.LoanClosingDate, l.MaturityDate)
          ELSE NULL
        END AS ConstructionIOTermMonths
      FROM banking.Loan l
      WHERE l.LoanId = SCOPE_IDENTITY()
    `);

    if (result.recordset.length === 0) {
      res.status(500).json({ success: false, error: { message: 'Failed to retrieve created loan' } });
      return;
    }

    const loanId = result.recordset[0].LoanId;
    
    // Auto-create maturity covenants for all maturity dates
    await syncAllMaturityCovenants(
      pool,
      ProjectId,
      loanId,
      LoanPhase,
      IOMaturityDate,
      MaturityDate,
      MiniPermMaturity,
      PermPhaseMaturity
    );

    res.status(201).json({ success: true, data: result.recordset[0] });
  } catch (error: any) {
    if (error.number === 547) {
      res.status(400).json({ success: false, error: { message: 'Invalid ProjectId or LenderId' } });
      return;
    }
    next(error);
  }
};

export const updateLoan = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const loanData = req.body;

    const pool = await getConnection();

    // Validate FixedOrFloating: must be NULL, 'Fixed', or 'Floating'
    if (loanData.FixedOrFloating !== undefined && 
        loanData.FixedOrFloating !== null &&
        loanData.FixedOrFloating !== 'Fixed' && 
        loanData.FixedOrFloating !== 'Floating') {
      res.status(400).json({ 
        success: false, 
        error: { message: 'FixedOrFloating must be NULL, "Fixed", or "Floating"' } 
      });
      return;
    }

    // Validate IndexName for Construction loans: must be NULL, 'Prime', or 'SOFR'
    if (loanData.IndexName !== undefined) {
      // Get current loan phase if not provided in update
      let loanPhase = loanData.LoanPhase;
      if (!loanPhase) {
        const currentLoan = await pool.request()
          .input('id', sql.Int, id)
          .query('SELECT LoanPhase FROM banking.Loan WHERE LoanId = @id');
        
        if (currentLoan.recordset.length === 0) {
          res.status(404).json({ success: false, error: { message: 'Loan not found' } });
          return;
        }
        loanPhase = currentLoan.recordset[0].LoanPhase;
      }

      // Validate IndexName for Construction loans
      if (loanPhase === 'Construction' && loanData.IndexName && 
          loanData.IndexName !== 'Prime' && loanData.IndexName !== 'SOFR') {
        res.status(400).json({ 
          success: false, 
          error: { message: 'For Construction loans, IndexName must be NULL, "Prime", or "SOFR"' } 
        });
        return;
      }
    }

    const request = pool.request().input('id', sql.Int, id);

    // Build dynamic update query
    const fields: string[] = [];
    Object.keys(loanData).forEach((key) => {
      if (key !== 'LoanId' && loanData[key] !== undefined) {
        fields.push(`${key} = @${key}`);
        if (typeof loanData[key] === 'number' && key.includes('Amount')) {
          request.input(key, sql.Decimal(18, 2), loanData[key]);
        } else if (key.includes('Date') && !key.includes('Completion') && !key.includes('Completed')) {
          request.input(key, sql.Date, loanData[key]);
        } else if (key === 'Notes') {
          request.input(key, sql.NVarChar(sql.MAX), loanData[key]);
        } else {
          request.input(key, sql.NVarChar, loanData[key]);
        }
      }
    });

    if (fields.length === 0) {
      res.status(400).json({ success: false, error: { message: 'No fields to update' } });
      return;
    }

    await request.query(`
      UPDATE banking.Loan
      SET ${fields.join(', ')}
      WHERE LoanId = @id
    `);

    // Get updated loan to sync maturity covenants
    const loanCheck = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT ProjectId, LoanPhase, IOMaturityDate, MaturityDate, MiniPermMaturity, PermPhaseMaturity FROM banking.Loan WHERE LoanId = @id');
    
    if (loanCheck.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Loan not found' } });
      return;
    }

    const loanRecord = loanCheck.recordset[0];
    
    // Auto-create/update all maturity covenants
    await syncAllMaturityCovenants(
      pool,
      loanRecord.ProjectId,
      parseInt(id),
      loanRecord.LoanPhase,
      loanRecord.IOMaturityDate,
      loanRecord.MaturityDate,
      loanRecord.MiniPermMaturity,
      loanRecord.PermPhaseMaturity
    );

    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT 
          l.*,
          CASE 
            WHEN l.IOMaturityDate IS NOT NULL AND l.LoanClosingDate IS NOT NULL 
            THEN DATEDIFF(MONTH, l.LoanClosingDate, l.IOMaturityDate)
            WHEN l.MaturityDate IS NOT NULL AND l.LoanClosingDate IS NOT NULL 
            THEN DATEDIFF(MONTH, l.LoanClosingDate, l.MaturityDate)
            ELSE NULL
          END AS ConstructionIOTermMonths
        FROM banking.Loan l
        WHERE l.LoanId = @id
      `);

    res.json({ success: true, data: result.recordset[0] });
  } catch (error: any) {
    if (error.number === 547) {
      res.status(400).json({ success: false, error: { message: 'Invalid foreign key reference' } });
      return;
    }
    next(error);
  }
};

/**
 * Update loan by ProjectId - convenience function for Domo
 * Updates the loan for a project based on LoanPhase (Construction or Permanent)
 * If LoanPhase is not provided, defaults to Construction for backward compatibility
 */
export const updateLoanByProject = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { projectId } = req.params;
    const loanData = req.body;

    const pool = await getConnection();
    
    // Determine which loan phase to update
    // If LoanPhase is provided in the update data, use it to find the specific loan
    // Otherwise, default to Construction for backward compatibility
    const targetLoanPhase = loanData.LoanPhase || 'Construction';
    
    // Find the loan for this project with the specified LoanPhase
    const findLoan = await pool.request()
      .input('projectId', sql.Int, projectId)
      .input('loanPhase', sql.NVarChar, targetLoanPhase)
      .query(`
        SELECT TOP 1 LoanId, LoanPhase
        FROM banking.Loan 
        WHERE ProjectId = @projectId 
          AND LoanPhase = @loanPhase
        ORDER BY LoanId
      `);

    if (findLoan.recordset.length === 0) {
      res.status(404).json({ 
        success: false, 
        error: { 
          message: `No ${targetLoanPhase} loan found for this project. Please create the loan first or specify a different LoanPhase.` 
        } 
      });
      return;
    }

    const loanId = findLoan.recordset[0].LoanId;
    const currentLoanPhase = findLoan.recordset[0].LoanPhase;
    
    // Ensure we don't accidentally change LoanPhase unless explicitly requested
    // If LoanPhase is being updated, validate it
    if (loanData.LoanPhase && loanData.LoanPhase !== currentLoanPhase) {
      res.status(400).json({ 
        success: false, 
        error: { 
          message: `Cannot change LoanPhase from '${currentLoanPhase}' to '${loanData.LoanPhase}' using updateLoanByProject. Use updateLoan with LoanId instead, or create a new loan.` 
        } 
      });
      return;
    }
    
    // Now update using the same logic as updateLoan
    // Remove LoanPhase from update data if it matches current (to avoid unnecessary update)
    const updateData = { ...loanData };
    if (updateData.LoanPhase === currentLoanPhase) {
      delete updateData.LoanPhase;
    }
    
    const request = pool.request().input('id', sql.Int, loanId);

    // Validate FixedOrFloating if provided
    if (updateData.FixedOrFloating !== undefined && 
        updateData.FixedOrFloating !== null &&
        updateData.FixedOrFloating !== 'Fixed' && 
        updateData.FixedOrFloating !== 'Floating') {
      res.status(400).json({ 
        success: false, 
        error: { message: 'FixedOrFloating must be NULL, "Fixed", or "Floating"' } 
      });
      return;
    }

    // Validate IndexName for Construction loans
    if (updateData.IndexName !== undefined && currentLoanPhase === 'Construction' && 
        updateData.IndexName !== null && 
        updateData.IndexName !== 'Prime' && updateData.IndexName !== 'SOFR') {
      res.status(400).json({ 
        success: false, 
        error: { message: 'For Construction loans, IndexName must be NULL, "Prime", or "SOFR"' } 
      });
      return;
    }

    const fields: string[] = [];
    Object.keys(updateData).forEach((key) => {
      if (key !== 'LoanId' && updateData[key] !== undefined) {
        fields.push(`${key} = @${key}`);
        if (typeof updateData[key] === 'number' && key.includes('Amount')) {
          request.input(key, sql.Decimal(18, 2), updateData[key]);
        } else if (key.includes('Date') && !key.includes('Completion') && !key.includes('Completed')) {
          request.input(key, sql.Date, updateData[key]);
        } else if (key === 'Notes') {
          request.input(key, sql.NVarChar(sql.MAX), updateData[key]);
        } else {
          request.input(key, sql.NVarChar, updateData[key]);
        }
      }
    });

    if (fields.length === 0) {
      res.status(400).json({ success: false, error: { message: 'No fields to update' } });
      return;
    }

    await request.query(`
      UPDATE banking.Loan
      SET ${fields.join(', ')}
      WHERE LoanId = @id
    `);

    // Get updated loan to check IOMaturityDate and LoanPhase
    const loanCheck = await pool.request()
      .input('id', sql.Int, loanId)
      .query('SELECT ProjectId, LoanPhase, IOMaturityDate FROM banking.Loan WHERE LoanId = @id');
    
    if (loanCheck.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Loan not found after update' } });
      return;
    }

    const loanRecord = loanCheck.recordset[0];
    const loanProjectId = loanRecord.ProjectId;
    const loanPhase = loanRecord.LoanPhase;
    
    // Get all maturity dates
    const maturityCheck = await pool.request()
      .input('id', sql.Int, loanId)
      .query('SELECT IOMaturityDate, MaturityDate, MiniPermMaturity, PermPhaseMaturity FROM banking.Loan WHERE LoanId = @id');
    
    if (maturityCheck.recordset.length > 0) {
      const maturityDates = maturityCheck.recordset[0];
      
      // Auto-create/update all maturity covenants
      await syncAllMaturityCovenants(
        pool,
        loanProjectId,
        loanId,
        loanPhase,
        maturityDates.IOMaturityDate,
        maturityDates.MaturityDate,
        maturityDates.MiniPermMaturity,
        maturityDates.PermPhaseMaturity
      );
    }

    // Return updated loan with calculated fields
    const result = await pool.request()
      .input('id', sql.Int, loanId)
      .query(`
        SELECT 
          l.*,
          CASE 
            WHEN l.IOMaturityDate IS NOT NULL AND l.LoanClosingDate IS NOT NULL 
            THEN DATEDIFF(MONTH, l.LoanClosingDate, l.IOMaturityDate)
            WHEN l.MaturityDate IS NOT NULL AND l.LoanClosingDate IS NOT NULL 
            THEN DATEDIFF(MONTH, l.LoanClosingDate, l.MaturityDate)
            ELSE NULL
          END AS ConstructionIOTermMonths
        FROM banking.Loan l
        WHERE l.LoanId = @id
      `);

    res.json({ success: true, data: result.recordset[0] });
  } catch (error: any) {
    next(error);
  }
};

export const deleteLoan = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM banking.Loan WHERE LoanId = @id');

    if (result.rowsAffected[0] === 0) {
      res.status(404).json({ success: false, error: { message: 'Loan not found' } });
      return;
    }

    res.json({ success: true, message: 'Loan deleted successfully' });
  } catch (error: any) {
    if (error.number === 547) {
      res.status(409).json({ success: false, error: { message: 'Cannot delete loan with associated records' } });
      return;
    }
    next(error);
  }
};

// ============================================================
// LOAN MODIFICATION CONTROLLER (Permanent debt, extensions, restructures)
// ============================================================

export const getAllLoanModifications = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const pool = await getConnection();
    const result = await pool.request().query(`
      SELECT m.*, p.ProjectName
      FROM banking.LoanModification m
      LEFT JOIN core.Project p ON m.ProjectId = p.ProjectId
      ORDER BY m.ProjectId, m.EffectiveDate DESC, m.LoanModificationId
    `);
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    next(error);
  }
};

export const getLoanModificationById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT m.*, p.ProjectName
        FROM banking.LoanModification m
        LEFT JOIN core.Project p ON m.ProjectId = p.ProjectId
        WHERE m.LoanModificationId = @id
      `);
    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Loan modification not found' } });
      return;
    }
    res.json({ success: true, data: result.recordset[0] });
  } catch (error) {
    next(error);
  }
};

export const getLoanModificationsByProject = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { projectId } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('projectId', sql.Int, projectId)
      .query(`
        SELECT m.*, p.ProjectName
        FROM banking.LoanModification m
        LEFT JOIN core.Project p ON m.ProjectId = p.ProjectId
        WHERE m.ProjectId = @projectId
        ORDER BY m.EffectiveDate DESC, m.LoanModificationId
      `);
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    next(error);
  }
};

export const createLoanModification = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { ProjectId, LoanId, Type, Description, EffectiveDate, Notes } = req.body;
    if (!ProjectId || !Type) {
      res.status(400).json({ success: false, error: { message: 'ProjectId and Type are required' } });
      return;
    }
    const pool = await getConnection();
    await pool.request()
      .input('ProjectId', sql.Int, ProjectId)
      .input('LoanId', sql.Int, LoanId)
      .input('Type', sql.NVarChar, Type)
      .input('Description', sql.NVarChar, Description)
      .input('EffectiveDate', sql.Date, EffectiveDate)
      .input('Notes', sql.NVarChar(sql.MAX), Notes)
      .query(`
        INSERT INTO banking.LoanModification (ProjectId, LoanId, Type, Description, EffectiveDate, Notes)
        VALUES (@ProjectId, @LoanId, @Type, @Description, @EffectiveDate, @Notes)
      `);
    const result = await pool.request()
      .input('projectId', sql.Int, ProjectId)
      .query(`
        SELECT TOP 1 m.*, p.ProjectName
        FROM banking.LoanModification m
        LEFT JOIN core.Project p ON m.ProjectId = p.ProjectId
        WHERE m.ProjectId = @projectId
        ORDER BY m.LoanModificationId DESC
      `);
    res.status(201).json({ success: true, data: result.recordset[0] });
  } catch (error: any) {
    if (error.number === 547) {
      res.status(400).json({ success: false, error: { message: 'Invalid ProjectId or LoanId' } });
      return;
    }
    next(error);
  }
};

export const updateLoanModification = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    const pool = await getConnection();
    const request = pool.request().input('id', sql.Int, id);
    const fields: string[] = [];
    Object.keys(updateData).forEach((key) => {
      if (key !== 'LoanModificationId' && updateData[key] !== undefined) {
        fields.push(`${key} = @${key}`);
        if (key === 'ProjectId' || key === 'LoanId') {
          request.input(key, sql.Int, updateData[key]);
        } else if (key === 'EffectiveDate') {
          request.input(key, sql.Date, updateData[key]);
        } else if (key === 'Notes') {
          request.input(key, sql.NVarChar(sql.MAX), updateData[key]);
        } else {
          request.input(key, sql.NVarChar, updateData[key]);
        }
      }
    });
    if (fields.length === 0) {
      res.status(400).json({ success: false, error: { message: 'No fields to update' } });
      return;
    }
    await request.query(`
      UPDATE banking.LoanModification SET ${fields.join(', ')} WHERE LoanModificationId = @id
    `);
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT m.*, p.ProjectName
        FROM banking.LoanModification m
        LEFT JOIN core.Project p ON m.ProjectId = p.ProjectId
        WHERE m.LoanModificationId = @id
      `);
    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Loan modification not found' } });
      return;
    }
    res.json({ success: true, data: result.recordset[0] });
  } catch (error: any) {
    if (error.number === 547) {
      res.status(400).json({ success: false, error: { message: 'Invalid ProjectId or LoanId' } });
      return;
    }
    next(error);
  }
};

export const deleteLoanModification = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM banking.LoanModification WHERE LoanModificationId = @id');
    if (result.rowsAffected[0] === 0) {
      res.status(404).json({ success: false, error: { message: 'Loan modification not found' } });
      return;
    }
    res.json({ success: true, message: 'Loan modification deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// DSCR TEST CONTROLLER
// ============================================================

export const getAllDSCRTests = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const pool = await getConnection();
    const result = await pool.request().query('SELECT * FROM banking.DSCRTest ORDER BY ProjectId, TestNumber');
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    next(error);
  }
};

export const getDSCRTestById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM banking.DSCRTest WHERE DSCRTestId = @id');
    
    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'DSCR Test not found' } });
      return;
    }
    
    res.json({ success: true, data: result.recordset[0] });
  } catch (error) {
    next(error);
  }
};

export const getDSCRTestsByProject = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { projectId } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('projectId', sql.Int, projectId)
      .query('SELECT * FROM banking.DSCRTest WHERE ProjectId = @projectId ORDER BY TestNumber');
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    next(error);
  }
};

export const createDSCRTest = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { ProjectId, LoanId, FinancingType, TestNumber, TestDate, ProjectedInterestRate, Requirement, ProjectedValue, IsCompleted } = req.body;

    if (!ProjectId || !TestNumber) {
      res.status(400).json({ success: false, error: { message: 'ProjectId and TestNumber are required' } });
      return;
    }

    // Validate FinancingType
    if (FinancingType && FinancingType !== 'Construction' && FinancingType !== 'Permanent') {
      res.status(400).json({ success: false, error: { message: 'FinancingType must be "Construction" or "Permanent"' } });
      return;
    }

    // Default to Construction if not provided
    const finalFinancingType = FinancingType || 'Construction';

    const pool = await getConnection();
    const request = pool.request()
      .input('ProjectId', sql.Int, ProjectId)
      .input('LoanId', sql.Int, LoanId)
      .input('FinancingType', sql.NVarChar, finalFinancingType)
      .input('TestNumber', sql.Int, TestNumber)
      .input('TestDate', sql.Date, TestDate)
      .input('ProjectedInterestRate', sql.NVarChar, ProjectedInterestRate)
      .input('Requirement', sql.Decimal(10, 2), Requirement)
      .input('ProjectedValue', sql.NVarChar, ProjectedValue)
      .input('IsCompleted', sql.Bit, IsCompleted !== undefined ? IsCompleted : false);

    // Insert without OUTPUT clause (triggers prevent OUTPUT INSERTED.*)
    await request.query(`
      INSERT INTO banking.DSCRTest (ProjectId, LoanId, FinancingType, TestNumber, TestDate, ProjectedInterestRate, Requirement, ProjectedValue, IsCompleted)
      VALUES (@ProjectId, @LoanId, @FinancingType, @TestNumber, @TestDate, @ProjectedInterestRate, @Requirement, @ProjectedValue, @IsCompleted)
    `);

    // Get the inserted record
    const result = await pool.request()
      .input('projectId', sql.Int, ProjectId)
      .input('testNumber', sql.Int, TestNumber)
      .input('financingType', sql.NVarChar, finalFinancingType)
      .query(`
        SELECT TOP 1 * FROM banking.DSCRTest 
        WHERE ProjectId = @projectId AND TestNumber = @testNumber AND FinancingType = @financingType
        ORDER BY DSCRTestId DESC
      `);

    res.status(201).json({ success: true, data: result.recordset[0] });
  } catch (error: any) {
    if (error.number === 2627) {
      res.status(409).json({ success: false, error: { message: 'DSCR Test with this ProjectId and TestNumber already exists' } });
      return;
    }
    if (error.number === 547) {
      res.status(400).json({ success: false, error: { message: 'Invalid ProjectId or LoanId' } });
      return;
    }
    next(error);
  }
};

export const updateDSCRTest = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Validate FinancingType if provided
    if (updateData.FinancingType && updateData.FinancingType !== 'Construction' && updateData.FinancingType !== 'Permanent') {
      res.status(400).json({ success: false, error: { message: 'FinancingType must be "Construction" or "Permanent"' } });
      return;
    }

    const pool = await getConnection();
    const request = pool.request().input('id', sql.Int, id);

    // Build dynamic update query
    const fields: string[] = [];
    Object.keys(updateData).forEach((key) => {
      if (key !== 'DSCRTestId' && updateData[key] !== undefined) {
        fields.push(`${key} = @${key}`);
        if (key === 'ProjectId' || key === 'LoanId' || key === 'TestNumber') {
          request.input(key, sql.Int, updateData[key]);
        } else if (key === 'Requirement') {
          request.input(key, sql.Decimal(10, 2), updateData[key]);
        } else if (key === 'TestDate') {
          request.input(key, sql.Date, updateData[key]);
        } else if (key === 'IsCompleted') {
          request.input(key, sql.Bit, updateData[key]);
        } else {
          request.input(key, sql.NVarChar, updateData[key]);
        }
      }
    });

    if (fields.length === 0) {
      res.status(400).json({ success: false, error: { message: 'No fields to update' } });
      return;
    }

    await request.query(`
      UPDATE banking.DSCRTest
      SET ${fields.join(', ')}
      WHERE DSCRTestId = @id
    `);

    // Get updated record
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM banking.DSCRTest WHERE DSCRTestId = @id');

    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'DSCR Test not found' } });
      return;
    }

    res.json({ success: true, data: result.recordset[0] });
  } catch (error: any) {
    if (error.number === 2627) {
      res.status(409).json({ success: false, error: { message: 'DSCR Test with this ProjectId and TestNumber already exists' } });
      return;
    }
    next(error);
  }
};

export const deleteDSCRTest = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM banking.DSCRTest WHERE DSCRTestId = @id');

    if (result.rowsAffected[0] === 0) {
      res.status(404).json({ success: false, error: { message: 'DSCR Test not found' } });
      return;
    }

    res.json({ success: true, message: 'DSCR Test deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// PARTICIPATION CONTROLLER
// ============================================================

export const getAllParticipations = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const pool = await getConnection();
    const result = await pool.request().query(`
      SELECT 
        p.*, 
        pr.ProjectName, 
        b.BankName,
        COALESCE(b.HQState, b.State) AS BankState,
        CASE WHEN p.PaidOff = 1 THEN 0 ELSE p.ExposureAmount END AS ActiveExposure
      FROM banking.Participation p
      LEFT JOIN core.Project pr ON p.ProjectId = pr.ProjectId
      LEFT JOIN core.Bank b ON p.BankId = b.BankId
      ORDER BY p.ParticipationId
    `);
    
    // Group by project and calculate percentages
    const projectMap: { [key: number]: any[] } = {};
    result.recordset.forEach((row: any) => {
      if (!projectMap[row.ProjectId]) {
        projectMap[row.ProjectId] = [];
      }
      projectMap[row.ProjectId].push(row);
    });
    
    // Calculate total active exposure per project and update percentages
    const enrichedData: any[] = [];
    for (const projectId in projectMap) {
      const participations = projectMap[projectId];
      const totalActiveExposure = participations.reduce((sum, p) => sum + (parseFloat(p.ActiveExposure) || 0), 0);
      
      participations.forEach((p: any) => {
        const activeExposure = parseFloat(p.ActiveExposure) || 0;
        let calculatedPercent: string;
        
        if (p.PaidOff === true || p.PaidOff === 1) {
          calculatedPercent = '0.0%';
        } else if (totalActiveExposure > 0) {
          const percentValue = (activeExposure / totalActiveExposure) * 100;
          calculatedPercent = `${percentValue.toFixed(1)}%`;
        } else {
          calculatedPercent = '0.0%';
        }
        
        enrichedData.push({
          ...p,
          ParticipationPercent: calculatedPercent,
          CalculatedParticipationPercent: calculatedPercent
        });
      });
    }
    
    res.json({ success: true, data: enrichedData });
  } catch (error) {
    next(error);
  }
};

export const getParticipationById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM banking.Participation WHERE ParticipationId = @id');
    
    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Participation not found' } });
      return;
    }
    
    res.json({ success: true, data: result.recordset[0] });
  } catch (error) {
    next(error);
  }
};

export const getParticipationsByProject = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { projectId } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('projectId', sql.Int, projectId)
      .query(`
        SELECT 
          p.*,
          b.BankName,
          COALESCE(b.HQState, b.State) AS BankState,
          CASE WHEN p.PaidOff = 1 THEN 0 ELSE p.ExposureAmount END AS ActiveExposure
        FROM banking.Participation p
        LEFT JOIN core.Bank b ON p.BankId = b.BankId
        WHERE p.ProjectId = @projectId 
        ORDER BY p.ParticipationId
      `);
    
    // Calculate total active exposure for this project
    const totalActiveExposure = result.recordset.reduce((sum, p) => sum + (parseFloat(p.ActiveExposure) || 0), 0);
    
    // Calculate percentages based on active exposure
    const enrichedData = result.recordset.map((p: any) => {
      const activeExposure = parseFloat(p.ActiveExposure) || 0;
      let calculatedPercent: string;
      
      if (p.PaidOff === true || p.PaidOff === 1) {
        calculatedPercent = '0.0%';
      } else if (totalActiveExposure > 0) {
        const percentValue = (activeExposure / totalActiveExposure) * 100;
        calculatedPercent = `${percentValue.toFixed(1)}%`;
      } else {
        calculatedPercent = '0.0%';
      }
      
      return {
        ...p,
        ParticipationPercent: calculatedPercent,
        CalculatedParticipationPercent: calculatedPercent
      };
    });
    
    res.json({ success: true, data: enrichedData });
  } catch (error) {
    next(error);
  }
};

export const createParticipation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { ProjectId, LoanId, BankId, FinancingType, ParticipationPercent, ExposureAmount, PaidOff, Notes } = req.body;

    if (!ProjectId || !BankId) {
      res.status(400).json({ success: false, error: { message: 'ProjectId and BankId are required' } });
      return;
    }

    // Validate FinancingType if provided, otherwise default to 'Construction'
    const finalFinancingType = FinancingType || 'Construction';
    if (finalFinancingType !== 'Construction' && finalFinancingType !== 'Permanent') {
      res.status(400).json({ 
        success: false, 
        error: { message: 'FinancingType must be "Construction" or "Permanent"' } 
      });
      return;
    }

    const pool = await getConnection();
    const result = await pool.request()
      .input('ProjectId', sql.Int, ProjectId)
      .input('LoanId', sql.Int, LoanId)
      .input('BankId', sql.Int, BankId)
      .input('FinancingType', sql.NVarChar, finalFinancingType)
      .input('ParticipationPercent', sql.NVarChar, ParticipationPercent)
      .input('ExposureAmount', sql.Decimal(18, 2), ExposureAmount)
      .input('PaidOff', sql.Bit, PaidOff)
      .input('Notes', sql.NVarChar(sql.MAX), Notes)
      .query(`
        INSERT INTO banking.Participation (ProjectId, LoanId, BankId, FinancingType, ParticipationPercent, ExposureAmount, PaidOff, Notes)
        OUTPUT INSERTED.*
        VALUES (@ProjectId, @LoanId, @BankId, @FinancingType, @ParticipationPercent, @ExposureAmount, @PaidOff, @Notes)
      `);

    res.status(201).json({ success: true, data: result.recordset[0] });
  } catch (error: any) {
    if (error.number === 547) {
      res.status(400).json({ success: false, error: { message: 'Invalid ProjectId, LoanId, or BankId' } });
      return;
    }
    if (error.number === 547 && error.message.includes('CK_Participation_FinancingType')) {
      res.status(400).json({ 
        success: false, 
        error: { message: 'FinancingType must be "Construction" or "Permanent"' } 
      });
      return;
    }
    next(error);
  }
};

/**
 * Create participation by ProjectId - convenience function for Domo
 * Automatically finds the construction loan for the project
 */
export const createParticipationByProject = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { projectId } = req.params;
    const { BankId, FinancingType, ParticipationPercent, ExposureAmount, PaidOff, Notes } = req.body;

    if (!BankId) {
      res.status(400).json({ success: false, error: { message: 'BankId is required' } });
      return;
    }

    // Validate FinancingType if provided
    if (FinancingType && FinancingType !== 'Construction' && FinancingType !== 'Permanent') {
      res.status(400).json({ 
        success: false, 
        error: { message: 'FinancingType must be "Construction" or "Permanent"' } 
      });
      return;
    }

    // Default to 'Construction' if not provided
    const finalFinancingType = FinancingType || 'Construction';

    const pool = await getConnection();
    
    // Find the loan for this project (prefer Construction, but allow Permanent)
    const findLoan = await pool.request()
      .input('projectId', sql.Int, projectId)
      .input('financingType', sql.NVarChar, finalFinancingType)
      .query(`
        SELECT TOP 1 LoanId, LoanPhase
        FROM banking.Loan 
        WHERE ProjectId = @projectId 
          AND (
            (@financingType = 'Construction' AND LoanPhase = 'Construction')
            OR (@financingType = 'Permanent' AND LoanPhase = 'Permanent')
            OR (@financingType IS NULL)
          )
        ORDER BY CASE WHEN LoanPhase = @financingType THEN 0 ELSE 1 END, LoanId
      `);

    if (findLoan.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: `No ${finalFinancingType} loan found for this project` } });
      return;
    }

    const loanId = findLoan.recordset[0].LoanId;
    
    // Create the participation
    const result = await pool.request()
      .input('ProjectId', sql.Int, projectId)
      .input('LoanId', sql.Int, loanId)
      .input('BankId', sql.Int, BankId)
      .input('FinancingType', sql.NVarChar, finalFinancingType)
      .input('ParticipationPercent', sql.NVarChar, ParticipationPercent)
      .input('ExposureAmount', sql.Decimal(18, 2), ExposureAmount)
      .input('PaidOff', sql.Bit, PaidOff || false)
      .input('Notes', sql.NVarChar(sql.MAX), Notes)
      .query(`
        INSERT INTO banking.Participation (ProjectId, LoanId, BankId, FinancingType, ParticipationPercent, ExposureAmount, PaidOff, Notes)
        OUTPUT INSERTED.*
        VALUES (@ProjectId, @LoanId, @BankId, @FinancingType, @ParticipationPercent, @ExposureAmount, @PaidOff, @Notes)
      `);

    res.status(201).json({ success: true, data: result.recordset[0] });
  } catch (error: any) {
    if (error.number === 547) {
      res.status(400).json({ success: false, error: { message: 'Invalid ProjectId or BankId' } });
      return;
    }
    if (error.number === 547 && error.message.includes('CK_Participation_FinancingType')) {
      res.status(400).json({ 
        success: false, 
        error: { message: 'FinancingType must be "Construction" or "Permanent"' } 
      });
      return;
    }
    next(error);
  }
};

export const updateParticipation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const participationData = req.body;

    // Validate FinancingType if provided
    if (participationData.FinancingType && 
        participationData.FinancingType !== 'Construction' && 
        participationData.FinancingType !== 'Permanent') {
      res.status(400).json({ 
        success: false, 
        error: { message: 'FinancingType must be "Construction" or "Permanent"' } 
      });
      return;
    }

    const pool = await getConnection();
    const request = pool.request().input('id', sql.Int, id);

    // Build dynamic update query - only update fields that are provided
    const fields: string[] = [];
    Object.keys(participationData).forEach((key) => {
      if (key !== 'ParticipationId' && participationData[key] !== undefined) {
        fields.push(`${key} = @${key}`);
        if (key === 'ProjectId' || key === 'LoanId' || key === 'BankId') {
          request.input(key, sql.Int, participationData[key]);
        } else if (key === 'ExposureAmount') {
          request.input(key, sql.Decimal(18, 2), participationData[key]);
        } else if (key === 'PaidOff') {
          request.input(key, sql.Bit, participationData[key]);
        } else if (key === 'Notes') {
          request.input(key, sql.NVarChar(sql.MAX), participationData[key]);
        } else {
          request.input(key, sql.NVarChar, participationData[key]);
        }
      }
    });

    if (fields.length === 0) {
      res.status(400).json({ success: false, error: { message: 'No fields to update' } });
      return;
    }

    const result = await request.query(`
      UPDATE banking.Participation
      SET ${fields.join(', ')}, UpdatedAt = SYSDATETIME()
      WHERE ParticipationId = @id;
      SELECT * FROM banking.Participation WHERE ParticipationId = @id;
    `);

    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Participation not found' } });
      return;
    }

    res.json({ success: true, data: result.recordset[0] });
  } catch (error: any) {
    if (error.number === 547) {
      if (error.message && error.message.includes('CK_Participation_FinancingType')) {
        res.status(400).json({ 
          success: false, 
          error: { message: 'FinancingType must be "Construction" or "Permanent"' } 
        });
        return;
      }
      res.status(400).json({ success: false, error: { message: 'Invalid foreign key reference' } });
      return;
    }
    next(error);
  }
};

export const deleteParticipation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM banking.Participation WHERE ParticipationId = @id');

    if (result.rowsAffected[0] === 0) {
      res.status(404).json({ success: false, error: { message: 'Participation not found' } });
      return;
    }

    res.json({ success: true, message: 'Participation deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// GUARANTEE CONTROLLER
// ============================================================

export const getAllGuarantees = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const pool = await getConnection();
    const result = await pool.request().query(`
      SELECT g.*, p.ProjectName, pe.FullName as PersonName
      FROM banking.Guarantee g
      LEFT JOIN core.Project p ON g.ProjectId = p.ProjectId
      LEFT JOIN core.Person pe ON g.PersonId = pe.PersonId
      ORDER BY g.GuaranteeId
    `);
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    next(error);
  }
};

export const getGuaranteeById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM banking.Guarantee WHERE GuaranteeId = @id');
    
    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Guarantee not found' } });
      return;
    }
    
    res.json({ success: true, data: result.recordset[0] });
  } catch (error) {
    next(error);
  }
};

export const getGuaranteesByProject = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { projectId } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('projectId', sql.Int, projectId)
      .query('SELECT * FROM banking.Guarantee WHERE ProjectId = @projectId ORDER BY GuaranteeId');
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    next(error);
  }
};

export const createGuarantee = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { ProjectId, LoanId, FinancingType, PersonId, GuaranteePercent, GuaranteeAmount, Notes } = req.body;

    if (!ProjectId || !PersonId) {
      res.status(400).json({ success: false, error: { message: 'ProjectId and PersonId are required' } });
      return;
    }

    // Validate FinancingType
    if (FinancingType && FinancingType !== 'Construction' && FinancingType !== 'Permanent') {
      res.status(400).json({ success: false, error: { message: 'FinancingType must be "Construction" or "Permanent"' } });
      return;
    }

    // Default to Construction if not provided
    const finalFinancingType = FinancingType || 'Construction';

    const pool = await getConnection();
    const request = pool.request()
      .input('ProjectId', sql.Int, ProjectId)
      .input('LoanId', sql.Int, LoanId)
      .input('FinancingType', sql.NVarChar, finalFinancingType)
      .input('PersonId', sql.Int, PersonId)
      .input('GuaranteePercent', sql.Decimal(10, 4), GuaranteePercent)
      .input('GuaranteeAmount', sql.Decimal(18, 2), GuaranteeAmount)
      .input('Notes', sql.NVarChar(sql.MAX), Notes);

    // Insert without OUTPUT clause (triggers prevent OUTPUT INSERTED.*)
    await request.query(`
      INSERT INTO banking.Guarantee (ProjectId, LoanId, FinancingType, PersonId, GuaranteePercent, GuaranteeAmount, Notes)
      VALUES (@ProjectId, @LoanId, @FinancingType, @PersonId, @GuaranteePercent, @GuaranteeAmount, @Notes)
    `);

    // Get the inserted record
    const result = await pool.request()
      .input('projectId', sql.Int, ProjectId)
      .input('personId', sql.Int, PersonId)
      .input('financingType', sql.NVarChar, finalFinancingType)
      .query(`
        SELECT TOP 1 * FROM banking.Guarantee 
        WHERE ProjectId = @projectId AND PersonId = @personId AND FinancingType = @financingType
        ORDER BY GuaranteeId DESC
      `);

    res.status(201).json({ success: true, data: result.recordset[0] });
  } catch (error: any) {
    if (error.number === 547) {
      res.status(400).json({ success: false, error: { message: 'Invalid ProjectId, LoanId, or PersonId' } });
      return;
    }
    next(error);
  }
};

/**
 * Create guarantee by ProjectId - convenience function for Domo
 * Automatically finds the construction loan for the project
 */
export const createGuaranteeByProject = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { projectId } = req.params;
    const { PersonId, GuaranteePercent, GuaranteeAmount, Notes } = req.body;

    if (!PersonId) {
      res.status(400).json({ success: false, error: { message: 'PersonId is required' } });
      return;
    }

    const pool = await getConnection();
    
    // Find the construction loan for this project
    const findLoan = await pool.request()
      .input('projectId', sql.Int, projectId)
      .query(`
        SELECT TOP 1 LoanId 
        FROM banking.Loan 
        WHERE ProjectId = @projectId 
        ORDER BY CASE WHEN LoanPhase = 'Construction' THEN 0 ELSE 1 END, LoanId
      `);

    if (findLoan.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'No loan found for this project' } });
      return;
    }

    const loanId = findLoan.recordset[0].LoanId;
    
    // Create the guarantee
    const result = await pool.request()
      .input('ProjectId', sql.Int, projectId)
      .input('LoanId', sql.Int, loanId)
      .input('PersonId', sql.Int, PersonId)
      .input('GuaranteePercent', sql.Decimal(10, 4), GuaranteePercent)
      .input('GuaranteeAmount', sql.Decimal(18, 2), GuaranteeAmount)
      .input('Notes', sql.NVarChar(sql.MAX), Notes)
      .query(`
        INSERT INTO banking.Guarantee (ProjectId, LoanId, PersonId, GuaranteePercent, GuaranteeAmount, Notes)
        OUTPUT INSERTED.*
        VALUES (@ProjectId, @LoanId, @PersonId, @GuaranteePercent, @GuaranteeAmount, @Notes)
      `);

    res.status(201).json({ success: true, data: result.recordset[0] });
  } catch (error: any) {
    if (error.number === 547) {
      res.status(400).json({ success: false, error: { message: 'Invalid ProjectId or PersonId' } });
      return;
    }
    next(error);
  }
};

export const updateGuarantee = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const guaranteeData = req.body;

    const pool = await getConnection();
    const request = pool.request().input('id', sql.Int, id);

    // Build dynamic update query - only update fields that are provided
    const fields: string[] = [];
    Object.keys(guaranteeData).forEach((key) => {
      if (key !== 'GuaranteeId' && guaranteeData[key] !== undefined) {
        fields.push(`${key} = @${key}`);
        if (key === 'ProjectId' || key === 'LoanId' || key === 'PersonId') {
          request.input(key, sql.Int, guaranteeData[key]);
        } else if (key === 'GuaranteePercent') {
          request.input(key, sql.Decimal(10, 4), guaranteeData[key]);
        } else if (key === 'GuaranteeAmount') {
          request.input(key, sql.Decimal(18, 2), guaranteeData[key]);
        } else if (key === 'Notes') {
          request.input(key, sql.NVarChar(sql.MAX), guaranteeData[key]);
        } else {
          request.input(key, sql.NVarChar, guaranteeData[key]);
        }
      }
    });

    if (fields.length === 0) {
      res.status(400).json({ success: false, error: { message: 'No fields to update' } });
      return;
    }

    const result = await request.query(`
      UPDATE banking.Guarantee
      SET ${fields.join(', ')}
      WHERE GuaranteeId = @id;
      SELECT * FROM banking.Guarantee WHERE GuaranteeId = @id;
    `);

    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Guarantee not found' } });
      return;
    }

    res.json({ success: true, data: result.recordset[0] });
  } catch (error: any) {
    if (error.number === 547) {
      res.status(400).json({ success: false, error: { message: 'Invalid foreign key reference' } });
      return;
    }
    next(error);
  }
};

export const deleteGuarantee = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM banking.Guarantee WHERE GuaranteeId = @id');

    if (result.rowsAffected[0] === 0) {
      res.status(404).json({ success: false, error: { message: 'Guarantee not found' } });
      return;
    }

    res.json({ success: true, message: 'Guarantee deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// HELPER FUNCTION: Sync Maturity Covenants
// ============================================================

/**
 * Auto-creates or updates maturity covenants based on loan's maturity dates
 * IsCompleted remains manual - users must check it off themselves
 */
async function syncMaturityCovenant(
  pool: sql.ConnectionPool,
  projectId: number,
  loanId: number,
  maturityDate: Date | string | null,
  covenantType: string,
  requirement: string
): Promise<void> {
  try {
    if (!maturityDate) return;
    
    const date = typeof maturityDate === 'string' ? new Date(maturityDate) : maturityDate;

    // Check if maturity covenant already exists
    const existingCovenant = await pool.request()
      .input('projectId', sql.Int, projectId)
      .input('loanId', sql.Int, loanId)
      .input('covenantType', sql.NVarChar, covenantType)
      .query(`
        SELECT CovenantId, IsCompleted
        FROM banking.Covenant
        WHERE ProjectId = @projectId
          AND LoanId = @loanId
          AND CovenantType = @covenantType
      `);

    if (existingCovenant.recordset.length > 0) {
      // Update existing covenant date only (preserve manual IsCompleted and Notes)
      const covenantId = existingCovenant.recordset[0].CovenantId;
      await pool.request()
        .input('covenantId', sql.Int, covenantId)
        .input('covenantDate', sql.Date, date)
        .input('requirement', sql.NVarChar, requirement)
        .query(`
          UPDATE banking.Covenant
          SET CovenantDate = @covenantDate,
              Requirement = @requirement,
              UpdatedAt = SYSDATETIME()
          WHERE CovenantId = @covenantId
        `);
    } else {
      // Create new maturity covenant (IsCompleted defaults to false)
      await pool.request()
        .input('projectId', sql.Int, projectId)
        .input('loanId', sql.Int, loanId)
        .input('covenantType', sql.NVarChar, covenantType)
        .input('covenantDate', sql.Date, date)
        .input('requirement', sql.NVarChar, requirement)
        .query(`
          INSERT INTO banking.Covenant (
            ProjectId, LoanId, CovenantType,
            CovenantDate, Requirement, IsCompleted
          )
          VALUES (
            @projectId, @loanId, @covenantType,
            @covenantDate, @requirement, 0
          )
        `);
    }
  } catch (error) {
    // Log error but don't fail the loan operation
    console.error(`Error syncing ${covenantType} covenant:`, error);
  }
}

/**
 * Sync all maturity covenants for a loan
 */
async function syncAllMaturityCovenants(
  pool: sql.ConnectionPool,
  projectId: number,
  loanId: number,
  loanPhase: string,
  ioMaturityDate: Date | string | null,
  maturityDate: Date | string | null,
  miniPermMaturity: Date | string | null,
  permPhaseMaturity: Date | string | null
): Promise<void> {
  // I/O Maturity - for Construction loans
  if (ioMaturityDate && loanPhase === 'Construction') {
    await syncMaturityCovenant(pool, projectId, loanId, ioMaturityDate, 'I/O Maturity', 'Construction I/O Maturity');
  }

  // General Maturity Date
  if (maturityDate) {
    const maturityType = loanPhase === 'Construction' ? 'Loan Maturity' : 
                         loanPhase === 'Permanent' ? 'Permanent Loan Maturity' :
                         loanPhase === 'MiniPerm' ? 'Mini-Perm Maturity' :
                         'Loan Maturity';
    await syncMaturityCovenant(pool, projectId, loanId, maturityDate, maturityType, `${loanPhase} Loan Maturity`);
  }

  // Mini-Perm Maturity
  if (miniPermMaturity) {
    await syncMaturityCovenant(pool, projectId, loanId, miniPermMaturity, 'Mini-Perm Maturity', 'Mini-Perm Loan Maturity');
  }

  // Perm Phase Maturity
  if (permPhaseMaturity) {
    await syncMaturityCovenant(pool, projectId, loanId, permPhaseMaturity, 'Perm Phase Maturity', 'Permanent Phase Maturity');
  }
}

// ============================================================
// COVENANT CONTROLLER
// ============================================================

export const getAllCovenants = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const pool = await getConnection();
    const result = await pool.request().query('SELECT * FROM banking.Covenant ORDER BY ProjectId, CovenantDate');
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    next(error);
  }
};

export const getCovenantById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM banking.Covenant WHERE CovenantId = @id');
    
    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Covenant not found' } });
      return;
    }
    
    res.json({ success: true, data: result.recordset[0] });
  } catch (error) {
    next(error);
  }
};

export const getCovenantsByProject = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { projectId } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('projectId', sql.Int, projectId)
      .query('SELECT * FROM banking.Covenant WHERE ProjectId = @projectId ORDER BY CovenantId');
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    next(error);
  }
};

export const createCovenant = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { 
      ProjectId, LoanId, FinancingType, CovenantType,
      // DSCR fields
      DSCRTestDate, ProjectedInterestRate, DSCRRequirement, ProjectedDSCR,
      // Occupancy fields
      OccupancyCovenantDate, OccupancyRequirement, ProjectedOccupancy,
      // Liquidity Requirement fields
      LiquidityRequirementLendingBank,
      // Other fields (legacy)
      CovenantDate, Requirement, ProjectedValue,
      Notes,
      IsCompleted
    } = req.body;

    if (!ProjectId || !CovenantType) {
      res.status(400).json({ success: false, error: { message: 'ProjectId and CovenantType are required' } });
      return;
    }

    // Validate CovenantType
    const validTypes = ['DSCR', 'Occupancy', 'Liquidity Requirement', 'I/O Maturity', 'Loan Maturity', 'Permanent Loan Maturity', 'Mini-Perm Maturity', 'Perm Phase Maturity', 'Other'];
    if (!validTypes.includes(CovenantType)) {
      res.status(400).json({ 
        success: false, 
        error: { message: `CovenantType must be one of: ${validTypes.join(', ')}` } 
      });
      return;
    }

    // Validate FinancingType
    if (FinancingType && FinancingType !== 'Construction' && FinancingType !== 'Permanent') {
      res.status(400).json({ success: false, error: { message: 'FinancingType must be "Construction" or "Permanent"' } });
      return;
    }

    // Default to Construction if not provided
    const finalFinancingType = FinancingType || 'Construction';

    const pool = await getConnection();
    const request = pool.request()
      .input('ProjectId', sql.Int, ProjectId)
      .input('LoanId', sql.Int, LoanId)
      .input('FinancingType', sql.NVarChar, finalFinancingType)
      .input('CovenantType', sql.NVarChar, CovenantType)
      // DSCR fields
      .input('DSCRTestDate', sql.Date, DSCRTestDate)
      .input('ProjectedInterestRate', sql.NVarChar, ProjectedInterestRate)
      .input('DSCRRequirement', sql.NVarChar, DSCRRequirement)
      .input('ProjectedDSCR', sql.NVarChar, ProjectedDSCR)
      // Occupancy fields
      .input('OccupancyCovenantDate', sql.Date, OccupancyCovenantDate)
      .input('OccupancyRequirement', sql.NVarChar, OccupancyRequirement)
      .input('ProjectedOccupancy', sql.NVarChar, ProjectedOccupancy)
      // Liquidity Requirement fields
      .input('LiquidityRequirementLendingBank', sql.Decimal(18, 2), LiquidityRequirementLendingBank)
      // Other fields (legacy)
      .input('CovenantDate', sql.Date, CovenantDate)
      .input('Requirement', sql.NVarChar, Requirement)
      .input('ProjectedValue', sql.NVarChar, ProjectedValue)
      .input('Notes', sql.NVarChar(sql.MAX), Notes)
      .input('IsCompleted', sql.Bit, IsCompleted !== undefined ? IsCompleted : false);

    // Insert without OUTPUT clause (triggers prevent OUTPUT INSERTED.*)
    await request.query(`
      INSERT INTO banking.Covenant (
        ProjectId, LoanId, FinancingType, CovenantType,
        DSCRTestDate, ProjectedInterestRate, DSCRRequirement, ProjectedDSCR,
        OccupancyCovenantDate, OccupancyRequirement, ProjectedOccupancy,
        LiquidityRequirementLendingBank,
        CovenantDate, Requirement, ProjectedValue,
        Notes, IsCompleted
      )
      VALUES (
        @ProjectId, @LoanId, @FinancingType, @CovenantType,
        @DSCRTestDate, @ProjectedInterestRate, @DSCRRequirement, @ProjectedDSCR,
        @OccupancyCovenantDate, @OccupancyRequirement, @ProjectedOccupancy,
        @LiquidityRequirementLendingBank,
        @CovenantDate, @Requirement, @ProjectedValue,
        @Notes, @IsCompleted
      )
    `);

    // Get the inserted record
    const result = await pool.request()
      .input('projectId', sql.Int, ProjectId)
      .input('financingType', sql.NVarChar, finalFinancingType)
      .query(`
        SELECT TOP 1 * FROM banking.Covenant 
        WHERE ProjectId = @projectId AND FinancingType = @financingType
        ORDER BY CovenantId DESC
      `);

    res.status(201).json({ success: true, data: result.recordset[0] });
  } catch (error: any) {
    if (error.number === 547) {
      res.status(400).json({ success: false, error: { message: 'Invalid ProjectId or LoanId' } });
      return;
    }
    next(error);
  }
};

/**
 * Create covenant by ProjectId - convenience function for Domo
 * Automatically finds the construction loan for the project
 */
export const createCovenantByProject = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { projectId } = req.params;
    const { 
      CovenantType,
      // DSCR fields
      DSCRTestDate, ProjectedInterestRate, DSCRRequirement, ProjectedDSCR,
      // Occupancy fields
      OccupancyCovenantDate, OccupancyRequirement, ProjectedOccupancy,
      // Liquidity Requirement fields
      LiquidityRequirementLendingBank,
      // Other fields (legacy)
      CovenantDate, Requirement, ProjectedValue,
      Notes,
      IsCompleted
    } = req.body;

    if (!CovenantType) {
      res.status(400).json({ success: false, error: { message: 'CovenantType is required' } });
      return;
    }

    // Validate CovenantType
    const validTypes = ['DSCR', 'Occupancy', 'Liquidity Requirement', 'I/O Maturity', 'Loan Maturity', 'Permanent Loan Maturity', 'Mini-Perm Maturity', 'Perm Phase Maturity', 'Other'];
    if (!validTypes.includes(CovenantType)) {
      res.status(400).json({ 
        success: false, 
        error: { message: `CovenantType must be one of: ${validTypes.join(', ')}` } 
      });
      return;
    }

    const pool = await getConnection();
    
    // Find the construction loan for this project
    const findLoan = await pool.request()
      .input('projectId', sql.Int, projectId)
      .query(`
        SELECT TOP 1 LoanId 
        FROM banking.Loan 
        WHERE ProjectId = @projectId 
        ORDER BY CASE WHEN LoanPhase = 'Construction' THEN 0 ELSE 1 END, LoanId
      `);

    if (findLoan.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'No loan found for this project' } });
      return;
    }

    const loanId = findLoan.recordset[0].LoanId;
    
    // Create the covenant
    const result = await pool.request()
      .input('ProjectId', sql.Int, projectId)
      .input('LoanId', sql.Int, loanId)
      .input('CovenantType', sql.NVarChar, CovenantType)
      // DSCR fields
      .input('DSCRTestDate', sql.Date, DSCRTestDate)
      .input('ProjectedInterestRate', sql.NVarChar, ProjectedInterestRate)
      .input('DSCRRequirement', sql.NVarChar, DSCRRequirement)
      .input('ProjectedDSCR', sql.NVarChar, ProjectedDSCR)
      // Occupancy fields
      .input('OccupancyCovenantDate', sql.Date, OccupancyCovenantDate)
      .input('OccupancyRequirement', sql.NVarChar, OccupancyRequirement)
      .input('ProjectedOccupancy', sql.NVarChar, ProjectedOccupancy)
      // Liquidity Requirement fields
      .input('LiquidityRequirementLendingBank', sql.Decimal(18, 2), LiquidityRequirementLendingBank)
      // Other fields (legacy)
      .input('CovenantDate', sql.Date, CovenantDate)
      .input('Requirement', sql.NVarChar, Requirement)
      .input('ProjectedValue', sql.NVarChar, ProjectedValue)
      .input('Notes', sql.NVarChar(sql.MAX), Notes)
      .input('IsCompleted', sql.Bit, IsCompleted !== undefined ? IsCompleted : false)
      .query(`
        INSERT INTO banking.Covenant (
          ProjectId, LoanId, CovenantType,
          DSCRTestDate, ProjectedInterestRate, DSCRRequirement, ProjectedDSCR,
          OccupancyCovenantDate, OccupancyRequirement, ProjectedOccupancy,
          LiquidityRequirementLendingBank,
          CovenantDate, Requirement, ProjectedValue,
          Notes, IsCompleted
        )
        OUTPUT INSERTED.*
        VALUES (
          @ProjectId, @LoanId, @CovenantType,
          @DSCRTestDate, @ProjectedInterestRate, @DSCRRequirement, @ProjectedDSCR,
          @OccupancyCovenantDate, @OccupancyRequirement, @ProjectedOccupancy,
          @LiquidityRequirementLendingBank,
          @CovenantDate, @Requirement, @ProjectedValue,
          @Notes, @IsCompleted
        )
      `);

    res.status(201).json({ success: true, data: result.recordset[0] });
  } catch (error: any) {
    if (error.number === 547) {
      res.status(400).json({ success: false, error: { message: 'Invalid ProjectId' } });
      return;
    }
    next(error);
  }
};

export const updateCovenant = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const covenantData = req.body;

    // Validate CovenantType if provided
    if (covenantData.CovenantType !== undefined) {
      const validTypes = ['DSCR', 'Occupancy', 'Liquidity Requirement', 'I/O Maturity', 'Other'];
      if (!validTypes.includes(covenantData.CovenantType)) {
        res.status(400).json({ 
          success: false, 
          error: { message: `CovenantType must be one of: ${validTypes.join(', ')}` } 
        });
        return;
      }
    }

    const pool = await getConnection();
    const request = pool.request().input('id', sql.Int, id);

    // Build dynamic update query - only update fields that are provided
    const fields: string[] = [];
    Object.keys(covenantData).forEach((key) => {
      if (key !== 'CovenantId' && covenantData[key] !== undefined) {
        fields.push(`${key} = @${key}`);
        if (key === 'ProjectId' || key === 'LoanId') {
          request.input(key, sql.Int, covenantData[key]);
        } else if (key === 'CovenantDate' || key === 'DSCRTestDate' || key === 'OccupancyCovenantDate') {
          request.input(key, sql.Date, covenantData[key]);
        } else if (key === 'LiquidityRequirementLendingBank') {
          request.input(key, sql.Decimal(18, 2), covenantData[key]);
        } else if (key === 'IsCompleted') {
          request.input(key, sql.Bit, covenantData[key]);
        } else if (key === 'Notes') {
          request.input(key, sql.NVarChar(sql.MAX), covenantData[key]);
        } else {
          request.input(key, sql.NVarChar, covenantData[key]);
        }
      }
    });

    if (fields.length === 0) {
      res.status(400).json({ success: false, error: { message: 'No fields to update' } });
      return;
    }

    const result = await request.query(`
      UPDATE banking.Covenant
      SET ${fields.join(', ')}
      WHERE CovenantId = @id;
      SELECT * FROM banking.Covenant WHERE CovenantId = @id;
    `);

    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Covenant not found' } });
      return;
    }

    res.json({ success: true, data: result.recordset[0] });
  } catch (error: any) {
    if (error.number === 547) {
      res.status(400).json({ success: false, error: { message: 'Invalid foreign key reference' } });
      return;
    }
    next(error);
  }
};

export const deleteCovenant = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM banking.Covenant WHERE CovenantId = @id');

    if (result.rowsAffected[0] === 0) {
      res.status(404).json({ success: false, error: { message: 'Covenant not found' } });
      return;
    }

    res.json({ success: true, message: 'Covenant deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// LIQUIDITY REQUIREMENT CONTROLLER
// ============================================================

export const getAllLiquidityRequirements = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const pool = await getConnection();
    const result = await pool.request().query('SELECT * FROM banking.LiquidityRequirement ORDER BY ProjectId');
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    next(error);
  }
};

export const getLiquidityRequirementById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM banking.LiquidityRequirement WHERE LiquidityRequirementId = @id');
    
    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Liquidity Requirement not found' } });
      return;
    }
    
    res.json({ success: true, data: result.recordset[0] });
  } catch (error) {
    next(error);
  }
};

export const getLiquidityRequirementsByProject = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { projectId } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('projectId', sql.Int, projectId)
      .query('SELECT * FROM banking.LiquidityRequirement WHERE ProjectId = @projectId ORDER BY LiquidityRequirementId');
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    next(error);
  }
};

export const createLiquidityRequirement = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { ProjectId, LoanId, FinancingType, TotalAmount, LendingBankAmount, Notes, IsCompleted } = req.body;

    if (!ProjectId) {
      res.status(400).json({ success: false, error: { message: 'ProjectId is required' } });
      return;
    }

    // Validate FinancingType
    if (FinancingType && FinancingType !== 'Construction' && FinancingType !== 'Permanent') {
      res.status(400).json({ success: false, error: { message: 'FinancingType must be "Construction" or "Permanent"' } });
      return;
    }

    // Default to Construction if not provided
    const finalFinancingType = FinancingType || 'Construction';

    const pool = await getConnection();
    const request = pool.request()
      .input('ProjectId', sql.Int, ProjectId)
      .input('LoanId', sql.Int, LoanId)
      .input('FinancingType', sql.NVarChar, finalFinancingType)
      .input('TotalAmount', sql.Decimal(18, 2), TotalAmount)
      .input('LendingBankAmount', sql.Decimal(18, 2), LendingBankAmount)
      .input('Notes', sql.NVarChar(sql.MAX), Notes)
      .input('IsCompleted', sql.Bit, IsCompleted !== undefined ? IsCompleted : false);

    // Insert without OUTPUT clause (triggers prevent OUTPUT INSERTED.*)
    await request.query(`
      INSERT INTO banking.LiquidityRequirement (ProjectId, LoanId, FinancingType, TotalAmount, LendingBankAmount, Notes, IsCompleted)
      VALUES (@ProjectId, @LoanId, @FinancingType, @TotalAmount, @LendingBankAmount, @Notes, @IsCompleted)
    `);

    // Get the inserted record
    const result = await pool.request()
      .input('projectId', sql.Int, ProjectId)
      .input('financingType', sql.NVarChar, finalFinancingType)
      .query(`
        SELECT TOP 1 * FROM banking.LiquidityRequirement 
        WHERE ProjectId = @projectId AND FinancingType = @financingType
        ORDER BY LiquidityRequirementId DESC
      `);

    res.status(201).json({ success: true, data: result.recordset[0] });
  } catch (error: any) {
    if (error.number === 2627) {
      res.status(409).json({ success: false, error: { message: 'Liquidity requirement for this project already exists' } });
      return;
    }
    if (error.number === 547) {
      res.status(400).json({ success: false, error: { message: 'Invalid ProjectId or LoanId' } });
      return;
    }
    next(error);
  }
};

export const updateLiquidityRequirement = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const { ProjectId, LoanId, TotalAmount, LendingBankAmount, Notes, IsCompleted } = req.body;

    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .input('ProjectId', sql.Int, ProjectId)
      .input('LoanId', sql.Int, LoanId)
      .input('TotalAmount', sql.Decimal(18, 2), TotalAmount)
      .input('LendingBankAmount', sql.Decimal(18, 2), LendingBankAmount)
      .input('Notes', sql.NVarChar(sql.MAX), Notes)
      .input('IsCompleted', sql.Bit, IsCompleted !== undefined ? IsCompleted : false)
      .query(`
        UPDATE banking.LiquidityRequirement
        SET ProjectId = @ProjectId, LoanId = @LoanId, TotalAmount = @TotalAmount,
            LendingBankAmount = @LendingBankAmount, Notes = @Notes, IsCompleted = @IsCompleted
        OUTPUT INSERTED.*
        WHERE LiquidityRequirementId = @id
      `);

    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Liquidity Requirement not found' } });
      return;
    }

    res.json({ success: true, data: result.recordset[0] });
  } catch (error: any) {
    if (error.number === 547) {
      res.status(400).json({ success: false, error: { message: 'Invalid foreign key reference' } });
      return;
    }
    next(error);
  }
};

export const deleteLiquidityRequirement = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM banking.LiquidityRequirement WHERE LiquidityRequirementId = @id');

    if (result.rowsAffected[0] === 0) {
      res.status(404).json({ success: false, error: { message: 'Liquidity Requirement not found' } });
      return;
    }

    res.json({ success: true, message: 'Liquidity Requirement deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// BANK TARGET CONTROLLER
// ============================================================

export const getAllBankTargets = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const pool = await getConnection();
    const result = await pool.request().query(`
      SELECT bt.*, b.BankName
      FROM banking.BankTarget bt
      LEFT JOIN core.Bank b ON bt.BankId = b.BankId
      ORDER BY bt.BankTargetId
    `);
    res.json({ success: true, data: normalizeStateInPayload(result.recordset) });
  } catch (error) {
    next(error);
  }
};

export const getBankTargetById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM banking.BankTarget WHERE BankTargetId = @id');
    
    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Bank Target not found' } });
      return;
    }
    
    res.json({ success: true, data: normalizeStateInPayload(result.recordset[0]) });
  } catch (error) {
    next(error);
  }
};

export const createBankTarget = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { BankId, AssetsText, City, State, ExposureWithStoa, ContactText, Comments } = req.body;

    if (!BankId) {
      res.status(400).json({ success: false, error: { message: 'BankId is required' } });
      return;
    }

    const pool = await getConnection();
    const result = await pool.request()
      .input('BankId', sql.Int, BankId)
      .input('AssetsText', sql.NVarChar, AssetsText)
      .input('City', sql.NVarChar, City)
      .input('State', sql.NVarChar, normalizeState(State))
      .input('ExposureWithStoa', sql.Decimal(18, 2), ExposureWithStoa)
      .input('ContactText', sql.NVarChar(4000), ContactText)
      .input('Comments', sql.NVarChar(sql.MAX), Comments)
      .query(`
        INSERT INTO banking.BankTarget (BankId, AssetsText, City, State, ExposureWithStoa, ContactText, Comments)
        OUTPUT INSERTED.*
        VALUES (@BankId, @AssetsText, @City, @State, @ExposureWithStoa, @ContactText, @Comments)
      `);

    res.status(201).json({ success: true, data: normalizeStateInPayload(result.recordset[0]) });
  } catch (error: any) {
    if (error.number === 2627) {
      res.status(409).json({ success: false, error: { message: 'Bank target for this bank already exists' } });
      return;
    }
    if (error.number === 547) {
      res.status(400).json({ success: false, error: { message: 'Invalid BankId' } });
      return;
    }
    next(error);
  }
};

export const updateBankTarget = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const { BankId, AssetsText, City, State, ExposureWithStoa, ContactText, Comments } = req.body;

    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .input('BankId', sql.Int, BankId)
      .input('AssetsText', sql.NVarChar, AssetsText)
      .input('City', sql.NVarChar, City)
      .input('State', sql.NVarChar, normalizeState(State))
      .input('ExposureWithStoa', sql.Decimal(18, 2), ExposureWithStoa)
      .input('ContactText', sql.NVarChar(4000), ContactText)
      .input('Comments', sql.NVarChar(sql.MAX), Comments)
      .query(`
        UPDATE banking.BankTarget
        SET BankId = @BankId, AssetsText = @AssetsText, City = @City, State = @State,
            ExposureWithStoa = @ExposureWithStoa, ContactText = @ContactText, Comments = @Comments
        OUTPUT INSERTED.*
        WHERE BankTargetId = @id
      `);

    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Bank Target not found' } });
      return;
    }

    res.json({ success: true, data: normalizeStateInPayload(result.recordset[0]) });
  } catch (error: any) {
    if (error.number === 547) {
      res.status(400).json({ success: false, error: { message: 'Invalid BankId' } });
      return;
    }
    next(error);
  }
};

export const deleteBankTarget = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM banking.BankTarget WHERE BankTargetId = @id');

    if (result.rowsAffected[0] === 0) {
      res.status(404).json({ success: false, error: { message: 'Bank Target not found' } });
      return;
    }

    res.json({ success: true, message: 'Bank Target deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// EQUITY COMMITMENT CONTROLLER
// ============================================================

export const getAllEquityCommitments = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const pool = await getConnection();
    const result = await pool.request().query(`
      SELECT 
        ec.*, 
        p.ProjectName, 
        ep.PartnerName,
        ep.IMSInvestorProfileId,
        p_rep.FullName AS InvestorRepName,
        p_rep.Email AS InvestorRepEmail,
        p_rep.Phone AS InvestorRepPhone,
        -- If PartnerName looks like an ID (all digits, 6+ chars), try to find actual name via IMS ID
        CASE 
          WHEN ep.PartnerName IS NOT NULL 
               AND ISNUMERIC(ep.PartnerName) = 1
               AND LEN(ep.PartnerName) >= 6
          THEN COALESCE(
            (SELECT TOP 1 ep2.PartnerName 
             FROM core.EquityPartner ep2 
             WHERE ep2.IMSInvestorProfileId = ep.PartnerName
               AND ep2.PartnerName != ep.PartnerName),
            ep.PartnerName
          )
          ELSE ep.PartnerName
        END AS InvestorName,
        (
          SELECT 
            ep2.EquityPartnerId,
            ep2.PartnerName,
            p2.FullName AS InvestorRepName,
            p2.Email AS InvestorRepEmail,
            p2.Phone AS InvestorRepPhone
          FROM banking.EquityCommitmentRelatedParty ecrp
          INNER JOIN core.EquityPartner ep2 ON ecrp.RelatedPartyId = ep2.EquityPartnerId
          LEFT JOIN core.Person p2 ON ep2.InvestorRepId = p2.PersonId
          WHERE ecrp.EquityCommitmentId = ec.EquityCommitmentId
          FOR JSON PATH
        ) AS RelatedParties
      FROM banking.EquityCommitment ec
      LEFT JOIN core.Project p ON ec.ProjectId = p.ProjectId
      LEFT JOIN core.EquityPartner ep ON ec.EquityPartnerId = ep.EquityPartnerId
      LEFT JOIN core.Person p_rep ON ep.InvestorRepId = p_rep.PersonId
      ORDER BY ec.EquityCommitmentId
    `);
    
    // Parse RelatedParties JSON strings
    const commitments = result.recordset.map((row: any) => {
      if (row.RelatedParties) {
        row.RelatedParties = JSON.parse(row.RelatedParties);
      } else {
        row.RelatedParties = [];
      }
      return row;
    });
    
    res.json({ success: true, data: commitments });
  } catch (error) {
    next(error);
  }
};

export const getEquityCommitmentById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT 
          ec.*,
          ep.PartnerName,
          p_rep.FullName AS InvestorRepName,
          p_rep.Email AS InvestorRepEmail,
          p_rep.Phone AS InvestorRepPhone,
          (
            SELECT 
              ep2.EquityPartnerId,
              ep2.PartnerName,
              p2.FullName AS InvestorRepName,
              p2.Email AS InvestorRepEmail,
              p2.Phone AS InvestorRepPhone
            FROM banking.EquityCommitmentRelatedParty ecrp
            INNER JOIN core.EquityPartner ep2 ON ecrp.RelatedPartyId = ep2.EquityPartnerId
            LEFT JOIN core.Person p2 ON ep2.InvestorRepId = p2.PersonId
            WHERE ecrp.EquityCommitmentId = ec.EquityCommitmentId
            FOR JSON PATH
          ) AS RelatedParties
        FROM banking.EquityCommitment ec
        LEFT JOIN core.EquityPartner ep ON ec.EquityPartnerId = ep.EquityPartnerId
        LEFT JOIN core.Person p_rep ON ep.InvestorRepId = p_rep.PersonId
        WHERE ec.EquityCommitmentId = @id
      `);
    
    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Equity Commitment not found' } });
      return;
    }
    
    const commitment = result.recordset[0];
    if (commitment.RelatedParties) {
      commitment.RelatedParties = JSON.parse(commitment.RelatedParties);
    } else {
      commitment.RelatedParties = [];
    }
    
    res.json({ success: true, data: commitment });
  } catch (error) {
    next(error);
  }
};

export const getEquityCommitmentsByProject = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { projectId } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('projectId', sql.Int, projectId)
      .query(`
        SELECT 
          ec.*,
          ep.PartnerName,
          p_rep.FullName AS InvestorRepName,
          p_rep.Email AS InvestorRepEmail,
          p_rep.Phone AS InvestorRepPhone,
          (
            SELECT 
              ep2.EquityPartnerId,
              ep2.PartnerName,
              p2.FullName AS InvestorRepName,
              p2.Email AS InvestorRepEmail,
              p2.Phone AS InvestorRepPhone
            FROM banking.EquityCommitmentRelatedParty ecrp
            INNER JOIN core.EquityPartner ep2 ON ecrp.RelatedPartyId = ep2.EquityPartnerId
            LEFT JOIN core.Person p2 ON ep2.InvestorRepId = p2.PersonId
            WHERE ecrp.EquityCommitmentId = ec.EquityCommitmentId
            FOR JSON PATH
          ) AS RelatedParties
        FROM banking.EquityCommitment ec
        LEFT JOIN core.EquityPartner ep ON ec.EquityPartnerId = ep.EquityPartnerId
        LEFT JOIN core.Person p_rep ON ep.InvestorRepId = p_rep.PersonId
        WHERE ec.ProjectId = @projectId
        ORDER BY ec.EquityCommitmentId
      `);
    
    const commitments = result.recordset.map((row: any) => {
      if (row.RelatedParties) {
        row.RelatedParties = JSON.parse(row.RelatedParties);
      } else {
        row.RelatedParties = [];
      }
      return row;
    });
    
    res.json({ success: true, data: commitments });
  } catch (error) {
    next(error);
  }
};

export const createEquityCommitment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      ProjectId, EquityPartnerId, EquityType, LeadPrefGroup,
      FundingDate, Amount, InterestRate, AnnualMonthly,
      BackEndKicker, LastDollar, Notes, RelatedPartyIds
    } = req.body;

    if (!ProjectId) {
      res.status(400).json({ success: false, error: { message: 'ProjectId is required' } });
      return;
    }

    // Validate EquityType if provided
    if (EquityType && !['Preferred Equity', 'Common Equity', 'Profits Interest', 'Stoa Loan'].includes(EquityType)) {
      res.status(400).json({ 
        success: false, 
        error: { 
          message: 'EquityType must be one of: Preferred Equity, Common Equity, Profits Interest, Stoa Loan' 
        } 
      });
      return;
    }

    const pool = await getConnection();
    
    // Validate: Individuals cannot have related parties
    if (EquityPartnerId && RelatedPartyIds && Array.isArray(RelatedPartyIds) && RelatedPartyIds.length > 0) {
      const partnerCheck = await pool.request()
        .input('EquityPartnerId', sql.Int, EquityPartnerId)
        .query('SELECT PartnerType FROM core.EquityPartner WHERE EquityPartnerId = @EquityPartnerId');
      
      if (partnerCheck.recordset.length > 0 && partnerCheck.recordset[0].PartnerType === 'Individual') {
        res.status(400).json({ 
          success: false, 
          error: { 
            message: 'Individual equity partners cannot have related parties. Only Entity partners can have related parties.' 
          } 
        });
        return;
      }
    }
    
    const transaction = new sql.Transaction(pool);
    
    try {
      await transaction.begin();
      
      // Create the equity commitment
      const commitmentResult = await new sql.Request(transaction)
        .input('ProjectId', sql.Int, ProjectId)
        .input('EquityPartnerId', sql.Int, EquityPartnerId)
        .input('EquityType', sql.NVarChar, EquityType)
        .input('LeadPrefGroup', sql.NVarChar, LeadPrefGroup)
        .input('FundingDate', sql.Date, FundingDate)
        .input('Amount', sql.Decimal(18, 2), Amount)
        .input('InterestRate', sql.NVarChar, InterestRate)
        .input('AnnualMonthly', sql.NVarChar, AnnualMonthly)
        .input('BackEndKicker', sql.NVarChar, BackEndKicker)
        .input('LastDollar', sql.Bit, LastDollar)
        .input('Notes', sql.NVarChar(sql.MAX), Notes)
        .query(`
          INSERT INTO banking.EquityCommitment (
            ProjectId, EquityPartnerId, EquityType, LeadPrefGroup,
            FundingDate, Amount, InterestRate, AnnualMonthly,
            BackEndKicker, LastDollar, Notes
          )
          OUTPUT INSERTED.*
          VALUES (
            @ProjectId, @EquityPartnerId, @EquityType, @LeadPrefGroup,
            @FundingDate, @Amount, @InterestRate, @AnnualMonthly,
            @BackEndKicker, @LastDollar, @Notes
          )
        `);

      const commitmentId = commitmentResult.recordset[0].EquityCommitmentId;

      // Add related parties if provided
      if (RelatedPartyIds && Array.isArray(RelatedPartyIds) && RelatedPartyIds.length > 0) {
        for (const relatedPartyId of RelatedPartyIds) {
          if (relatedPartyId && relatedPartyId !== EquityPartnerId) { // Don't add the lead investor as a related party
            await new sql.Request(transaction)
              .input('EquityCommitmentId', sql.Int, commitmentId)
              .input('RelatedPartyId', sql.Int, relatedPartyId)
              .query(`
                INSERT INTO banking.EquityCommitmentRelatedParty (EquityCommitmentId, RelatedPartyId)
                VALUES (@EquityCommitmentId, @RelatedPartyId)
              `);
          }
        }
      }

      await transaction.commit();

      // Fetch the complete commitment with related parties
      const finalResult = await pool.request()
        .input('id', sql.Int, commitmentId)
        .query(`
          SELECT 
            ec.*,
            (
              SELECT 
                ep.EquityPartnerId,
                ep.PartnerName,
                p.FullName AS InvestorRepName,
                p.Email AS InvestorRepEmail,
                p.Phone AS InvestorRepPhone
              FROM banking.EquityCommitmentRelatedParty ecrp
              INNER JOIN core.EquityPartner ep ON ecrp.RelatedPartyId = ep.EquityPartnerId
              LEFT JOIN core.Person p ON ep.InvestorRepId = p.PersonId
              WHERE ecrp.EquityCommitmentId = ec.EquityCommitmentId
              FOR JSON PATH
            ) AS RelatedParties
          FROM banking.EquityCommitment ec
          WHERE ec.EquityCommitmentId = @id
        `);

      const commitment = finalResult.recordset[0];
      if (commitment.RelatedParties) {
        commitment.RelatedParties = JSON.parse(commitment.RelatedParties);
      } else {
        commitment.RelatedParties = [];
      }

      res.status(201).json({ success: true, data: commitment });
    } catch (error: any) {
      await transaction.rollback();
      throw error;
    }
  } catch (error: any) {
    if (error.number === 547) {
      if (error.message.includes('CK_EquityCommitment_EquityType')) {
        res.status(400).json({ 
          success: false, 
          error: { 
            message: 'EquityType must be one of: Preferred Equity, Common Equity, Profits Interest, Stoa Loan' 
          } 
        });
        return;
      }
      res.status(400).json({ success: false, error: { message: 'Invalid ProjectId or EquityPartnerId' } });
      return;
    }
    next(error);
  }
};

export const updateEquityCommitment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const {
      ProjectId, EquityPartnerId, EquityType, LeadPrefGroup,
      FundingDate, Amount, InterestRate, AnnualMonthly,
      BackEndKicker, LastDollar, Notes, RelatedPartyIds
    } = req.body;

    // Validate EquityType if provided
    if (EquityType && !['Preferred Equity', 'Common Equity', 'Profits Interest', 'Stoa Loan'].includes(EquityType)) {
      res.status(400).json({ 
        success: false, 
        error: { 
          message: 'EquityType must be one of: Preferred Equity, Common Equity, Profits Interest, Stoa Loan' 
        } 
      });
      return;
    }

    const pool = await getConnection();
    
    // Validate: Individuals cannot have related parties
    // Get current EquityPartnerId if not being updated
    let finalEquityPartnerId = EquityPartnerId;
    if (!finalEquityPartnerId) {
      const currentCommitment = await pool.request()
        .input('id', sql.Int, id)
        .query('SELECT EquityPartnerId FROM banking.EquityCommitment WHERE EquityCommitmentId = @id');
      
      if (currentCommitment.recordset.length > 0) {
        finalEquityPartnerId = currentCommitment.recordset[0].EquityPartnerId;
      }
    }
    
    if (finalEquityPartnerId && RelatedPartyIds !== undefined && Array.isArray(RelatedPartyIds) && RelatedPartyIds.length > 0) {
      const partnerCheck = await pool.request()
        .input('EquityPartnerId', sql.Int, finalEquityPartnerId)
        .query('SELECT PartnerType FROM core.EquityPartner WHERE EquityPartnerId = @EquityPartnerId');
      
      if (partnerCheck.recordset.length > 0 && partnerCheck.recordset[0].PartnerType === 'Individual') {
        res.status(400).json({ 
          success: false, 
          error: { 
            message: 'Individual equity partners cannot have related parties. Only Entity partners can have related parties.' 
          } 
        });
        return;
      }
    }
    
    const transaction = new sql.Transaction(pool);
    
    try {
      await transaction.begin();
      
      // Build dynamic UPDATE query (only update fields that are provided)
      const updateFields: string[] = [];
      const request = new sql.Request(transaction).input('id', sql.Int, id);

      if (ProjectId !== undefined) {
        updateFields.push('ProjectId = @ProjectId');
        request.input('ProjectId', sql.Int, ProjectId);
      }
      if (EquityPartnerId !== undefined) {
        updateFields.push('EquityPartnerId = @EquityPartnerId');
        request.input('EquityPartnerId', sql.Int, EquityPartnerId);
      }
      if (EquityType !== undefined) {
        updateFields.push('EquityType = @EquityType');
        request.input('EquityType', sql.NVarChar, EquityType);
      }
      if (LeadPrefGroup !== undefined) {
        updateFields.push('LeadPrefGroup = @LeadPrefGroup');
        request.input('LeadPrefGroup', sql.NVarChar, LeadPrefGroup);
      }
      if (FundingDate !== undefined) {
        updateFields.push('FundingDate = @FundingDate');
        request.input('FundingDate', sql.Date, FundingDate);
      }
      if (Amount !== undefined) {
        updateFields.push('Amount = @Amount');
        request.input('Amount', sql.Decimal(18, 2), Amount);
      }
      if (InterestRate !== undefined) {
        updateFields.push('InterestRate = @InterestRate');
        request.input('InterestRate', sql.NVarChar, InterestRate);
      }
      if (AnnualMonthly !== undefined) {
        updateFields.push('AnnualMonthly = @AnnualMonthly');
        request.input('AnnualMonthly', sql.NVarChar, AnnualMonthly);
      }
      if (BackEndKicker !== undefined) {
        updateFields.push('BackEndKicker = @BackEndKicker');
        request.input('BackEndKicker', sql.NVarChar, BackEndKicker);
      }
      if (LastDollar !== undefined) {
        updateFields.push('LastDollar = @LastDollar');
        request.input('LastDollar', sql.Bit, LastDollar);
      }
      if (Notes !== undefined) {
        updateFields.push('Notes = @Notes');
        request.input('Notes', sql.NVarChar(sql.MAX), Notes);
      }

      if (updateFields.length === 0) {
        await transaction.rollback();
        res.status(400).json({ success: false, error: { message: 'No fields provided to update' } });
        return;
      }

      const updateQuery = `
        UPDATE banking.EquityCommitment
        SET ${updateFields.join(', ')}
        WHERE EquityCommitmentId = @id
      `;

      const updateResult = await request.query(updateQuery);

      if (updateResult.rowsAffected[0] === 0) {
        await transaction.rollback();
        res.status(404).json({ success: false, error: { message: 'Equity Commitment not found' } });
        return;
      }

      // Update related parties if provided
      if (RelatedPartyIds !== undefined) {
        // Delete existing related parties
        await new sql.Request(transaction)
          .input('EquityCommitmentId', sql.Int, id)
          .query('DELETE FROM banking.EquityCommitmentRelatedParty WHERE EquityCommitmentId = @EquityCommitmentId');

        // Add new related parties
        if (Array.isArray(RelatedPartyIds) && RelatedPartyIds.length > 0) {
          for (const relatedPartyId of RelatedPartyIds) {
            if (relatedPartyId && relatedPartyId !== EquityPartnerId) { // Don't add the lead investor as a related party
              await new sql.Request(transaction)
                .input('EquityCommitmentId', sql.Int, id)
                .input('RelatedPartyId', sql.Int, relatedPartyId)
                .query(`
                  INSERT INTO banking.EquityCommitmentRelatedParty (EquityCommitmentId, RelatedPartyId)
                  VALUES (@EquityCommitmentId, @RelatedPartyId)
                `);
            }
          }
        }
      }

      await transaction.commit();

      // Fetch the complete commitment with related parties
      const finalResult = await pool.request()
        .input('id', sql.Int, id)
        .query(`
          SELECT 
            ec.*,
            ep.PartnerName,
            p_rep.FullName AS InvestorRepName,
            p_rep.Email AS InvestorRepEmail,
            p_rep.Phone AS InvestorRepPhone,
            (
              SELECT 
                ep2.EquityPartnerId,
                ep2.PartnerName,
                p2.FullName AS InvestorRepName,
                p2.Email AS InvestorRepEmail,
                p2.Phone AS InvestorRepPhone
              FROM banking.EquityCommitmentRelatedParty ecrp
              INNER JOIN core.EquityPartner ep2 ON ecrp.RelatedPartyId = ep2.EquityPartnerId
              LEFT JOIN core.Person p2 ON ep2.InvestorRepId = p2.PersonId
              WHERE ecrp.EquityCommitmentId = ec.EquityCommitmentId
              FOR JSON PATH
            ) AS RelatedParties
          FROM banking.EquityCommitment ec
          LEFT JOIN core.EquityPartner ep ON ec.EquityPartnerId = ep.EquityPartnerId
          LEFT JOIN core.Person p_rep ON ep.InvestorRepId = p_rep.PersonId
          WHERE ec.EquityCommitmentId = @id
        `);

      const commitment = finalResult.recordset[0];
      if (commitment.RelatedParties) {
        commitment.RelatedParties = JSON.parse(commitment.RelatedParties);
      } else {
        commitment.RelatedParties = [];
      }

      res.json({ success: true, data: commitment });
    } catch (error: any) {
      await transaction.rollback();
      throw error;
    }
  } catch (error: any) {
    if (error.number === 547) {
      if (error.message.includes('CK_EquityCommitment_EquityType')) {
        res.status(400).json({ 
          success: false, 
          error: { 
            message: 'EquityType must be one of: Preferred Equity, Common Equity, Profits Interest, Stoa Loan' 
          } 
        });
        return;
      }
      // Provide more specific error messages for foreign key violations
      let errorMessage = 'Invalid foreign key reference';
      if (error.message.includes('FK_Equity_Project')) {
        errorMessage = 'Invalid ProjectId: Project does not exist';
      } else if (error.message.includes('FK_Equity_Partner')) {
        errorMessage = 'Invalid EquityPartnerId: Equity Partner does not exist';
      } else if (error.message.includes('FK_EquityCommitmentRelatedParty_Partner')) {
        errorMessage = 'Invalid RelatedPartyId: One or more Related Party IDs do not exist';
      }
      res.status(400).json({ success: false, error: { message: errorMessage } });
      return;
    }
    next(error);
  }
};

export const deleteEquityCommitment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM banking.EquityCommitment WHERE EquityCommitmentId = @id');

    if (result.rowsAffected[0] === 0) {
      res.status(404).json({ success: false, error: { message: 'Equity Commitment not found' } });
      return;
    }

    res.json({ success: true, message: 'Equity Commitment deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// EQUITY COMMITMENT RELATED PARTIES CONTROLLER
// ============================================================

export const getRelatedPartiesByCommitment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { commitmentId } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('commitmentId', sql.Int, commitmentId)
      .query(`
        SELECT 
          ecrp.EquityCommitmentRelatedPartyId,
          ecrp.EquityCommitmentId,
          ep.EquityPartnerId,
          ep.PartnerName,
          p.FullName AS InvestorRepName,
          p.Email AS InvestorRepEmail,
          p.Phone AS InvestorRepPhone,
          ep.IMSInvestorProfileId
        FROM banking.EquityCommitmentRelatedParty ecrp
        INNER JOIN core.EquityPartner ep ON ecrp.RelatedPartyId = ep.EquityPartnerId
        LEFT JOIN core.Person p ON ep.InvestorRepId = p.PersonId
        WHERE ecrp.EquityCommitmentId = @commitmentId
        ORDER BY ep.PartnerName
      `);
    
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    next(error);
  }
};

export const addRelatedParty = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { commitmentId } = req.params;
    const { RelatedPartyId } = req.body;

    if (!RelatedPartyId) {
      res.status(400).json({ success: false, error: { message: 'RelatedPartyId is required' } });
      return;
    }

    const pool = await getConnection();
    
    // Check that the related party is not the lead investor
    const commitmentCheck = await pool.request()
      .input('commitmentId', sql.Int, commitmentId)
      .query('SELECT EquityPartnerId FROM banking.EquityCommitment WHERE EquityCommitmentId = @commitmentId');
    
    if (commitmentCheck.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Equity Commitment not found' } });
      return;
    }
    
    const leadInvestorId = commitmentCheck.recordset[0].EquityPartnerId;
    if (RelatedPartyId === leadInvestorId) {
      res.status(400).json({ success: false, error: { message: 'Cannot add lead investor as a related party' } });
      return;
    }

    const result = await pool.request()
      .input('EquityCommitmentId', sql.Int, commitmentId)
      .input('RelatedPartyId', sql.Int, RelatedPartyId)
      .query(`
        INSERT INTO banking.EquityCommitmentRelatedParty (EquityCommitmentId, RelatedPartyId)
        OUTPUT INSERTED.*
        VALUES (@EquityCommitmentId, @RelatedPartyId)
      `);

    res.status(201).json({ success: true, data: result.recordset[0] });
  } catch (error: any) {
    if (error.number === 2627) {
      res.status(409).json({ success: false, error: { message: 'This related party is already associated with this commitment' } });
      return;
    }
    if (error.number === 547) {
      res.status(400).json({ success: false, error: { message: 'Invalid EquityCommitmentId or RelatedPartyId' } });
      return;
    }
    next(error);
  }
};

export const removeRelatedParty = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { commitmentId, relatedPartyId } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('commitmentId', sql.Int, commitmentId)
      .input('relatedPartyId', sql.Int, relatedPartyId)
      .query(`
        DELETE FROM banking.EquityCommitmentRelatedParty
        WHERE EquityCommitmentId = @commitmentId AND RelatedPartyId = @relatedPartyId
      `);

    if (result.rowsAffected[0] === 0) {
      res.status(404).json({ success: false, error: { message: 'Related party not found for this commitment' } });
      return;
    }

    res.json({ success: true, message: 'Related party removed successfully' });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// LOAN PROCEEDS CONTROLLER (Additional Draws/Disbursements)
// ============================================================

export const getAllLoanProceeds = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const pool = await getConnection();
    const result = await pool.request().query(`
      SELECT 
        lp.*,
        p.ProjectName,
        l.LoanType,
        l.LoanPhase
      FROM banking.LoanProceeds lp
      LEFT JOIN core.Project p ON lp.ProjectId = p.ProjectId
      LEFT JOIN banking.Loan l ON lp.LoanId = l.LoanId
      ORDER BY lp.ProceedsDate DESC, lp.LoanProceedsId DESC
    `);
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    next(error);
  }
};

export const getLoanProceedsById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT 
          lp.*,
          p.ProjectName,
          l.LoanType,
          l.LoanPhase
        FROM banking.LoanProceeds lp
        LEFT JOIN core.Project p ON lp.ProjectId = p.ProjectId
        LEFT JOIN banking.Loan l ON lp.LoanId = l.LoanId
        WHERE lp.LoanProceedsId = @id
      `);
    
    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'LoanProceeds not found' } });
      return;
    }
    
    res.json({ success: true, data: result.recordset[0] });
  } catch (error) {
    next(error);
  }
};

export const getLoanProceedsByProject = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { projectId } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('projectId', sql.Int, projectId)
      .query(`
        SELECT 
          lp.*,
          l.LoanType,
          l.LoanPhase
        FROM banking.LoanProceeds lp
        LEFT JOIN banking.Loan l ON lp.LoanId = l.LoanId
        WHERE lp.ProjectId = @projectId
        ORDER BY lp.ProceedsDate DESC, lp.LoanProceedsId DESC
      `);
    
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    next(error);
  }
};

export const getLoanProceedsByLoan = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { loanId } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('loanId', sql.Int, loanId)
      .query(`
        SELECT 
          lp.*,
          p.ProjectName
        FROM banking.LoanProceeds lp
        LEFT JOIN core.Project p ON lp.ProjectId = p.ProjectId
        WHERE lp.LoanId = @loanId
        ORDER BY lp.ProceedsDate DESC, lp.LoanProceedsId DESC
      `);
    
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    next(error);
  }
};

export const createLoanProceeds = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      ProjectId, LoanId, FinancingType, ProceedsDate, ProceedsAmount, CumulativeAmount,
      DrawNumber, DrawDescription, Notes
    } = req.body;

    if (!ProjectId || !ProceedsDate || !ProceedsAmount) {
      res.status(400).json({ success: false, error: { message: 'ProjectId, ProceedsDate, and ProceedsAmount are required' } });
      return;
    }

    // Validate FinancingType
    if (FinancingType && FinancingType !== 'Construction' && FinancingType !== 'Permanent') {
      res.status(400).json({ success: false, error: { message: 'FinancingType must be "Construction" or "Permanent"' } });
      return;
    }

    // Default to Construction if not provided
    const finalFinancingType = FinancingType || 'Construction';

    const pool = await getConnection();
    const request = pool.request()
      .input('ProjectId', sql.Int, ProjectId)
      .input('LoanId', sql.Int, LoanId)
      .input('FinancingType', sql.NVarChar, finalFinancingType)
      .input('ProceedsDate', sql.Date, ProceedsDate)
      .input('ProceedsAmount', sql.Decimal(18, 2), ProceedsAmount)
      .input('CumulativeAmount', sql.Decimal(18, 2), CumulativeAmount)
      .input('DrawNumber', sql.Int, DrawNumber)
      .input('DrawDescription', sql.NVarChar, DrawDescription)
      .input('Notes', sql.NVarChar(sql.MAX), Notes);

    // Insert without OUTPUT clause (triggers prevent OUTPUT INSERTED.*)
    await request.query(`
      INSERT INTO banking.LoanProceeds (
        ProjectId, LoanId, FinancingType, ProceedsDate, ProceedsAmount, CumulativeAmount,
        DrawNumber, DrawDescription, Notes
      )
      VALUES (
        @ProjectId, @LoanId, @FinancingType, @ProceedsDate, @ProceedsAmount, @CumulativeAmount,
        @DrawNumber, @DrawDescription, @Notes
      )
    `);

    // Get the inserted record
    const result = await pool.request()
      .input('projectId', sql.Int, ProjectId)
      .input('proceedsDate', sql.Date, ProceedsDate)
      .input('financingType', sql.NVarChar, finalFinancingType)
      .query(`
        SELECT TOP 1 * FROM banking.LoanProceeds 
        WHERE ProjectId = @projectId AND ProceedsDate = @proceedsDate AND FinancingType = @financingType
        ORDER BY LoanProceedsId DESC
      `);

    res.status(201).json({ success: true, data: result.recordset[0] });
  } catch (error: any) {
    if (error.number === 547) {
      res.status(400).json({ success: false, error: { message: 'Invalid ProjectId or LoanId' } });
      return;
    }
    next(error);
  }
};

export const updateLoanProceeds = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const {
      ProjectId, LoanId, ProceedsDate, ProceedsAmount, CumulativeAmount,
      DrawNumber, DrawDescription, Notes
    } = req.body;

    const pool = await getConnection();
    
    // Build dynamic update query
    const updates: string[] = [];
    const request = pool.request().input('id', sql.Int, id);

    if (ProjectId !== undefined) {
      updates.push('ProjectId = @ProjectId');
      request.input('ProjectId', sql.Int, ProjectId);
    }
    if (LoanId !== undefined) {
      updates.push('LoanId = @LoanId');
      request.input('LoanId', sql.Int, LoanId);
    }
    if (ProceedsDate !== undefined) {
      updates.push('ProceedsDate = @ProceedsDate');
      request.input('ProceedsDate', sql.Date, ProceedsDate);
    }
    if (ProceedsAmount !== undefined) {
      updates.push('ProceedsAmount = @ProceedsAmount');
      request.input('ProceedsAmount', sql.Decimal(18, 2), ProceedsAmount);
    }
    if (CumulativeAmount !== undefined) {
      updates.push('CumulativeAmount = @CumulativeAmount');
      request.input('CumulativeAmount', sql.Decimal(18, 2), CumulativeAmount);
    }
    if (DrawNumber !== undefined) {
      updates.push('DrawNumber = @DrawNumber');
      request.input('DrawNumber', sql.Int, DrawNumber);
    }
    if (DrawDescription !== undefined) {
      updates.push('DrawDescription = @DrawDescription');
      request.input('DrawDescription', sql.NVarChar, DrawDescription);
    }
    if (Notes !== undefined) {
      updates.push('Notes = @Notes');
      request.input('Notes', sql.NVarChar(sql.MAX), Notes);
    }

    if (updates.length === 0) {
      res.status(400).json({ success: false, error: { message: 'No fields to update' } });
      return;
    }

    updates.push('UpdatedAt = SYSDATETIME()');

    const result = await request.query(`
      UPDATE banking.LoanProceeds
      SET ${updates.join(', ')}
      OUTPUT INSERTED.*
      WHERE LoanProceedsId = @id
    `);

    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'LoanProceeds not found' } });
      return;
    }

    res.json({ success: true, data: result.recordset[0] });
  } catch (error: any) {
    if (error.number === 547) {
      res.status(400).json({ success: false, error: { message: 'Invalid ProjectId or LoanId' } });
      return;
    }
    next(error);
  }
};

export const deleteLoanProceeds = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM banking.LoanProceeds WHERE LoanProceedsId = @id');
    
    if (result.rowsAffected[0] === 0) {
      res.status(404).json({ success: false, error: { message: 'LoanProceeds not found' } });
      return;
    }
    
    res.json({ success: true, message: 'LoanProceeds deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// GUARANTEE BURNDOWN CONTROLLER
// ============================================================

export const getAllGuaranteeBurndowns = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const pool = await getConnection();
    const result = await pool.request().query(`
      SELECT 
        gb.*,
        p.ProjectName,
        per.FullName AS GuarantorName,
        l.LoanType,
        l.LoanPhase
      FROM banking.GuaranteeBurndown gb
      LEFT JOIN core.Project p ON gb.ProjectId = p.ProjectId
      LEFT JOIN core.Person per ON gb.PersonId = per.PersonId
      LEFT JOIN banking.Loan l ON gb.LoanId = l.LoanId
      ORDER BY gb.BurndownDate DESC, gb.GuaranteeBurndownId DESC
    `);
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    next(error);
  }
};

export const getGuaranteeBurndownById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT 
          gb.*,
          p.ProjectName,
          per.FullName AS GuarantorName,
          l.LoanType,
          l.LoanPhase
        FROM banking.GuaranteeBurndown gb
        LEFT JOIN core.Project p ON gb.ProjectId = p.ProjectId
        LEFT JOIN core.Person per ON gb.PersonId = per.PersonId
        LEFT JOIN banking.Loan l ON gb.LoanId = l.LoanId
        WHERE gb.GuaranteeBurndownId = @id
      `);
    
    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'GuaranteeBurndown not found' } });
      return;
    }
    
    res.json({ success: true, data: result.recordset[0] });
  } catch (error) {
    next(error);
  }
};

export const getGuaranteeBurndownsByProject = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { projectId } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('projectId', sql.Int, projectId)
      .query(`
        SELECT 
          gb.*,
          per.FullName AS GuarantorName,
          l.LoanType,
          l.LoanPhase
        FROM banking.GuaranteeBurndown gb
        LEFT JOIN core.Person per ON gb.PersonId = per.PersonId
        LEFT JOIN banking.Loan l ON gb.LoanId = l.LoanId
        WHERE gb.ProjectId = @projectId
        ORDER BY gb.BurndownDate DESC, gb.GuaranteeBurndownId DESC
      `);
    
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    next(error);
  }
};

export const getGuaranteeBurndownsByPerson = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { personId } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('personId', sql.Int, personId)
      .query(`
        SELECT 
          gb.*,
          p.ProjectName,
          l.LoanType,
          l.LoanPhase
        FROM banking.GuaranteeBurndown gb
        LEFT JOIN core.Project p ON gb.ProjectId = p.ProjectId
        LEFT JOIN banking.Loan l ON gb.LoanId = l.LoanId
        WHERE gb.PersonId = @personId
        ORDER BY gb.BurndownDate DESC, gb.GuaranteeBurndownId DESC
      `);
    
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    next(error);
  }
};

export const createGuaranteeBurndown = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      ProjectId, LoanId, FinancingType, PersonId, BurndownDate, PreviousAmount, NewAmount,
      ReductionAmount, PreviousPercent, NewPercent, BurndownReason, TriggeredBy, Notes
    } = req.body;

    if (!ProjectId || !PersonId || !BurndownDate || NewAmount === undefined) {
      res.status(400).json({ success: false, error: { message: 'ProjectId, PersonId, BurndownDate, and NewAmount are required' } });
      return;
    }

    // Validate FinancingType
    if (FinancingType && FinancingType !== 'Construction' && FinancingType !== 'Permanent') {
      res.status(400).json({ success: false, error: { message: 'FinancingType must be "Construction" or "Permanent"' } });
      return;
    }

    // Default to Construction if not provided
    const finalFinancingType = FinancingType || 'Construction';

    // Calculate ReductionAmount if not provided
    const calculatedReductionAmount = ReductionAmount !== undefined 
      ? ReductionAmount 
      : (PreviousAmount !== undefined && PreviousAmount !== null) 
        ? PreviousAmount - NewAmount 
        : null;

    const pool = await getConnection();
    const request = pool.request()
      .input('ProjectId', sql.Int, ProjectId)
      .input('LoanId', sql.Int, LoanId)
      .input('FinancingType', sql.NVarChar, finalFinancingType)
      .input('PersonId', sql.Int, PersonId)
      .input('BurndownDate', sql.Date, BurndownDate)
      .input('PreviousAmount', sql.Decimal(18, 2), PreviousAmount)
      .input('NewAmount', sql.Decimal(18, 2), NewAmount)
      .input('ReductionAmount', sql.Decimal(18, 2), calculatedReductionAmount)
      .input('PreviousPercent', sql.Decimal(10, 4), PreviousPercent)
      .input('NewPercent', sql.Decimal(10, 4), NewPercent)
      .input('BurndownReason', sql.NVarChar, BurndownReason)
      .input('TriggeredBy', sql.NVarChar, TriggeredBy)
      .input('Notes', sql.NVarChar(sql.MAX), Notes);

    // Insert without OUTPUT clause (triggers prevent OUTPUT INSERTED.*)
    await request.query(`
      INSERT INTO banking.GuaranteeBurndown (
        ProjectId, LoanId, FinancingType, PersonId, BurndownDate, PreviousAmount, NewAmount,
        ReductionAmount, PreviousPercent, NewPercent, BurndownReason, TriggeredBy, Notes
      )
      VALUES (
        @ProjectId, @LoanId, @FinancingType, @PersonId, @BurndownDate, @PreviousAmount, @NewAmount,
        @ReductionAmount, @PreviousPercent, @NewPercent, @BurndownReason, @TriggeredBy, @Notes
      )
    `);

    // Get the inserted record
    const result = await pool.request()
      .input('projectId', sql.Int, ProjectId)
      .input('personId', sql.Int, PersonId)
      .input('burndownDate', sql.Date, BurndownDate)
      .input('financingType', sql.NVarChar, finalFinancingType)
      .query(`
        SELECT TOP 1 * FROM banking.GuaranteeBurndown 
        WHERE ProjectId = @projectId AND PersonId = @personId AND BurndownDate = @burndownDate AND FinancingType = @financingType
        ORDER BY GuaranteeBurndownId DESC
      `);

    res.status(201).json({ success: true, data: result.recordset[0] });
  } catch (error: any) {
    if (error.number === 547) {
      res.status(400).json({ success: false, error: { message: 'Invalid ProjectId, LoanId, or PersonId' } });
      return;
    }
    next(error);
  }
};

export const updateGuaranteeBurndown = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const {
      ProjectId, LoanId, PersonId, BurndownDate, PreviousAmount, NewAmount,
      ReductionAmount, PreviousPercent, NewPercent, BurndownReason, TriggeredBy, Notes
    } = req.body;

    const pool = await getConnection();
    
    // Build dynamic update query
    const updates: string[] = [];
    const request = pool.request().input('id', sql.Int, id);

    if (ProjectId !== undefined) {
      updates.push('ProjectId = @ProjectId');
      request.input('ProjectId', sql.Int, ProjectId);
    }
    if (LoanId !== undefined) {
      updates.push('LoanId = @LoanId');
      request.input('LoanId', sql.Int, LoanId);
    }
    if (PersonId !== undefined) {
      updates.push('PersonId = @PersonId');
      request.input('PersonId', sql.Int, PersonId);
    }
    if (BurndownDate !== undefined) {
      updates.push('BurndownDate = @BurndownDate');
      request.input('BurndownDate', sql.Date, BurndownDate);
    }
    if (PreviousAmount !== undefined) {
      updates.push('PreviousAmount = @PreviousAmount');
      request.input('PreviousAmount', sql.Decimal(18, 2), PreviousAmount);
    }
    if (NewAmount !== undefined) {
      updates.push('NewAmount = @NewAmount');
      request.input('NewAmount', sql.Decimal(18, 2), NewAmount);
    }
    if (ReductionAmount !== undefined) {
      updates.push('ReductionAmount = @ReductionAmount');
      request.input('ReductionAmount', sql.Decimal(18, 2), ReductionAmount);
    }
    if (PreviousPercent !== undefined) {
      updates.push('PreviousPercent = @PreviousPercent');
      request.input('PreviousPercent', sql.Decimal(10, 4), PreviousPercent);
    }
    if (NewPercent !== undefined) {
      updates.push('NewPercent = @NewPercent');
      request.input('NewPercent', sql.Decimal(10, 4), NewPercent);
    }
    if (BurndownReason !== undefined) {
      updates.push('BurndownReason = @BurndownReason');
      request.input('BurndownReason', sql.NVarChar, BurndownReason);
    }
    if (TriggeredBy !== undefined) {
      updates.push('TriggeredBy = @TriggeredBy');
      request.input('TriggeredBy', sql.NVarChar, TriggeredBy);
    }
    if (Notes !== undefined) {
      updates.push('Notes = @Notes');
      request.input('Notes', sql.NVarChar(sql.MAX), Notes);
    }

    if (updates.length === 0) {
      res.status(400).json({ success: false, error: { message: 'No fields to update' } });
      return;
    }

    updates.push('UpdatedAt = SYSDATETIME()');

    const result = await request.query(`
      UPDATE banking.GuaranteeBurndown
      SET ${updates.join(', ')}
      OUTPUT INSERTED.*
      WHERE GuaranteeBurndownId = @id
    `);

    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'GuaranteeBurndown not found' } });
      return;
    }

    res.json({ success: true, data: result.recordset[0] });
  } catch (error: any) {
    if (error.number === 547) {
      res.status(400).json({ success: false, error: { message: 'Invalid ProjectId, LoanId, or PersonId' } });
      return;
    }
    next(error);
  }
};

export const deleteGuaranteeBurndown = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM banking.GuaranteeBurndown WHERE GuaranteeBurndownId = @id');
    
    if (result.rowsAffected[0] === 0) {
      res.status(404).json({ success: false, error: { message: 'GuaranteeBurndown not found' } });
      return;
    }
    
    res.json({ success: true, message: 'GuaranteeBurndown deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// BANKING FILES (per-project file uploads for Banking Dashboard)
// ============================================================

export const listBankingFiles = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    if (isNaN(projectId)) {
      res.status(400).json({ success: false, error: { message: 'Invalid project id' } });
      return;
    }
    const pool = await getConnection();
    const result = await pool.request()
      .input('projectId', sql.Int, projectId)
      .query(`
        SELECT BankingFileId, ProjectId, FileName, ContentType, FileSizeBytes, CreatedAt
        FROM banking.BankingFile
        WHERE ProjectId = @projectId
        ORDER BY CreatedAt DESC
      `);
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    next(error);
  }
};

export const uploadBankingFile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    if (isNaN(projectId)) {
      res.status(400).json({ success: false, error: { message: 'Invalid project id' } });
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
      .input('projectId', sql.Int, projectId)
      .query('SELECT 1 FROM core.Project WHERE ProjectId = @projectId');
    if (exists.recordset.length === 0) {
      try { if (file.path) fs.unlinkSync(file.path); } catch (_) {}
      res.status(404).json({ success: false, error: { message: 'Project not found' } });
      return;
    }
    let storagePath: string;
    const fileName = file.originalname || (file.path ? path.basename(file.path) : 'file');
    const contentType = file.mimetype || null;
    const fileSize = file.size ?? (file.buffer ? file.buffer.length : null);
    if (isBlobStorageConfigured() && file.buffer) {
      storagePath = buildBankingFileStoragePath(projectId, fileName);
      await uploadBufferToBlob(storagePath, file.buffer, contentType || undefined);
      if (!(await blobExists(storagePath))) {
        throw new Error('Upload to Azure succeeded but blob was not found; not saving record.');
      }
    } else if (file.path) {
      storagePath = getRelativeStoragePath(file.path);
    } else {
      res.status(500).json({ success: false, error: { message: 'Azure Blob configured but file buffer missing' } });
      return;
    }
    const result = await pool.request()
      .input('ProjectId', sql.Int, projectId)
      .input('FileName', sql.NVarChar(255), fileName)
      .input('StoragePath', sql.NVarChar(1000), storagePath)
      .input('ContentType', sql.NVarChar(100), contentType)
      .input('FileSizeBytes', sql.BigInt, fileSize)
      .query(`
        INSERT INTO banking.BankingFile (ProjectId, FileName, StoragePath, ContentType, FileSizeBytes)
        OUTPUT INSERTED.BankingFileId, INSERTED.ProjectId, INSERTED.FileName, INSERTED.ContentType, INSERTED.FileSizeBytes, INSERTED.CreatedAt
        VALUES (@ProjectId, @FileName, @StoragePath, @ContentType, @FileSizeBytes)
      `);
    res.status(201).json({ success: true, data: result.recordset[0] });
  } catch (error) {
    next(error);
  }
};

export const downloadBankingFile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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
      .query('SELECT FileName, StoragePath, ContentType FROM banking.BankingFile WHERE BankingFileId = @id');
    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'File not found' } });
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
            ? 'Record exists but file was not found in Azure Blob.'
            : 'Record exists but file is missing on disk.',
        },
      });
      return;
    }
    res.setHeader('Content-Type', row.ContentType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(row.FileName)}"`);
    res.sendFile(path.resolve(fullPath));
  } catch (error) {
    next(error);
  }
};

export const deleteBankingFile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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
      .query('SELECT StoragePath FROM banking.BankingFile WHERE BankingFileId = @id');
    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'File not found' } });
      return;
    }
    const storagePath = result.recordset[0].StoragePath;
    await pool.request().input('id', sql.Int, id).query('DELETE FROM banking.BankingFile WHERE BankingFileId = @id');
    if (isBlobStorageConfigured()) {
      await deleteBlobFile(storagePath);
    }
    try {
      const fullPath = getFullPath(storagePath);
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    } catch (_) {}
    res.json({ success: true, message: 'File deleted' });
  } catch (error) {
    next(error);
  }
};
