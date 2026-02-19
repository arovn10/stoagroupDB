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
      ;WITH Ranked AS (
        SELECT
          r.ReviewId, r.ProjectId, r.Property, r.Review_Text, r.rating, r.reviewer_name,
          r.review_date, r.review_date_original, r.review_year, r.review_month, r.review_month_name, r.review_day_of_week,
          r.scraped_at, r.source, r.extraction_method, r.property_url, r.request_ip, r.request_timestamp,
          r.category, r.sentiment, r.common_phrase, r.Location, r.Total_Units, r.Birth_Order, r.Rank, r.CreatedAt,
          ROW_NUMBER() OVER (
            PARTITION BY r.Property, ISNULL(r.reviewer_name,''), LEFT(ISNULL(r.Review_Text,''), 900)
            ORDER BY r.scraped_at DESC, r.ReviewId DESC
          ) AS rn
        FROM reviews.Review r
        WHERE 1=1
        ${property && typeof property === 'string' ? ' AND r.Property = @property' : ''}
        ${sentiment && typeof sentiment === 'string' ? ' AND r.sentiment = @sentiment' : ''}
        ${category && typeof category === 'string' ? ' AND r.category = @category' : ''}
        ${from && typeof from === 'string' ? ' AND r.review_date >= @from' : ''}
        ${to && typeof to === 'string' ? ' AND r.review_date <= @to' : ''}
        ${includeOnlyReport === 'true' || includeOnlyReport === '1' ? ' AND EXISTS (SELECT 1 FROM reviews.PropertyReviewConfig c WHERE c.ProjectId = r.ProjectId AND c.IncludeInReviewsReport = 1)' : ''}
      )
      SELECT ReviewId, ProjectId, Property, Review_Text, rating, reviewer_name,
        review_date, review_date_original, review_year, review_month, review_month_name, review_day_of_week,
        scraped_at, source, extraction_method, property_url, request_ip, request_timestamp,
        category, sentiment, common_phrase, Location, Total_Units, Birth_Order, Rank, CreatedAt
      FROM Ranked
      WHERE rn = 1
      ORDER BY scraped_at DESC, review_date DESC
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
export const updateReviewConfig = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    const { GoogleMapsUrl, IncludeInReviewsReport } = req.body;
    if (Number.isNaN(projectId)) {
      res.status(400).json({ success: false, error: { message: 'Invalid projectId' } });
      return;
    }
    const pool = await getConnection();
    const includeBit = IncludeInReviewsReport != null ? (IncludeInReviewsReport === true || IncludeInReviewsReport === 1) : true;
    const updateGoogleMapsUrl = GoogleMapsUrl !== undefined ? 1 : 0;
    const updateIncludeInReviewsReport = IncludeInReviewsReport !== undefined ? 1 : 0;
    const sqlReq = pool.request()
      .input('ProjectId', sql.Int, projectId)
      .input('GoogleMapsUrl', sql.NVarChar, GoogleMapsUrl != null ? GoogleMapsUrl : null)
      .input('IncludeInReviewsReport', sql.Bit, includeBit)
      .input('UpdateGoogleMapsUrl', sql.Bit, updateGoogleMapsUrl)
      .input('UpdateIncludeInReviewsReport', sql.Bit, updateIncludeInReviewsReport);
    await sqlReq.query(`
      MERGE reviews.PropertyReviewConfig AS t
      USING (SELECT @ProjectId AS ProjectId) AS s ON t.ProjectId = s.ProjectId
      WHEN MATCHED THEN
        UPDATE SET
          GoogleMapsUrl = CASE WHEN @UpdateGoogleMapsUrl = 1 THEN @GoogleMapsUrl ELSE t.GoogleMapsUrl END,
          IncludeInReviewsReport = CASE WHEN @UpdateIncludeInReviewsReport = 1 THEN @IncludeInReviewsReport ELSE t.IncludeInReviewsReport END,
          UpdatedAt = SYSDATETIME()
      WHEN NOT MATCHED BY TARGET THEN
        INSERT (ProjectId, GoogleMapsUrl, IncludeInReviewsReport)
        VALUES (@ProjectId, @GoogleMapsUrl, @IncludeInReviewsReport);
    `);
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
 * POST /api/reviews/seed-property-urls
 * Seed GoogleMapsUrl into reviews.PropertyReviewConfig for each property. Matches by ProjectName (trim, case-insensitive).
 * Body: { propertyUrls: { "Property Name": "https://www.google.com/maps/...", ... } }
 * Auth required.
 */
export const seedPropertyUrls = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { propertyUrls } = req.body;
    if (!propertyUrls || typeof propertyUrls !== 'object') {
      res.status(400).json({ success: false, error: { message: 'Body must contain propertyUrls object (property name -> Google Maps URL)' } });
      return;
    }
    const pool = await getConnection();
    const projects = await pool.request().query(`
      SELECT ProjectId, ProjectName
      FROM core.Project
      WHERE LTRIM(RTRIM(ISNULL(Stage, N''))) IN (N'Lease-Up', N'Stabilized')
    `);
    const normalize = (s: string) => (s || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const nameToId: Record<string, number> = {};
    for (const row of projects.recordset) {
      const name = normalize(row.ProjectName);
      if (name) nameToId[name] = row.ProjectId;
    }
    let updated = 0;
    const notFound: string[] = [];
    const googleMapsPrefix = 'https://www.google.com/maps';
    for (const [propName, url] of Object.entries(propertyUrls)) {
      const u = typeof url === 'string' ? url.trim() : '';
      if (!u || !u.startsWith(googleMapsPrefix)) continue;
      const projectId = nameToId[normalize(propName)];
      if (projectId == null) {
        notFound.push(propName);
        continue;
      }
      await pool.request()
        .input('ProjectId', sql.Int, projectId)
        .input('GoogleMapsUrl', sql.NVarChar, u)
        .input('IncludeInReviewsReport', sql.Bit, true)
        .input('UpdateGoogleMapsUrl', sql.Bit, 1)
        .input('UpdateIncludeInReviewsReport', sql.Bit, 0)
        .query(`
          MERGE reviews.PropertyReviewConfig AS t
          USING (SELECT @ProjectId AS ProjectId) AS s ON t.ProjectId = s.ProjectId
          WHEN MATCHED THEN
            UPDATE SET GoogleMapsUrl = @GoogleMapsUrl, UpdatedAt = SYSDATETIME()
          WHEN NOT MATCHED BY TARGET THEN
            INSERT (ProjectId, GoogleMapsUrl, IncludeInReviewsReport)
            VALUES (@ProjectId, @GoogleMapsUrl, @IncludeInReviewsReport);
        `);
      updated++;
    }
    res.json({ success: true, data: { updated, notFound } });
  } catch (error) {
    next(error);
  }
};

const EPOCH_DATE = '1969-12-31';

/** Return ISO date (YYYY-MM-DD) for the 15th of the given year and month (month 1-12), or null. */
function fifteenthOfMonth(year: number | null | undefined, month: number | null | undefined): string | null {
  if (year == null || month == null) return null;
  const y = Number(year);
  const m = Number(month);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return null;
  const d = new Date(y, m - 1, 15);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/** Parse "3 years ago", "2 months ago" etc. relative to ref, return YYYY-MM-DD with day 15 for month/year. */
function parseRelativeDate(txt: string, ref: Date): string | null {
  if (!txt || typeof txt !== 'string') return null;
  const s = txt.toLowerCase().trim();
  let m: RegExpMatchArray | null;
  // Years: "3 years ago", "a year ago"
  m = s.match(/(?:a|one|\d+)\s*years?\s*ago/);
  if (m) {
    const num = m[0].match(/\d+/);
    const years = num ? parseInt(num[0], 10) : 1;
    const d = new Date(ref);
    d.setFullYear(d.getFullYear() - years);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-15`;
  }
  // Months
  m = s.match(/(?:a|one|\d+)\s*months?\s*ago/);
  if (m) {
    const num = m[0].match(/\d+/);
    const months = num ? parseInt(num[0], 10) : 1;
    const d = new Date(ref);
    d.setMonth(d.getMonth() - months);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-15`;
  }
  // Weeks
  m = s.match(/(?:a|one|\d+)\s*weeks?\s*ago/);
  if (m) {
    const num = m[0].match(/\d+/);
    const weeks = num ? parseInt(num[0], 10) : 1;
    const d = new Date(ref);
    d.setDate(d.getDate() - weeks * 7);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  // Days: "5 days ago", "yesterday"
  if (s.includes('yesterday') || /1\s*day\s*ago/.test(s)) {
    const d = new Date(ref);
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }
  m = s.match(/(\d+)\s*days?\s*ago/);
  if (m) {
    const days = parseInt(m[1], 10);
    const d = new Date(ref);
    d.setDate(d.getDate() - days);
    return d.toISOString().slice(0, 10);
  }
  // Hours
  m = s.match(/(\d+)\s*hours?\s*ago/);
  if (m) {
    const d = new Date(ref.getTime() - parseInt(m[1], 10) * 60 * 60 * 1000);
    return d.toISOString().slice(0, 10);
  }
  return null;
}

/** Normalize review_date: never use 1969-12-31; parse "X years ago" from review_date_original using scraped_at. */
function normalizeReviewDate(r: {
  review_date?: string | null;
  review_date_original?: string | null;
  review_year?: number | null;
  review_month?: number | null;
  scraped_at?: string | null;
}): string | null {
  const raw = r.review_date ?? null;
  if (raw != null && raw !== '' && raw !== EPOCH_DATE) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) {
      const iso = d.toISOString().slice(0, 10);
      if (iso !== EPOCH_DATE) return iso;
    }
  }
  // Parse "X years ago" from review_date_original using scraped_at as reference
  const rel = (r.review_date_original ?? r.review_date ?? '').toString().trim();
  if (rel && /years?\s*ago|months?\s*ago|weeks?\s*ago|days?\s*ago|hours?\s*ago|yesterday/i.test(rel)) {
    const ref = r.scraped_at ? new Date(r.scraped_at) : new Date();
    if (!Number.isNaN(ref.getTime())) {
      const parsed = parseRelativeDate(rel, ref);
      if (parsed) return parsed;
    }
  }
  return fifteenthOfMonth(r.review_year, r.review_month) ?? null;
}

/** Normalize request_timestamp for sql.DateTime2: scraper sends integer (ms) or ISO string. */
function normalizeRequestTimestamp(value: unknown): Date | null {
  if (value == null) return null;
  if (typeof value === 'number') {
    const ms = value > 1e12 ? value : value * 1000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  return null;
}

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
        const reviewDate = normalizeReviewDate(r);
        const requestTimestamp = normalizeRequestTimestamp(r.request_timestamp);
        await pool.request()
          .input('ProjectId', sql.Int, r.ProjectId ?? null)
          .input('Property', sql.NVarChar, r.Property ?? '')
          .input('Review_Text', sql.NVarChar(sql.MAX), r.Review_Text ?? r.review_text ?? null)
          .input('rating', sql.Decimal(5, 2), r.rating ?? null)
          .input('reviewer_name', sql.NVarChar, r.reviewer_name ?? null)
          .input('review_date', sql.Date, reviewDate)
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
          .input('request_timestamp', sql.DateTime2, requestTimestamp)
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

const NORMALIZE_PROPERTY = `LTRIM(RTRIM(LOWER(ISNULL(Property, N''))))`;
const NORMALIZE_REVIEWER = `LTRIM(RTRIM(LOWER(ISNULL(reviewer_name, N''))))`;
const DEDUPE_ORDER_BY = `
  COALESCE(scraped_at, CAST('1900-01-01' AS DATETIME2)) DESC,
  COALESCE(CAST(review_date AS DATETIME2), CAST('1900-01-01' AS DATETIME2)) DESC,
  COALESCE(CreatedAt, CAST('1900-01-01' AS DATETIME2)) DESC,
  ReviewId DESC
`;

/**
 * POST /api/reviews/deduplicate
 * Remove duplicate reviews by Property+reviewer (normalized), keeping most recent.
 * Called by scraper workflow after each run. Requires header X-Dedupe-Secret matching STOA_DB_DEDUPE_SECRET.
 */
export const deduplicateReviews = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const secret = req.headers['x-dedupe-secret'] ?? req.headers['X-Dedupe-Secret'];
    const expected = process.env.STOA_DB_DEDUPE_SECRET;
    if (!expected || expected !== secret) {
      res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
      return;
    }
    const pool = await getConnection();
    const deleteSql = `
;WITH Ranked AS (
  SELECT
    ReviewId,
    ROW_NUMBER() OVER (
      PARTITION BY ${NORMALIZE_PROPERTY}, ${NORMALIZE_REVIEWER}
      ORDER BY ${DEDUPE_ORDER_BY}
    ) AS rn
  FROM reviews.Review
)
DELETE r
FROM reviews.Review r
INNER JOIN Ranked rk ON r.ReviewId = rk.ReviewId
WHERE rk.rn > 1
`;
    const result = await pool.request().query(deleteSql);
    const rowsAffected = result.rowsAffected[0] ?? 0;
    res.json({ success: true, data: { deleted: rowsAffected } });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/reviews/config/daily-alert-list
 * List recipients for the marketing daily alert email. Joins to core.Person when PersonId is set.
 */
export const getDailyAlertList = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const pool = await getConnection();
    const result = await pool.request().query(`
      SELECT
        d.Id,
        d.PersonId,
        d.Email,
        d.DisplayName,
        d.SortOrder,
        d.CreatedAt,
        p.FullName AS ContactFullName,
        CASE WHEN d.PersonId IS NOT NULL THEN 1 ELSE 0 END AS FromCoreContact
      FROM marketing.DailyAlertRecipient d
      LEFT JOIN core.Person p ON p.PersonId = d.PersonId
      ORDER BY ISNULL(d.SortOrder, 999), d.CreatedAt
    `);
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/reviews/config/daily-alert-list
 * Add a recipient: either { PersonId } (from core.contacts) or { Email, DisplayName? } (ad-hoc). Auth required.
 */
export const addDailyAlertRecipient = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { PersonId, Email, DisplayName } = req.body;
    const pool = await getConnection();

    let emailToUse: string | null = null;
    let displayNameToUse: string | null = DisplayName != null ? String(DisplayName).trim() || null : null;

    if (PersonId != null && PersonId !== '') {
      const personIdNum = parseInt(String(PersonId), 10);
      if (!Number.isFinite(personIdNum)) {
        res.status(400).json({ success: false, error: { message: 'Invalid PersonId' } });
        return;
      }
      const person = await pool.request()
        .input('PersonId', sql.Int, personIdNum)
        .query('SELECT PersonId, FullName, Email FROM core.Person WHERE PersonId = @PersonId');
      if (!person.recordset.length) {
        res.status(404).json({ success: false, error: { message: 'Contact not found' } });
        return;
      }
      const row = person.recordset[0];
      emailToUse = (row.Email && String(row.Email).trim()) || null;
      if (!emailToUse) {
        res.status(400).json({ success: false, error: { message: 'Contact has no email' } });
        return;
      }
      if (!displayNameToUse && row.FullName) displayNameToUse = String(row.FullName).trim() || null;
      await pool.request()
        .input('PersonId', sql.Int, personIdNum)
        .input('Email', sql.NVarChar(255), emailToUse)
        .input('DisplayName', sql.NVarChar(255), displayNameToUse)
        .query(`
          INSERT INTO marketing.DailyAlertRecipient (PersonId, Email, DisplayName)
          VALUES (@PersonId, @Email, @DisplayName)
        `);
    } else if (Email != null && String(Email).trim()) {
      emailToUse = String(Email).trim();
      await pool.request()
        .input('Email', sql.NVarChar(255), emailToUse)
        .input('DisplayName', sql.NVarChar(255), displayNameToUse)
        .query(`
          INSERT INTO marketing.DailyAlertRecipient (PersonId, Email, DisplayName)
          VALUES (NULL, @Email, @DisplayName)
        `);
    } else {
      res.status(400).json({ success: false, error: { message: 'Provide PersonId or Email' } });
      return;
    }

    const list = await pool.request().query(`
      SELECT d.Id, d.PersonId, d.Email, d.DisplayName, d.CreatedAt,
             CASE WHEN d.PersonId IS NOT NULL THEN 1 ELSE 0 END AS FromCoreContact
      FROM marketing.DailyAlertRecipient d
      ORDER BY d.CreatedAt DESC
    `);
    const added = list.recordset[0];
    res.status(201).json({ success: true, data: added });
  } catch (error: any) {
    if (error.number === 2627 || error.code === 2627) {
      res.status(409).json({ success: false, error: { message: 'That email is already on the list' } });
      return;
    }
    next(error);
  }
};

/**
 * DELETE /api/reviews/config/daily-alert-list/:id
 * Remove a recipient from the daily alert list. Auth required.
 */
export const deleteDailyAlertRecipient = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ success: false, error: { message: 'Invalid id' } });
      return;
    }
    const pool = await getConnection();
    const result = await pool.request().input('Id', sql.Int, id)
      .query('DELETE FROM marketing.DailyAlertRecipient WHERE Id = @Id; SELECT @@ROWCOUNT AS deleted');
    const deleted = result.recordset[0]?.deleted ?? 0;
    if (deleted === 0) {
      res.status(404).json({ success: false, error: { message: 'Recipient not found' } });
      return;
    }
    res.json({ success: true, data: { deleted: 1 } });
  } catch (error) {
    next(error);
  }
};
