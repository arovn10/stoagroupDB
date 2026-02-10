import { Request, Response, NextFunction } from 'express';
import sql from 'mssql';
import { getConnection } from '../config/database';

/**
 * GET /api/reviews
 * List reviews with optional filters. Returns rows matching Domo dataset shape (Property, category, sentiment, common_phrase, Review_Text, rating, etc.)
 */
export const getReviews = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { property, sentiment, category, from, to, limit = '50000', includeOnlyReport } = req.query;
    const limitNum = Math.min(50000, Math.max(1, parseInt(String(limit), 10) || 50000));
    const pool = await getConnection();
    const request = pool.request();
    request.input('limit', sql.Int, limitNum);
    if (property && typeof property === 'string') request.input('property', sql.NVarChar, property);
    if (sentiment && typeof sentiment === 'string') request.input('sentiment', sql.NVarChar, sentiment);
    if (category && typeof category === 'string') request.input('category', sql.NVarChar, category);
    if (from && typeof from === 'string') request.input('from', sql.Date, from);
    if (to && typeof to === 'string') request.input('to', sql.Date, to);

    const query = `
      SELECT
        r.ReviewId, r.ProjectId, r.Property, r.Review_Text, r.rating, r.reviewer_name,
        r.review_date, r.review_date_original, r.review_year, r.review_month, r.review_month_name, r.review_day_of_week,
        r.scraped_at, r.source, r.extraction_method, r.property_url, r.request_ip, r.request_timestamp,
        r.category, r.sentiment, r.common_phrase, r.Location, r.Total_Units, r.Birth_Order, r.Rank, r.CreatedAt
      FROM reviews.Review r
      WHERE 1=1
      ${property && typeof property === 'string' ? ' AND r.Property = @property' : ''}
      ${sentiment && typeof sentiment === 'string' ? ' AND r.sentiment = @sentiment' : ''}
      ${category && typeof category === 'string' ? ' AND r.category = @category' : ''}
      ${from && typeof from === 'string' ? ' AND r.review_date >= @from' : ''}
      ${to && typeof to === 'string' ? ' AND r.review_date <= @to' : ''}
      ${includeOnlyReport === 'true' || includeOnlyReport === '1' ? ' AND EXISTS (SELECT 1 FROM reviews.PropertyReviewConfig c WHERE c.ProjectId = r.ProjectId AND c.IncludeInReviewsReport = 1)' : ''}
      ORDER BY r.scraped_at DESC, r.review_date DESC
      OFFSET 0 ROWS FETCH NEXT @limit ROWS ONLY
    `;
    const result = await request.query(query);
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/reviews/properties
 * Active properties (Lease-Up, Stabilized) with review config (GoogleMapsUrl, IncludeInReviewsReport). For dashboard and scraper.
 */
export const getReviewProperties = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const pool = await getConnection();
    const result = await pool.request().query(`
      SELECT
        p.ProjectId,
        p.ProjectName,
        p.City,
        p.State,
        p.Region,
        p.Stage,
        p.Units,
        c.GoogleMapsUrl,
        ISNULL(c.IncludeInReviewsReport, 1) AS IncludeInReviewsReport,
        c.PropertyReviewConfigId
      FROM core.Project p
      LEFT JOIN reviews.PropertyReviewConfig c ON c.ProjectId = p.ProjectId
      WHERE LTRIM(RTRIM(ISNULL(p.Stage, N''))) IN (N'Lease-Up', N'Stabilized')
      ORDER BY p.ProjectName
    `);
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/reviews/properties/:projectId/config
 * Update GoogleMapsUrl and/or IncludeInReviewsReport (auth required). Admin-only.
 */
export const updatePropertyReviewConfig = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    const { GoogleMapsUrl, IncludeInReviewsReport } = req.body;
    if (Number.isNaN(projectId)) {
      res.status(400).json({ success: false, error: { message: 'Invalid projectId' } });
      return;
    }
    const pool = await getConnection();
    const exists = await pool.request()
      .input('ProjectId', sql.Int, projectId)
      .query('SELECT 1 FROM reviews.PropertyReviewConfig WHERE ProjectId = @ProjectId');
    if (exists.recordset.length === 0) {
      await pool.request()
        .input('ProjectId', sql.Int, projectId)
        .input('GoogleMapsUrl', sql.NVarChar, GoogleMapsUrl != null ? GoogleMapsUrl : null)
        .input('IncludeInReviewsReport', sql.Bit, IncludeInReviewsReport != null ? (IncludeInReviewsReport === true || IncludeInReviewsReport === 1) : true)
        .query(`
          INSERT INTO reviews.PropertyReviewConfig (ProjectId, GoogleMapsUrl, IncludeInReviewsReport)
          VALUES (@ProjectId, @GoogleMapsUrl, @IncludeInReviewsReport)
        `);
    } else {
      const updates: string[] = [];
      const req = pool.request().input('ProjectId', sql.Int, projectId);
      if (GoogleMapsUrl !== undefined) {
        updates.push('GoogleMapsUrl = @GoogleMapsUrl');
        req.input('GoogleMapsUrl', sql.NVarChar, GoogleMapsUrl);
      }
      if (IncludeInReviewsReport !== undefined) {
        updates.push('IncludeInReviewsReport = @IncludeInReviewsReport');
        req.input('IncludeInReviewsReport', sql.Bit, IncludeInReviewsReport === true || IncludeInReviewsReport === 1);
      }
      if (updates.length) {
        updates.push('UpdatedAt = SYSDATETIME()');
        await req.query(`
          UPDATE reviews.PropertyReviewConfig SET ${updates.join(', ')} WHERE ProjectId = @ProjectId
        `);
      }
    }
    const updated = await pool.request()
      .input('ProjectId', sql.Int, projectId)
      .query(`
        SELECT p.ProjectId, p.ProjectName, c.GoogleMapsUrl, c.IncludeInReviewsReport
        FROM core.Project p
        LEFT JOIN reviews.PropertyReviewConfig c ON c.ProjectId = p.ProjectId
        WHERE p.ProjectId = @ProjectId
      `);
    res.json({ success: true, data: updated.recordset[0] });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/reviews/bulk
 * Upsert reviews (scraper). Dedupe by same Property+reviewer_name+review_date_original+text; duplicates are skipped.
 * Body: { reviews: [ { Property, Review_Text, rating, reviewer_name, review_date, review_date_original, scraped_at, source, extraction_method, property_url, category, sentiment, common_phrase, review_year, review_month, review_month_name, review_day_of_week, Location, Total_Units, Birth_Order, Rank, request_ip, request_timestamp?, ProjectId? }, ... ] }
 */
export const bulkUpsertReviews = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { reviews } = req.body;
    if (!Array.isArray(reviews) || reviews.length === 0) {
      res.status(400).json({ success: false, error: { message: 'Body must contain reviews array' } });
      return;
    }
    const pool = await getConnection();
    let inserted = 0;
    let skipped = 0;
    for (const r of reviews) {
      try {
        await pool.request()
          .input('ProjectId', sql.Int, r.ProjectId ?? null)
          .input('Property', sql.NVarChar, r.Property ?? '')
          .input('Review_Text', sql.NVarChar(sql.MAX), r.Review_Text ?? r.review_text ?? null)
          .input('rating', sql.Decimal(5, 2), r.rating ?? null)
          .input('reviewer_name', sql.NVarChar, r.reviewer_name ?? null)
          .input('review_date', sql.Date, r.review_date ?? null)
          .input('review_date_original', sql.NVarChar, r.review_date_original ?? null)
          .input('review_year', sql.Int, r.review_year ?? null)
          .input('review_month', sql.Int, r.review_month ?? null)
          .input('review_month_name', sql.NVarChar, r.review_month_name ?? null)
          .input('review_day_of_week', sql.NVarChar, r.review_day_of_week ?? null)
          .input('scraped_at', sql.DateTime2, r.scraped_at ?? null)
          .input('source', sql.NVarChar, r.source ?? null)
          .input('extraction_method', sql.NVarChar, r.extraction_method ?? null)
          .input('property_url', sql.NVarChar, r.property_url ?? null)
          .input('request_ip', sql.NVarChar, r.request_ip ?? null)
          .input('request_timestamp', sql.DateTime2, r.request_timestamp ?? null)
          .input('category', sql.NVarChar, r.category ?? null)
          .input('sentiment', sql.NVarChar, r.sentiment ?? null)
          .input('common_phrase', sql.NVarChar, r.common_phrase ?? null)
          .input('Location', sql.NVarChar, r.Location ?? null)
          .input('Total_Units', sql.Int, r.Total_Units ?? null)
          .input('Birth_Order', sql.Int, r.Birth_Order ?? null)
          .input('Rank', sql.Int, r.Rank ?? null)
          .query(`
            INSERT INTO reviews.Review (
              ProjectId, Property, Review_Text, rating, reviewer_name, review_date, review_date_original,
              review_year, review_month, review_month_name, review_day_of_week,
              scraped_at, source, extraction_method, property_url, request_ip, request_timestamp,
              category, sentiment, common_phrase, Location, Total_Units, Birth_Order, Rank
            )
            VALUES (
              @ProjectId, @Property, @Review_Text, @rating, @reviewer_name, @review_date, @review_date_original,
              @review_year, @review_month, @review_month_name, @review_day_of_week,
              @scraped_at, @source, @extraction_method, @property_url, @request_ip, @request_timestamp,
              @category, @sentiment, @common_phrase, @Location, @Total_Units, @Birth_Order, @Rank
            )
          `);
        inserted++;
      } catch (err: any) {
        const code = err.number ?? err.code;
        if (code === 2627 || code === 2601) {
          skipped++;
        } else {
          throw err;
        }
      }
    }
    res.json({ success: true, data: { inserted, skipped, total: reviews.length } });
  } catch (error) {
    next(error);
  }
};
