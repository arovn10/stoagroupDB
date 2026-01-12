import { Router } from 'express';
import * as bankingController from '../controllers/bankingController';

const router = Router();

// Loan routes
router.get('/loans', bankingController.getAllLoans);
router.get('/loans/:id', bankingController.getLoanById);
router.get('/loans/project/:projectId', bankingController.getLoansByProject);
router.post('/loans', bankingController.createLoan);
router.put('/loans/:id', bankingController.updateLoan);
router.put('/loans/project/:projectId', bankingController.updateLoanByProject); // Convenience: update by ProjectId
router.delete('/loans/:id', bankingController.deleteLoan);

// DSCR Test routes
router.get('/dscr-tests', bankingController.getAllDSCRTests);
router.get('/dscr-tests/:id', bankingController.getDSCRTestById);
router.get('/dscr-tests/project/:projectId', bankingController.getDSCRTestsByProject);
router.post('/dscr-tests', bankingController.createDSCRTest);
router.put('/dscr-tests/:id', bankingController.updateDSCRTest);
router.delete('/dscr-tests/:id', bankingController.deleteDSCRTest);

// Participation routes
router.get('/participations', bankingController.getAllParticipations);
router.get('/participations/:id', bankingController.getParticipationById);
router.get('/participations/project/:projectId', bankingController.getParticipationsByProject);
router.post('/participations', bankingController.createParticipation);
router.post('/participations/project/:projectId', bankingController.createParticipationByProject); // Convenience: create by ProjectId
router.put('/participations/:id', bankingController.updateParticipation);
router.delete('/participations/:id', bankingController.deleteParticipation);

// Guarantee routes
router.get('/guarantees', bankingController.getAllGuarantees);
router.get('/guarantees/:id', bankingController.getGuaranteeById);
router.get('/guarantees/project/:projectId', bankingController.getGuaranteesByProject);
router.post('/guarantees', bankingController.createGuarantee);
router.post('/guarantees/project/:projectId', bankingController.createGuaranteeByProject); // Convenience: create by ProjectId
router.put('/guarantees/:id', bankingController.updateGuarantee);
router.delete('/guarantees/:id', bankingController.deleteGuarantee);

// Covenant routes
router.get('/covenants', bankingController.getAllCovenants);
router.get('/covenants/:id', bankingController.getCovenantById);
router.get('/covenants/project/:projectId', bankingController.getCovenantsByProject);
router.post('/covenants', bankingController.createCovenant);
router.post('/covenants/project/:projectId', bankingController.createCovenantByProject); // Convenience: create by ProjectId
router.put('/covenants/:id', bankingController.updateCovenant);
router.delete('/covenants/:id', bankingController.deleteCovenant);

// Liquidity Requirement routes
router.get('/liquidity-requirements', bankingController.getAllLiquidityRequirements);
router.get('/liquidity-requirements/:id', bankingController.getLiquidityRequirementById);
router.get('/liquidity-requirements/project/:projectId', bankingController.getLiquidityRequirementsByProject);
router.post('/liquidity-requirements', bankingController.createLiquidityRequirement);
router.put('/liquidity-requirements/:id', bankingController.updateLiquidityRequirement);
router.delete('/liquidity-requirements/:id', bankingController.deleteLiquidityRequirement);

// Bank Target routes
router.get('/bank-targets', bankingController.getAllBankTargets);
router.get('/bank-targets/:id', bankingController.getBankTargetById);
router.post('/bank-targets', bankingController.createBankTarget);
router.put('/bank-targets/:id', bankingController.updateBankTarget);
router.delete('/bank-targets/:id', bankingController.deleteBankTarget);

// Equity Commitment routes
router.get('/equity-commitments', bankingController.getAllEquityCommitments);
router.get('/equity-commitments/:id', bankingController.getEquityCommitmentById);
router.get('/equity-commitments/project/:projectId', bankingController.getEquityCommitmentsByProject);
router.post('/equity-commitments', bankingController.createEquityCommitment);
router.put('/equity-commitments/:id', bankingController.updateEquityCommitment);
router.delete('/equity-commitments/:id', bankingController.deleteEquityCommitment);

export default router;

