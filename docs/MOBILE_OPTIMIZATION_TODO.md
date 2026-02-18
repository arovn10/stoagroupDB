# Mobile Optimization – Master Plan

**Goal:** Every dashboard must detect mobile users and provide a **completely alternate mobile experience** with Apple Developer–level UI quality. Current state: layouts break, content overflows, overlaps occur, and load times are poor on mobile.

---

## Scope: All Dashboards

| Dashboard | Repo/Path | Priority |
|-----------|-----------|----------|
| Banking Dashboard | `banking dashboard/` | High |
| Deal Pipeline | `deal pipeline/` | High |
| Leasing Velocity Report | `leasing velocity report/` | High |
| Portfolio Dashboard | `portfolio dashboard/` | Medium |
| Monday Morning Report | `monday morning report/` | Medium |
| T12 vs Budget | `t12vsbudget dashboard/` | Medium |
| Reviews Dashboard | `reviews dashboard/` | Medium |

---

## Phase 1: Mobile Detection & Bootstrap

### 1.1 Unified mobile detection
- [ ] Add shared mobile-detection utility (or extend api-client) usable by all dashboards
- [ ] Detect via:
  - `navigator.userAgent` (iOS, Android)
  - `window.matchMedia('(max-width: 768px)')` (viewport)
  - `'ontouchstart' in window` (touch capability)
- [ ] Option: `(prefers-reduced-motion)` for accessibility
- [ ] Set `data-mobile="true"` on `<html>` or `<body>` for CSS hooks
- [ ] Expose `window.IS_MOBILE` for JS branching

### 1.2 Viewport & meta
- [ ] Audit all `index.html` files for correct viewport meta:
  ```html
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=5, user-scalable=yes" />
  ```
- [ ] Ensure no `maximum-scale=1` or `user-scalable=no` (accessibility)
- [ ] Add `theme-color` for browser chrome

---

## Phase 2: Apple-Level Mobile UX Standards

### 2.1 Typography & touch targets
- [ ] Minimum 44×44px touch targets (Apple HIG)
- [ ] Font sizes: body ≥ 16px on mobile to avoid iOS zoom on focus
- [ ] Line height ≥ 1.4 for readability
- [ ] Use `-webkit-tap-highlight-color` for touch feedback
- [ ] Avoid hover-only interactions; support tap/click

### 2.2 Navigation & layout
- [ ] Bottom tab bar or hamburger + slide-out for main nav on mobile (instead of horizontal tabs)
- [ ] Single-column layouts; no multi-column on small screens
- [ ] Sticky headers that collapse on scroll where appropriate
- [ ] Safe area insets: `padding-left: env(safe-area-inset-left)` etc. for notched devices

### 2.3 Motion & performance
- [ ] Prefer `transform` and `opacity` for animations (GPU-accelerated)
- [ ] `will-change` only when needed; remove after animation
- [ ] Respect `prefers-reduced-motion: reduce`
- [ ] 60fps feel: avoid layout thrashing, debounce scroll/resize handlers

### 2.4 Loading & perceived performance
- [ ] Skeleton screens or placeholders for above-the-fold content
- [ ] Progressive loading: KPIs/summary first, tables second
- [ ] Lazy-load below-the-fold sections
- [ ] Clear loading states; avoid blank screens

---

## Phase 3: Banking Dashboard – Mobile Overhaul

### 3.1 Header / topbar
- [ ] Single compact row on mobile; hide subtitle
- [ ] Hamburger or icon-only controls where possible
- [ ] Status dropdown: full-width on mobile, bottom sheet style
- [ ] Search: expandable or dedicated search screen

### 3.2 Main tabs (By Property, Search by Bank, etc.)
- [ ] Replace horizontal scroll tabs with:
  - **Option A:** Bottom tab bar (5–6 items)
  - **Option B:** Dropdown / select to switch views
  - **Option C:** Swipeable cards
- [ ] No overlapping; no truncated tab labels

### 3.3 Tables
- [ ] Card-based layout instead of tables on mobile (one card per row)
- [ ] Horizontal scroll only as fallback; cards preferred
- [ ] Sticky column headers removed or rethought for cards
- [ ] Expand/collapse for detail rows (accordion style)

### 3.4 Modals & forms
- [ ] Full-screen modals on mobile instead of centered overlay
- [ ] Form inputs: large, properly spaced
- [ ] Date pickers: native on mobile where possible
- [ ] Action buttons: full-width, stacked

### 3.5 Performance
- [ ] Reduce initial payload (e.g. `part=dashboard` only)
- [ ] Virtualize or paginate long lists (e.g. properties table)
- [ ] Defer non-critical API calls until after first paint
- [ ] Optimize images (logos, icons): SVG or responsive srcset

---

## Phase 4: Deal Pipeline – Mobile Overhaul

### 4.1 Layout
- [ ] Pipeline stages: horizontal swipe or vertical stack
- [ ] Deal cards: mobile-optimized card layout
- [ ] Attachments: grid or list optimized for touch

### 4.2 Interactions
- [ ] Touch-friendly drag-and-drop or tap-to-move
- [ ] Inline editing: larger inputs, clear save/cancel
- [ ] File upload: native picker, clear progress

### 4.3 Performance
- [ ] Lazy-load deal details
- [ ] Paginate or virtualize deal list
- [ ] Optimize attachment thumbnails

---

## Phase 5: Leasing Velocity Report – Mobile Overhaul

### 5.1 Heavy data handling
- [ ] Default to summary/KPIs only on mobile; "Load full" for tables
- [ ] Virtual scrolling for large tables
- [ ] Chart libraries: ensure mobile-friendly (tap, pinch-zoom if needed)

### 5.2 Layout
- [ ] KPI cards: 2×2 or single column
- [ ] Tables → cards on mobile
- [ ] Filters: bottom sheet or slide-over panel

### 5.3 Performance
- [ ] Use `part=dashboard` and avoid `part=raw` on first load
- [ ] Session cache + ETag (already in plan)
- [ ] Debounce filter changes

---

## Phase 6: Shared Components & CSS Strategy

### 6.1 Shared mobile stylesheet
- [ ] Create `mobile.css` or mobile section in shared `app.css` patterns
- [ ] Media queries: breakpoints 480px, 600px, 768px, 1024px
- [ ] Mobile-first or desktop-first: pick one and document

### 6.2 Component patterns
- [ ] Mobile card component (reusable across dashboards)
- [ ] Mobile bottom sheet / drawer
- [ ] Mobile header (collapsible, with back button)
- [ ] Mobile table-to-cards transform (CSS or JS)

### 6.3 Domo embed considerations
- [ ] Test inside Domo card/iframe; viewport may differ
- [ ] Handle Domo sidebar + constrained width
- [ ] Check z-index stacking with Domo chrome

---

## Phase 7: Performance – Cross-Dashboard

### 7.1 Network
- [ ] Smaller payloads for mobile (field selection, pagination)
- [ ] Compression (gzip/Brotli) on API
- [ ] Cache-Control for static assets and API responses

### 7.2 Frontend
- [ ] Code-split large bundles if applicable
- [ ] Minimize main-thread work on load
- [ ] Lazy-load below-fold content
- [ ] Consider service worker for repeat visits (optional)

### 7.3 Measurements
- [ ] Target: First Contentful Paint < 1.5s on 4G
- [ ] Target: Time to Interactive < 3s on 4G
- [ ] Use Lighthouse / WebPageTest for mobile profiling

---

## Implementation Order

1. **Phase 1** – Mobile detection + bootstrap (all dashboards)
2. **Phase 2** – Document and apply Apple-level UX standards
3. **Phase 3** – Banking Dashboard (highest impact, most reported issues)
4. **Phase 6** – Extract shared components once Banking is done
5. **Phase 4 & 5** – Deal Pipeline, Leasing Velocity
6. **Phase 7** – Performance hardening across all
7. Remaining dashboards (Portfolio, Monday Morning, T12, Reviews)

---

## Acceptance Criteria (Per Dashboard)

- [ ] No horizontal overflow on viewports 320px–428px wide
- [ ] No overlapping text or controls
- [ ] All interactive elements ≥ 44×44px
- [ ] Tables render as cards or have usable horizontal scroll with clear affordance
- [ ] Modals/forms usable on small screens
- [ ] First meaningful paint < 2s on 3G throttled
- [ ] Passes Lighthouse Mobile accessibility & performance checks

---

## Notes

- **Domo constraints:** Dashboards run inside Domo; iframe viewport and chrome affect layout. Test in real Domo mobile embed.
- **Apple HIG:** [Human Interface Guidelines – iOS](https://developer.apple.com/design/human-interface-guidelines/)
- **Material Design:** Android users; consider Material touch targets and patterns where relevant.
