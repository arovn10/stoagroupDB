import { Router } from 'express';
import * as reviewsController from '../controllers/reviewsController';
import { authenticate } from '../middleware/authMiddleware';

const router = Router();

// List reviews (filters: property, sentiment, category, from, to, limit, includeOnlyReport)
router.get('/', reviewsController.getReviews);

// Active properties with review config (for dashboard + scraper)
router.get('/properties', reviewsController.getReviewProperties);

// Update property review config (GoogleMapsUrl, IncludeInReviewsReport) — admin
router.put('/properties/:projectId/config', authenticate, reviewsController.updatePropertyReviewConfig);

// Bulk upsert reviews (scraper)
router.post('/bulk', reviewsController.bulkUpsertReviews);

export default router;
