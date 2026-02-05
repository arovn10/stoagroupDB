import { Router } from 'express';
import * as bankingController from '../controllers/bankingController';
import { authenticate } from '../middleware/authMiddleware';
import { bankingFileUpload } from '../middleware/uploadMiddleware';

const router = Router();

// Loan routes
router.get('/loans', bankingController.getAllLoans);
router.get('/loans/project/:projectId', bankingController.getLoansByProject);
router.get('/loans/:id/participation-summary', bankingController.getLoanParticipationSummary);
router.post('/loans/:targetLoanId/copy-from/:sourceLoanId', authenticate, bankingController.copyFromLoan); // Must be before /loans/:id
router.get('/loans/:id', bankingController.getLoanById);
// Write operations require authentication
router.post('/loans', authenticate, bankingController.createLoan);
router.put('/loans/:id', authenticate, bankingController.updateLoan);
router.put('/loans/project/:projectId', authenticate, bankingController.updateLoanByProject); // Convenience: update by ProjectId
router.delete('/loans/:id', authenticate, bankingController.deleteLoan);

// Loan types (Loan Creation Wizard)
router.get('/loan-types', bankingController.getAllLoanTypes);
router.get('/loan-types/:id', bankingController.getLoanTypeById);
router.post('/loan-types', authenticate, bankingController.createLoanType);
router.put('/loan-types/:id', authenticate, bankingController.updateLoanType);
router.delete('/loan-types/:id', authenticate, bankingController.deleteLoanType);

// Loan Modification routes (permanent debt, extensions, restructures)
router.get('/loan-modifications', bankingController.getAllLoanModifications);
router.get('/loan-modifications/:id', bankingController.getLoanModificationById);
router.get('/loan-modifications/project/:projectId', bankingController.getLoanModificationsByProject);
router.post('/loan-modifications', authenticate, bankingController.createLoanModification);
router.put('/loan-modifications/:id', authenticate, bankingController.updateLoanModification);
router.delete('/loan-modifications/:id', authenticate, bankingController.deleteLoanModification);

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

// Banking email templates (bankingnotificationguide)
router.get('/email-templates', bankingController.getBankingEmailTemplates);

// Upcoming dates reminder settings (BACKEND-GUIDE-UPCOMING-DATES-REMINDERS)
router.get('/settings/upcoming-dates-reminders', bankingController.getUpcomingDatesReminderSettings);
router.put('/settings/upcoming-dates-reminders', authenticate, bankingController.saveUpcomingDatesReminderSettings);

// Covenant routes
router.get('/covenants', bankingController.getAllCovenants);
router.get('/covenants/project/:projectId', bankingController.getCovenantsByProject);
router.post('/covenants/:id/send-reminder', authenticate, bankingController.sendCovenantReminder);
router.get('/covenants/:id', bankingController.getCovenantById);
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

// Equity Commitment Related Parties routes
router.get('/equity-commitments/:commitmentId/related-parties', bankingController.getRelatedPartiesByCommitment);
router.post('/equity-commitments/:commitmentId/related-parties', authenticate, bankingController.addRelatedParty);
router.delete('/equity-commitments/:commitmentId/related-parties/:relatedPartyId', authenticate, bankingController.removeRelatedParty);

// Loan Proceeds routes (Additional Draws/Disbursements)
router.get('/loan-proceeds', bankingController.getAllLoanProceeds);
router.get('/loan-proceeds/:id', bankingController.getLoanProceedsById);
router.get('/loan-proceeds/project/:projectId', bankingController.getLoanProceedsByProject);
router.get('/loan-proceeds/loan/:loanId', bankingController.getLoanProceedsByLoan);
// Write operations require authentication
router.post('/loan-proceeds', authenticate, bankingController.createLoanProceeds);
router.put('/loan-proceeds/:id', authenticate, bankingController.updateLoanProceeds);
router.delete('/loan-proceeds/:id', authenticate, bankingController.deleteLoanProceeds);

// Guarantee Burndown routes
router.get('/guarantee-burndowns', bankingController.getAllGuaranteeBurndowns);
router.get('/guarantee-burndowns/:id', bankingController.getGuaranteeBurndownById);
router.get('/guarantee-burndowns/project/:projectId', bankingController.getGuaranteeBurndownsByProject);
router.get('/guarantee-burndowns/person/:personId', bankingController.getGuaranteeBurndownsByPerson);
// Write operations require authentication
router.post('/guarantee-burndowns', authenticate, bankingController.createGuaranteeBurndown);
router.put('/guarantee-burndowns/:id', authenticate, bankingController.updateGuaranteeBurndown);
router.delete('/guarantee-burndowns/:id', authenticate, bankingController.deleteGuaranteeBurndown);

// Banking Files (per-project file uploads for Banking Dashboard)
router.get('/projects/:projectId/files', authenticate, bankingController.listBankingFiles);
router.post('/projects/:projectId/files', authenticate, bankingFileUpload.single('file'), bankingController.uploadBankingFile);
router.get('/files/:attachmentId/download', authenticate, bankingController.downloadBankingFile);
router.delete('/files/:attachmentId', authenticate, bankingController.deleteBankingFile);

// Presence (who's viewing the dashboard – heartbeat + list)
router.post('/presence', authenticate, bankingController.reportPresence);
router.get('/presence', authenticate, bankingController.getPresence);

export default router;

