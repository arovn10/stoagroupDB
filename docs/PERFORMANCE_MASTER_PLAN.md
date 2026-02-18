# Performance & Scalability Master Plan

**Goal:** Make banking dashboard, deal pipeline, and leasing velocity report **lightning fast on mobile**, **scalable**, and **avoid DB overload**.

---

## ✅ Already Implemented

| Area | What | Impact |
|------|------|--------|
| **API** | Rebuild mutex (one snapshot rebuild at a time) | Prevents concurrent rebuilds hammering DB |
| **API** | Debounced post-sync rebuild (5s) | Rapid syncs trigger one rebuild |
| **API** | `part=dashboard` / `part=raw` on GET /dashboard | Smaller payload for mobile |
| **API** | Cache-Control (2 min) + ETag for 304 | Browser/server caching |
| **API** | GET /dashboard uses rebuild path when missing | Single code path, mutex applies |
| **Frontend** | Session cache (2 min TTL) on getLeasingDashboard | Fewer network requests |
| **Frontend** | ETag revalidation (If-None-Match) | 304 responses reuse cache |
| **Frontend** | Default part=dashboard (omit raw) | Smaller first load |

---

## Phase 1: API & Backend (stoagroupDB)

### 1.1 Response compression
- **Add gzip/Brotli** for all JSON responses (Express `compression` middleware)
- **Impact:** 60–80% smaller payload over the wire; faster on mobile networks

### 1.2 Lightweight “above the fold” endpoint
- **GET /api/leasing/dashboard/summary** – KPIs + minimal metadata only (no rows)
- Frontend loads this first for instant metrics, then fetches full dashboard in background
- **Impact:** First paint in &lt;1s on mobile

### 1.3 Cache-Control on KPI endpoints
- Add `Cache-Control: private, max-age=60` (or 120) to `/api/leasing/kpis/*`
- **Impact:** Browser/CDN caching for repeated visits

### 1.4 Rate limiting
- Per-IP rate limit on heavy endpoints (e.g. /dashboard, /sync) to prevent abuse
- **Impact:** Protects DB from bursts; fair sharing across users

---

## Phase 2: Database

### 2.1 Indexes on leasing tables
- Add indexes for columns used in `getAllForDashboard` filters/joins (e.g. `ReportDate`, `Property`, `BatchTimestamp`)
- Audit `leasingRepository.ts` `getAll*` queries for missing indexes
- **Impact:** Faster snapshot builds; less load per rebuild

### 2.2 Connection pooling
- Ensure pool size and timeouts are tuned for production
- **Impact:** Avoid connection exhaustion under load

### 2.3 Optional: read replica for dashboard reads
- Route GET /dashboard and KPI reads to a read replica
- **Impact:** Offload reads from primary; scale independently (longer-term)

---

## Phase 3: Frontend – Banking Dashboard

### 3.1 Progressive loading
- Load KPIs or `/dashboard/summary` first → render immediately
- Load full dashboard in background → update UI when ready
- **Impact:** Fast first paint on mobile

### 3.2 Lazy-load heavy sections
- Defer rendering of large tables until in viewport or tab is active
- **Impact:** Less work on initial load; smoother scrolling

### 3.3 Virtual scrolling for tables
- Use virtualized lists for tables with hundreds+ rows
- **Impact:** DOM stays small; smooth scroll on mobile

### 3.4 Reduce initial bundle / defer non-critical
- Defer loading of rarely-used modules; lazy load charts/tables
- **Impact:** Faster parse and execution on mobile

---

## Phase 4: Frontend – Deal Pipeline

### 4.1 Same progressive load as banking
- KPIs/summary first, full data second

### 4.2 Virtual scrolling for pipeline tables
- Deal lists can be large; virtualize for performance

### 4.3 Throttle/debounce filter/search
- Debounce search/filter input to avoid excessive re-renders and API calls
- **Impact:** Less CPU and network on typing

---

## Phase 5: Frontend – Leasing Velocity Report

### 5.1 Progressive load (KPIs first, raw later)
- Already uses `part=full` for raw when needed
- Consider: load `part=dashboard` first (fast), then `part=raw` in background for full merge
- **Impact:** Much faster first paint; raw merge happens after UI is usable

### 5.2 Virtual scrolling
- Leasing tables are large (portfolio unit details, unit mix, etc.); virtualize
- **Impact:** Smooth scroll; no jank on mobile

### 5.3 Simplify / defer heavy calculations
- Move heavy aggregations to web workers or defer until after initial render
- **Impact:** Main thread stays responsive

---

## Backend Cleanup (Completed)

- **Endpoint audit:** All leasing endpoints are in use: dashboard/dashboard/summary (frontend), kpis/* (frontend), aggregates (frontend), sync/sync-check/sync-from-domo (cron), rebuild-snapshot (cron), dashboard-diag/compare-millerville (scripts). None removed.
- **Efficiency:** gzip, rate limiting, Cache-Control on KPIs, dashboard/summary for fast first paint, part=dashboard/part=full for progressive load.

---

## Phase 6: Mobile-Specific

### 6.1 Touch/scroll optimizations
- `touch-action`, `will-change`, `contain` for scroll containers
- Passive event listeners for scroll/touch
- **Impact:** Smoother scrolling; fewer layout thrash

### 6.2 Skeleton loaders
- Show skeleton placeholders while data loads
- **Impact:** Perceived speed; feels faster

### 6.3 Reduce animations on low-end devices
- Use `prefers-reduced-motion` or detect slow device; simplify/disable animations
- **Impact:** Better performance on older phones

---

## Priority Order (Suggested)

1. **Quick wins:** Gzip, KPI cache headers, rate limiting
2. **Frontend:** Progressive load (summary first), virtual scrolling for large tables
3. **DB:** Indexes on leasing tables
4. **API:** Lightweight `/dashboard/summary` endpoint
5. **Polish:** Skeleton loaders, touch optimizations, lazy loading

---

## Metrics to Track

- **LCP** (Largest Contentful Paint) &lt; 2.5s on mobile
- **TTI** (Time to Interactive) &lt; 4s
- **API response size** (target: &lt;500KB for first load on mobile)
- **DB connection count** and query duration under load
- **304 rate** for cached GETs
