import { Router } from 'express';
import * as bankingController from '../controllers/bankingController';
import { authenticate } from '../middleware/authMiddleware';

const router = Router();

// Loan routes
router.get('/loans', bankingController.getAllLoans);
router.get('/loans/:id', bankingController.getLoanById);
router.get('/loans/project/:projectId', bankingController.getLoansByProject);
// Write operations require authentication
router.post('/loans', authenticate, bankingController.createLoan);
router.put('/loans/:id', authenticate, bankingController.updateLoan);
router.put('/loans/project/:projectId', authenticate, bankingController.updateLoanByProject); // Convenience: update by ProjectId
router.delete('/loans/:id', authenticate, bankingController.deleteLoan);

// DSCR Test routes
router.get('/dscr-tests', bankingController.getAllDSCRTests);
router.get('/dscr-tests/:id', bankingController.getDSCRTestById);
router.get('/dscr-tests/project/:projectId', bankingController.getDSCRTestsByProject);
// Write operations require authentication
router.post('/dscr-tests', authenticate, bankingController.createDSCRTest);
router.put('/dscr-tests/:id', authenticate, bankingController.updateDSCRTest);
router.delete('/dscr-tests/:id', authenticate, bankingController.deleteDSCRTest);

// Participation routes
router.get('/participations', bankingController.getAllParticipations);
router.get('/participations/:id', bankingController.getParticipationById);
router.get('/participations/project/:projectId', bankingController.getParticipationsByProject);
// Write operations require authentication
router.post('/participations', authenticate, bankingController.createParticipation);
router.post('/participations/project/:projectId', authenticate, bankingController.createParticipationByProject); // Convenience: create by ProjectId
router.put('/participations/:id', authenticate, bankingController.updateParticipation);
router.delete('/participations/:id', authenticate, bankingController.deleteParticipation);

// Guarantee routes
router.get('/guarantees', bankingController.getAllGuarantees);
router.get('/guarantees/:id', bankingController.getGuaranteeById);
router.get('/guarantees/project/:projectId', bankingController.getGuaranteesByProject);
// Write operations require authentication
router.post('/guarantees', authenticate, bankingController.createGuarantee);
router.post('/guarantees/project/:projectId', authenticate, bankingController.createGuaranteeByProject); // Convenience: create by ProjectId
router.put('/guarantees/:id', authenticate, bankingController.updateGuarantee);
router.delete('/guarantees/:id', authenticate, bankingController.deleteGuarantee);

// Covenant routes
router.get('/covenants', bankingController.getAllCovenants);
router.get('/covenants/:id', bankingController.getCovenantById);
router.get('/covenants/project/:projectId', bankingController.getCovenantsByProject);
// Write operations require authentication
router.post('/covenants', authenticate, bankingController.createCovenant);
router.post('/covenants/project/:projectId', authenticate, bankingController.createCovenantByProject); // Convenience: create by ProjectId
router.put('/covenants/:id', authenticate, bankingController.updateCovenant);
router.delete('/covenants/:id', authenticate, bankingController.deleteCovenant);

// Liquidity Requirement routes
router.get('/liquidity-requirements', bankingController.getAllLiquidityRequirements);
router.get('/liquidity-requirements/:id', bankingController.getLiquidityRequirementById);
router.get('/liquidity-requirements/project/:projectId', bankingController.getLiquidityRequirementsByProject);
// Write operations require authentication
router.post('/liquidity-requirements', authenticate, bankingController.createLiquidityRequirement);
router.put('/liquidity-requirements/:id', authenticate, bankingController.updateLiquidityRequirement);
router.delete('/liquidity-requirements/:id', authenticate, bankingController.deleteLiquidityRequirement);

// Bank Target routes
router.get('/bank-targets', bankingController.getAllBankTargets);
router.get('/bank-targets/:id', bankingController.getBankTargetById);
// Write operations require authentication
router.post('/bank-targets', authenticate, bankingController.createBankTarget);
router.put('/bank-targets/:id', authenticate, bankingController.updateBankTarget);
router.delete('/bank-targets/:id', authenticate, bankingController.deleteBankTarget);

// Equity Commitment routes
router.get('/equity-commitments', bankingController.getAllEquityCommitments);
router.get('/equity-commitments/:id', bankingController.getEquityCommitmentById);
router.get('/equity-commitments/project/:projectId', bankingController.getEquityCommitmentsByProject);
// Write operations require authentication
router.post('/equity-commitments', authenticate, bankingController.createEquityCommitment);
router.put('/equity-commitments/:id', authenticate, bankingController.updateEquityCommitment);
router.delete('/equity-commitments/:id', authenticate, bankingController.deleteEquityCommitment);

export default router;

