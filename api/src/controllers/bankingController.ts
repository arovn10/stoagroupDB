import { Request, Response, NextFunction } from 'express';
import sql from 'mssql';
import { getConnection } from '../config/database';

// ============================================================
// LOAN CONTROLLER
// ============================================================

export const getAllLoans = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const pool = await getConnection();
    const result = await pool.request().query(`
      SELECT l.*, p.ProjectName, b.BankName as LenderName
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
      .query('SELECT * FROM banking.Loan WHERE LoanId = @id');
    
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
      .query('SELECT * FROM banking.Loan WHERE ProjectId = @projectId ORDER BY LoanId');
    
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    next(error);
  }
};

export const createLoan = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      ProjectId, BirthOrder, LoanType, Borrower, LoanPhase, LenderId,
      LoanAmount, LoanClosingDate, MaturityDate, FixedOrFloating, IndexName,
      Spread, InterestRate, MiniPermMaturity, MiniPermInterestRate,
      PermPhaseMaturity, PermPhaseInterestRate, ConstructionCompletionDate,
      LeaseUpCompletedDate, IOMaturityDate, PermanentCloseDate,
      PermanentLoanAmount, Notes
    } = req.body;

    if (!ProjectId || !LoanPhase) {
      res.status(400).json({ success: false, error: { message: 'ProjectId and LoanPhase are required' } });
      return;
    }

    const pool = await getConnection();
    const result = await pool.request()
      .input('ProjectId', sql.Int, ProjectId)
      .input('BirthOrder', sql.Int, BirthOrder)
      .input('LoanType', sql.NVarChar, LoanType)
      .input('Borrower', sql.NVarChar, Borrower)
      .input('LoanPhase', sql.NVarChar, LoanPhase)
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
      .input('LeaseUpCompletedDate', sql.NVarChar, LeaseUpCompletedDate)
      .input('IOMaturityDate', sql.Date, IOMaturityDate)
      .input('PermanentCloseDate', sql.Date, PermanentCloseDate)
      .input('PermanentLoanAmount', sql.Decimal(18, 2), PermanentLoanAmount)
      .input('Notes', sql.NVarChar(sql.MAX), Notes)
      .query(`
        INSERT INTO banking.Loan (
          ProjectId, BirthOrder, LoanType, Borrower, LoanPhase, LenderId,
          LoanAmount, LoanClosingDate, MaturityDate, FixedOrFloating, IndexName,
          Spread, InterestRate, MiniPermMaturity, MiniPermInterestRate,
          PermPhaseMaturity, PermPhaseInterestRate, ConstructionCompletionDate,
          LeaseUpCompletedDate, IOMaturityDate, PermanentCloseDate,
          PermanentLoanAmount, Notes
        )
        OUTPUT INSERTED.*
        VALUES (
          @ProjectId, @BirthOrder, @LoanType, @Borrower, @LoanPhase, @LenderId,
          @LoanAmount, @LoanClosingDate, @MaturityDate, @FixedOrFloating, @IndexName,
          @Spread, @InterestRate, @MiniPermMaturity, @MiniPermInterestRate,
          @PermPhaseMaturity, @PermPhaseInterestRate, @ConstructionCompletionDate,
          @LeaseUpCompletedDate, @IOMaturityDate, @PermanentCloseDate,
          @PermanentLoanAmount, @Notes
        )
      `);

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

    const result = await request.query(`
      UPDATE banking.Loan
      SET ${fields.join(', ')}
      OUTPUT INSERTED.*
      WHERE LoanId = @id
    `);

    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Loan not found' } });
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
    const { ProjectId, LoanId, TestNumber, TestDate, ProjectedInterestRate, Requirement, ProjectedValue } = req.body;

    if (!ProjectId || !TestNumber) {
      res.status(400).json({ success: false, error: { message: 'ProjectId and TestNumber are required' } });
      return;
    }

    const pool = await getConnection();
    const result = await pool.request()
      .input('ProjectId', sql.Int, ProjectId)
      .input('LoanId', sql.Int, LoanId)
      .input('TestNumber', sql.Int, TestNumber)
      .input('TestDate', sql.Date, TestDate)
      .input('ProjectedInterestRate', sql.NVarChar, ProjectedInterestRate)
      .input('Requirement', sql.Decimal(10, 2), Requirement)
      .input('ProjectedValue', sql.NVarChar, ProjectedValue)
      .query(`
        INSERT INTO banking.DSCRTest (ProjectId, LoanId, TestNumber, TestDate, ProjectedInterestRate, Requirement, ProjectedValue)
        OUTPUT INSERTED.*
        VALUES (@ProjectId, @LoanId, @TestNumber, @TestDate, @ProjectedInterestRate, @Requirement, @ProjectedValue)
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
    const { ProjectId, LoanId, TestNumber, TestDate, ProjectedInterestRate, Requirement, ProjectedValue } = req.body;

    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .input('ProjectId', sql.Int, ProjectId)
      .input('LoanId', sql.Int, LoanId)
      .input('TestNumber', sql.Int, TestNumber)
      .input('TestDate', sql.Date, TestDate)
      .input('ProjectedInterestRate', sql.NVarChar, ProjectedInterestRate)
      .input('Requirement', sql.Decimal(10, 2), Requirement)
      .input('ProjectedValue', sql.NVarChar, ProjectedValue)
      .query(`
        UPDATE banking.DSCRTest
        SET ProjectId = @ProjectId, LoanId = @LoanId, TestNumber = @TestNumber,
            TestDate = @TestDate, ProjectedInterestRate = @ProjectedInterestRate,
            Requirement = @Requirement, ProjectedValue = @ProjectedValue
        OUTPUT INSERTED.*
        WHERE DSCRTestId = @id
      `);

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
      SELECT p.*, pr.ProjectName, b.BankName
      FROM banking.Participation p
      LEFT JOIN core.Project pr ON p.ProjectId = pr.ProjectId
      LEFT JOIN core.Bank b ON p.BankId = b.BankId
      ORDER BY p.ParticipationId
    `);
    res.json({ success: true, data: result.recordset });
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
      .query('SELECT * FROM banking.Participation WHERE ProjectId = @projectId ORDER BY ParticipationId');
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    next(error);
  }
};

export const createParticipation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { ProjectId, LoanId, BankId, ParticipationPercent, ExposureAmount, PaidOff, Notes } = req.body;

    if (!ProjectId || !BankId) {
      res.status(400).json({ success: false, error: { message: 'ProjectId and BankId are required' } });
      return;
    }

    const pool = await getConnection();
    const result = await pool.request()
      .input('ProjectId', sql.Int, ProjectId)
      .input('LoanId', sql.Int, LoanId)
      .input('BankId', sql.Int, BankId)
      .input('ParticipationPercent', sql.NVarChar, ParticipationPercent)
      .input('ExposureAmount', sql.Decimal(18, 2), ExposureAmount)
      .input('PaidOff', sql.Bit, PaidOff)
      .input('Notes', sql.NVarChar(sql.MAX), Notes)
      .query(`
        INSERT INTO banking.Participation (ProjectId, LoanId, BankId, ParticipationPercent, ExposureAmount, PaidOff, Notes)
        OUTPUT INSERTED.*
        VALUES (@ProjectId, @LoanId, @BankId, @ParticipationPercent, @ExposureAmount, @PaidOff, @Notes)
      `);

    res.status(201).json({ success: true, data: result.recordset[0] });
  } catch (error: any) {
    if (error.number === 547) {
      res.status(400).json({ success: false, error: { message: 'Invalid ProjectId, LoanId, or BankId' } });
      return;
    }
    next(error);
  }
};

export const updateParticipation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const { ProjectId, LoanId, BankId, ParticipationPercent, ExposureAmount, PaidOff, Notes } = req.body;

    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .input('ProjectId', sql.Int, ProjectId)
      .input('LoanId', sql.Int, LoanId)
      .input('BankId', sql.Int, BankId)
      .input('ParticipationPercent', sql.NVarChar, ParticipationPercent)
      .input('ExposureAmount', sql.Decimal(18, 2), ExposureAmount)
      .input('PaidOff', sql.Bit, PaidOff)
      .input('Notes', sql.NVarChar(sql.MAX), Notes)
      .query(`
        UPDATE banking.Participation
        SET ProjectId = @ProjectId, LoanId = @LoanId, BankId = @BankId,
            ParticipationPercent = @ParticipationPercent, ExposureAmount = @ExposureAmount,
            PaidOff = @PaidOff, Notes = @Notes
        OUTPUT INSERTED.*
        WHERE ParticipationId = @id
      `);

    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Participation not found' } });
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
    const { ProjectId, LoanId, PersonId, GuaranteePercent, GuaranteeAmount, Notes } = req.body;

    if (!ProjectId || !PersonId) {
      res.status(400).json({ success: false, error: { message: 'ProjectId and PersonId are required' } });
      return;
    }

    const pool = await getConnection();
    const result = await pool.request()
      .input('ProjectId', sql.Int, ProjectId)
      .input('LoanId', sql.Int, LoanId)
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
      res.status(400).json({ success: false, error: { message: 'Invalid ProjectId, LoanId, or PersonId' } });
      return;
    }
    next(error);
  }
};

export const updateGuarantee = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const { ProjectId, LoanId, PersonId, GuaranteePercent, GuaranteeAmount, Notes } = req.body;

    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .input('ProjectId', sql.Int, ProjectId)
      .input('LoanId', sql.Int, LoanId)
      .input('PersonId', sql.Int, PersonId)
      .input('GuaranteePercent', sql.Decimal(10, 4), GuaranteePercent)
      .input('GuaranteeAmount', sql.Decimal(18, 2), GuaranteeAmount)
      .input('Notes', sql.NVarChar(sql.MAX), Notes)
      .query(`
        UPDATE banking.Guarantee
        SET ProjectId = @ProjectId, LoanId = @LoanId, PersonId = @PersonId,
            GuaranteePercent = @GuaranteePercent, GuaranteeAmount = @GuaranteeAmount, Notes = @Notes
        OUTPUT INSERTED.*
        WHERE GuaranteeId = @id
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
    const { ProjectId, LoanId, CovenantType, CovenantDate, Requirement, ProjectedValue, Notes } = req.body;

    if (!ProjectId || !CovenantType) {
      res.status(400).json({ success: false, error: { message: 'ProjectId and CovenantType are required' } });
      return;
    }

    const pool = await getConnection();
    const result = await pool.request()
      .input('ProjectId', sql.Int, ProjectId)
      .input('LoanId', sql.Int, LoanId)
      .input('CovenantType', sql.NVarChar, CovenantType)
      .input('CovenantDate', sql.Date, CovenantDate)
      .input('Requirement', sql.NVarChar, Requirement)
      .input('ProjectedValue', sql.NVarChar, ProjectedValue)
      .input('Notes', sql.NVarChar(sql.MAX), Notes)
      .query(`
        INSERT INTO banking.Covenant (ProjectId, LoanId, CovenantType, CovenantDate, Requirement, ProjectedValue, Notes)
        OUTPUT INSERTED.*
        VALUES (@ProjectId, @LoanId, @CovenantType, @CovenantDate, @Requirement, @ProjectedValue, @Notes)
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

export const updateCovenant = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const { ProjectId, LoanId, CovenantType, CovenantDate, Requirement, ProjectedValue, Notes } = req.body;

    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .input('ProjectId', sql.Int, ProjectId)
      .input('LoanId', sql.Int, LoanId)
      .input('CovenantType', sql.NVarChar, CovenantType)
      .input('CovenantDate', sql.Date, CovenantDate)
      .input('Requirement', sql.NVarChar, Requirement)
      .input('ProjectedValue', sql.NVarChar, ProjectedValue)
      .input('Notes', sql.NVarChar(sql.MAX), Notes)
      .query(`
        UPDATE banking.Covenant
        SET ProjectId = @ProjectId, LoanId = @LoanId, CovenantType = @CovenantType,
            CovenantDate = @CovenantDate, Requirement = @Requirement,
            ProjectedValue = @ProjectedValue, Notes = @Notes
        OUTPUT INSERTED.*
        WHERE CovenantId = @id
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
    const { ProjectId, LoanId, TotalAmount, LendingBankAmount, Notes } = req.body;

    if (!ProjectId) {
      res.status(400).json({ success: false, error: { message: 'ProjectId is required' } });
      return;
    }

    const pool = await getConnection();
    const result = await pool.request()
      .input('ProjectId', sql.Int, ProjectId)
      .input('LoanId', sql.Int, LoanId)
      .input('TotalAmount', sql.Decimal(18, 2), TotalAmount)
      .input('LendingBankAmount', sql.Decimal(18, 2), LendingBankAmount)
      .input('Notes', sql.NVarChar(sql.MAX), Notes)
      .query(`
        INSERT INTO banking.LiquidityRequirement (ProjectId, LoanId, TotalAmount, LendingBankAmount, Notes)
        OUTPUT INSERTED.*
        VALUES (@ProjectId, @LoanId, @TotalAmount, @LendingBankAmount, @Notes)
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
    const { ProjectId, LoanId, TotalAmount, LendingBankAmount, Notes } = req.body;

    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .input('ProjectId', sql.Int, ProjectId)
      .input('LoanId', sql.Int, LoanId)
      .input('TotalAmount', sql.Decimal(18, 2), TotalAmount)
      .input('LendingBankAmount', sql.Decimal(18, 2), LendingBankAmount)
      .input('Notes', sql.NVarChar(sql.MAX), Notes)
      .query(`
        UPDATE banking.LiquidityRequirement
        SET ProjectId = @ProjectId, LoanId = @LoanId, TotalAmount = @TotalAmount,
            LendingBankAmount = @LendingBankAmount, Notes = @Notes
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
    res.json({ success: true, data: result.recordset });
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
    
    res.json({ success: true, data: result.recordset[0] });
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
      .input('State', sql.NVarChar, State)
      .input('ExposureWithStoa', sql.Decimal(18, 2), ExposureWithStoa)
      .input('ContactText', sql.NVarChar(4000), ContactText)
      .input('Comments', sql.NVarChar(sql.MAX), Comments)
      .query(`
        INSERT INTO banking.BankTarget (BankId, AssetsText, City, State, ExposureWithStoa, ContactText, Comments)
        OUTPUT INSERTED.*
        VALUES (@BankId, @AssetsText, @City, @State, @ExposureWithStoa, @ContactText, @Comments)
      `);

    res.status(201).json({ success: true, data: result.recordset[0] });
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
      .input('State', sql.NVarChar, State)
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

    res.json({ success: true, data: result.recordset[0] });
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
      SELECT ec.*, p.ProjectName, ep.PartnerName
      FROM banking.EquityCommitment ec
      LEFT JOIN core.Project p ON ec.ProjectId = p.ProjectId
      LEFT JOIN core.EquityPartner ep ON ec.EquityPartnerId = ep.EquityPartnerId
      ORDER BY ec.EquityCommitmentId
    `);
    res.json({ success: true, data: result.recordset });
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
      .query('SELECT * FROM banking.EquityCommitment WHERE EquityCommitmentId = @id');
    
    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Equity Commitment not found' } });
      return;
    }
    
    res.json({ success: true, data: result.recordset[0] });
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
      .query('SELECT * FROM banking.EquityCommitment WHERE ProjectId = @projectId ORDER BY EquityCommitmentId');
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    next(error);
  }
};

export const createEquityCommitment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      ProjectId, EquityPartnerId, EquityType, LeadPrefGroup,
      FundingDate, Amount, InterestRate, AnnualMonthly,
      BackEndKicker, LastDollar, Notes
    } = req.body;

    if (!ProjectId) {
      res.status(400).json({ success: false, error: { message: 'ProjectId is required' } });
      return;
    }

    const pool = await getConnection();
    const result = await pool.request()
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

    res.status(201).json({ success: true, data: result.recordset[0] });
  } catch (error: any) {
    if (error.number === 547) {
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
      BackEndKicker, LastDollar, Notes
    } = req.body;

    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
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
        UPDATE banking.EquityCommitment
        SET ProjectId = @ProjectId, EquityPartnerId = @EquityPartnerId, EquityType = @EquityType,
            LeadPrefGroup = @LeadPrefGroup, FundingDate = @FundingDate, Amount = @Amount,
            InterestRate = @InterestRate, AnnualMonthly = @AnnualMonthly,
            BackEndKicker = @BackEndKicker, LastDollar = @LastDollar, Notes = @Notes
        OUTPUT INSERTED.*
        WHERE EquityCommitmentId = @id
      `);

    if (result.recordset.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Equity Commitment not found' } });
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

