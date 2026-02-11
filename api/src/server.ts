// Ensure Node.js crypto is loaded and available globally (required for attachment download/signing and deps that expect global crypto)
import nodeCrypto from 'crypto';
(globalThis as Record<string, unknown>).crypto = nodeCrypto;

import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import coreRoutes from './routes/coreRoutes';
import bankingRoutes from './routes/bankingRoutes';
import pipelineRoutes from './routes/pipelineRoutes';
import authRoutes from './routes/authRoutes';
import landDevelopmentRoutes from './routes/landDevelopmentRoutes';
import asanaRoutes from './routes/asanaRoutes';
import reviewsRoutes from './routes/reviewsRoutes';
import leasingRoutes from './routes/leasingRoutes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { getConnection } from './config/database';
import { ensureContainerExists } from './config/azureBlob';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGINS?.split(',') || '*',
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', async (req: Request, res: Response) => {
  try {
    await getConnection();
    res.json({
      success: true,
      message: 'API is running and database connection is active',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      message: 'API is running but database connection failed',
      timestamp: new Date().toISOString(),
    });
  }
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/core', coreRoutes);
app.use('/api/banking', bankingRoutes);
app.use('/api/pipeline', pipelineRoutes);
app.use('/api/land-development', landDevelopmentRoutes);
app.use('/api/asana', asanaRoutes);
app.use('/api/reviews', reviewsRoutes);
app.use('/api/leasing', leasingRoutes);

// API Documentation endpoint
app.get('/api', (req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'Stoa Group Database API - Write Operations Only (Domo handles GET)',
    version: '1.0.0',
    endpoints: {
      auth: {
        login: 'POST /api/auth/login',
        domo: 'POST /api/auth/domo (Domo SSO: body: { email (required), name? })',
        verify: 'GET /api/auth/verify (requires Bearer token)',
        me: 'GET /api/auth/me (requires Bearer token)',
      },
      core: {
        projects: {
          getAll: 'GET /api/core/projects',
          getById: 'GET /api/core/projects/:id',
          create: 'POST /api/core/projects',
          update: 'PUT /api/core/projects/:id',
          delete: 'DELETE /api/core/projects/:id',
        },
        banks: {
          getAll: 'GET /api/core/banks',
          getById: 'GET /api/core/banks/:id',
          create: 'POST /api/core/banks',
          update: 'PUT /api/core/banks/:id',
          delete: 'DELETE /api/core/banks/:id',
        },
        persons: {
          getAll: 'GET /api/core/persons',
          getById: 'GET /api/core/persons/:id',
          create: 'POST /api/core/persons',
          update: 'PUT /api/core/persons/:id',
          delete: 'DELETE /api/core/persons/:id',
        },
        preconManagers: {
          getAll: 'GET /api/core/precon-managers',
          getById: 'GET /api/core/precon-managers/:id',
          create: 'POST /api/core/precon-managers',
          update: 'PUT /api/core/precon-managers/:id',
          delete: 'DELETE /api/core/precon-managers/:id',
        },
        equityPartners: {
          getAll: 'GET /api/core/equity-partners',
          getById: 'GET /api/core/equity-partners/:id',
          create: 'POST /api/core/equity-partners',
          update: 'PUT /api/core/equity-partners/:id',
          delete: 'DELETE /api/core/equity-partners/:id',
        },
        productTypes: {
          getAll: 'GET /api/core/product-types',
          getById: 'GET /api/core/product-types/:id',
          create: 'POST /api/core/product-types',
          update: 'PUT /api/core/product-types/:id',
          delete: 'DELETE /api/core/product-types/:id',
        },
        regions: {
          getAll: 'GET /api/core/regions',
          getById: 'GET /api/core/regions/:id',
          create: 'POST /api/core/regions',
          update: 'PUT /api/core/regions/:id',
          delete: 'DELETE /api/core/regions/:id',
        },
      },
      banking: {
        loans: {
          getAll: 'GET /api/banking/loans',
          getById: 'GET /api/banking/loans/:id',
          getByProject: 'GET /api/banking/loans/project/:projectId',
          create: 'POST /api/banking/loans',
          update: 'PUT /api/banking/loans/:id',
          updateByProject: 'PUT /api/banking/loans/project/:projectId',
          delete: 'DELETE /api/banking/loans/:id',
        },
        dscrTests: {
          getAll: 'GET /api/banking/dscr-tests',
          getById: 'GET /api/banking/dscr-tests/:id',
          getByProject: 'GET /api/banking/dscr-tests/project/:projectId',
          create: 'POST /api/banking/dscr-tests',
          update: 'PUT /api/banking/dscr-tests/:id',
          delete: 'DELETE /api/banking/dscr-tests/:id',
        },
        participations: {
          getAll: 'GET /api/banking/participations',
          getById: 'GET /api/banking/participations/:id',
          getByProject: 'GET /api/banking/participations/project/:projectId',
          create: 'POST /api/banking/participations',
          createByProject: 'POST /api/banking/participations/project/:projectId',
          update: 'PUT /api/banking/participations/:id',
          delete: 'DELETE /api/banking/participations/:id',
        },
        guarantees: {
          getAll: 'GET /api/banking/guarantees',
          getById: 'GET /api/banking/guarantees/:id',
          getByProject: 'GET /api/banking/guarantees/project/:projectId',
          create: 'POST /api/banking/guarantees',
          createByProject: 'POST /api/banking/guarantees/project/:projectId',
          update: 'PUT /api/banking/guarantees/:id',
          delete: 'DELETE /api/banking/guarantees/:id',
        },
        covenants: {
          getAll: 'GET /api/banking/covenants',
          getById: 'GET /api/banking/covenants/:id',
          getByProject: 'GET /api/banking/covenants/project/:projectId',
          create: 'POST /api/banking/covenants',
          createByProject: 'POST /api/banking/covenants/project/:projectId',
          update: 'PUT /api/banking/covenants/:id',
          delete: 'DELETE /api/banking/covenants/:id',
        },
        liquidityRequirements: {
          getAll: 'GET /api/banking/liquidity-requirements',
          getById: 'GET /api/banking/liquidity-requirements/:id',
          getByProject: 'GET /api/banking/liquidity-requirements/project/:projectId',
          create: 'POST /api/banking/liquidity-requirements',
          update: 'PUT /api/banking/liquidity-requirements/:id',
          delete: 'DELETE /api/banking/liquidity-requirements/:id',
        },
        bankTargets: {
          getAll: 'GET /api/banking/bank-targets',
          getById: 'GET /api/banking/bank-targets/:id',
          create: 'POST /api/banking/bank-targets',
          update: 'PUT /api/banking/bank-targets/:id',
          delete: 'DELETE /api/banking/bank-targets/:id',
        },
        contacts: {
          getAll: 'GET /api/banking/contacts (?role, q)',
          getById: 'GET /api/banking/contacts/:id',
          create: 'POST /api/banking/contacts (auth)',
          update: 'PUT /api/banking/contacts/:id (auth)',
          delete: 'DELETE /api/banking/contacts/:id (auth)',
        },
        equityCommitments: {
          getAll: 'GET /api/banking/equity-commitments',
          getById: 'GET /api/banking/equity-commitments/:id',
          getByProject: 'GET /api/banking/equity-commitments/project/:projectId',
          create: 'POST /api/banking/equity-commitments',
          update: 'PUT /api/banking/equity-commitments/:id',
          delete: 'DELETE /api/banking/equity-commitments/:id',
        },
      },
      pipeline: {
        underContracts: {
          getAll: 'GET /api/pipeline/under-contracts',
          getById: 'GET /api/pipeline/under-contracts/:id',
          create: 'POST /api/pipeline/under-contracts',
          update: 'PUT /api/pipeline/under-contracts/:id',
          delete: 'DELETE /api/pipeline/under-contracts/:id',
        },
        commercialListed: {
          getAll: 'GET /api/pipeline/commercial-listed',
          getById: 'GET /api/pipeline/commercial-listed/:id',
          create: 'POST /api/pipeline/commercial-listed',
          update: 'PUT /api/pipeline/commercial-listed/:id',
          delete: 'DELETE /api/pipeline/commercial-listed/:id',
        },
        commercialAcreage: {
          getAll: 'GET /api/pipeline/commercial-acreage',
          getById: 'GET /api/pipeline/commercial-acreage/:id',
          create: 'POST /api/pipeline/commercial-acreage',
          update: 'PUT /api/pipeline/commercial-acreage/:id',
          delete: 'DELETE /api/pipeline/commercial-acreage/:id',
        },
        closedProperties: {
          getAll: 'GET /api/pipeline/closed-properties',
          getById: 'GET /api/pipeline/closed-properties/:id',
          create: 'POST /api/pipeline/closed-properties',
          update: 'PUT /api/pipeline/closed-properties/:id',
          delete: 'DELETE /api/pipeline/closed-properties/:id',
        },
        dealPipeline: {
          getAll: 'GET /api/pipeline/deal-pipeline',
          getById: 'GET /api/pipeline/deal-pipeline/:id',
          getByProjectId: 'GET /api/pipeline/deal-pipeline/project/:projectId',
          create: 'POST /api/pipeline/deal-pipeline',
          update: 'PUT /api/pipeline/deal-pipeline/:id',
          delete: 'DELETE /api/pipeline/deal-pipeline/:id',
          attachments: {
            list: 'GET /api/pipeline/deal-pipeline/:id/attachments',
            upload: 'POST /api/pipeline/deal-pipeline/:id/attachments (multipart field "file", max 200MB)',
            download: 'GET /api/pipeline/deal-pipeline/attachments/:attachmentId/download',
            update: 'PUT /api/pipeline/deal-pipeline/attachments/:attachmentId (body: { FileName?, ContentType? })',
            delete: 'DELETE /api/pipeline/deal-pipeline/attachments/:attachmentId',
          },
        },
      },
      landDevelopment: {
        contacts: {
          getAll: 'GET /api/land-development/contacts (?type, city, state, upcomingOnly, q)',
          getById: 'GET /api/land-development/contacts/:id',
          create: 'POST /api/land-development/contacts (auth)',
          update: 'PUT /api/land-development/contacts/:id (auth)',
          delete: 'DELETE /api/land-development/contacts/:id (auth)',
          sendReminder: 'POST /api/land-development/contacts/send-reminder (auth, body: contactId?, email?, message?)',
        },
      },
      asana: {
        customFields: 'GET /api/asana/custom-fields (?project; list project custom field GIDs for env)',
        upcomingTasks: 'GET /api/asana/upcoming-tasks (?workspace, project, daysAhead; tasks include start_date from custom field)',
        updateTaskDueOn: 'PUT /api/asana/tasks/:taskGid/due-on (body: { due_on: "YYYY-MM-DD" }; sets Start Date custom field only)',
        updateTaskCustomField: 'PUT /api/asana/tasks/:taskGid/custom-field (body: { field, value }; unit_count, bank, location, etc.)',
      },
      reviews: {
        getReviews: 'GET /api/reviews (?property, sentiment, category, from, to, limit, includeOnlyReport)',
        getReviewProperties: 'GET /api/reviews/properties (active Lease-Up/Stabilized + GoogleMapsUrl, IncludeInReviewsReport)',
        updatePropertyReviewConfig: 'PUT /api/reviews/properties/:projectId/config (auth; body: { GoogleMapsUrl?, IncludeInReviewsReport? })',
        bulkUpsertReviews: 'POST /api/reviews/bulk (body: { reviews: [...] }; deduped by Property+reviewer+date+text)',
      },
      leasing: {
        aggregatesAvailable: 'GET /api/leasing/aggregates/available (pre-aggregated data available?)',
        aggregates: 'GET /api/leasing/aggregates (?asOf=YYYY-MM-DD; leasingSummary, tradeoutSummary, pudSummary for million-row scaling)',
        dashboard: 'GET /api/leasing/dashboard (?asOf=YYYY-MM-DD; full pre-computed payload – all calculations on backend, frontend visual-only)',
      },
    },
  });
});

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// Start server (ensure Azure Blob container exists when blob storage is configured)
ensureContainerExists()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📚 API Documentation: http://localhost:${PORT}/api`);
      console.log(`❤️  Health Check: http://localhost:${PORT}/health`);
    });
  })
  .catch(() => {
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📚 API Documentation: http://localhost:${PORT}/api`);
      console.log(`❤️  Health Check: http://localhost:${PORT}/health`);
    });
  });

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received: closing HTTP server');
  const { closeConnection } = await import('./config/database');
  await closeConnection();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT signal received: closing HTTP server');
  const { closeConnection } = await import('./config/database');
  await closeConnection();
  process.exit(0);
});

export default app;

