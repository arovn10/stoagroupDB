# Equity Dashboard - Drill-Down Instructions

## 📊 Overview

This guide explains how to create a hierarchical equity dashboard with three drill-down levels:
1. **Level 1: Investors** (aggregated totals)
2. **Level 2: Deals/Projects** (per investor, aggregated by project)
3. **Level 3: Individual Commitments** (all funding details)

---

## 🎯 Data Structure

### Level 1: Investor Summary
**What to show:**
- Investor Name
- Total Number of Deals (unique projects)
- Total Number of Commitments
- Total Amount Invested
- Average Commitment Amount
- First Investment Date
- Last Investment Date

### Level 2: Deal Summary (per Investor)
**What to show:**
- Project Name
- Number of Commitments (for this project)
- Total Amount (for this project)
- First Commitment Date
- Last Commitment Date
- Project Stage

### Level 3: Individual Commitments
**What to show:**
- Commitment ID
- Project Name
- Amount
- Funding Date
- Equity Type
- Notes

---

## 📋 SQL Queries for Each Level

### Level 1: Investor Summary Query

```sql
SELECT 
    ep.EquityPartnerId,
    ep.PartnerName AS InvestorName,
    ep.IMSInvestorProfileId,
    COUNT(DISTINCT ec.ProjectId) AS TotalDeals,
    COUNT(ec.EquityCommitmentId) AS TotalCommitments,
    SUM(ec.Amount) AS TotalAmount,
    AVG(ec.Amount) AS AvgCommitmentAmount,
    MIN(ec.FundingDate) AS FirstInvestmentDate,
    MAX(ec.FundingDate) AS LastInvestmentDate
FROM core.EquityPartner ep
LEFT JOIN banking.EquityCommitment ec ON ec.EquityPartnerId = ep.EquityPartnerId
WHERE ec.EquityCommitmentId IS NOT NULL
GROUP BY ep.EquityPartnerId, ep.PartnerName, ep.IMSInvestorProfileId
ORDER BY TotalAmount DESC
```

### Level 2: Deal Summary (Filtered by Investor)

```sql
SELECT 
    ec.ProjectId,
    p.ProjectName,
    p.Stage AS ProjectStage,
    ep.EquityPartnerId,
    ep.PartnerName AS InvestorName,
    COUNT(ec.EquityCommitmentId) AS CommitmentCount,
    SUM(ec.Amount) AS ProjectTotalAmount,
    MIN(ec.FundingDate) AS FirstCommitmentDate,
    MAX(ec.FundingDate) AS LastCommitmentDate
FROM banking.EquityCommitment ec
INNER JOIN core.EquityPartner ep ON ep.EquityPartnerId = ec.EquityPartnerId
INNER JOIN core.Project p ON p.ProjectId = ec.ProjectId
WHERE ep.EquityPartnerId = @InvestorId  -- Filter by selected investor
GROUP BY ec.ProjectId, p.ProjectName, p.Stage, ep.EquityPartnerId, ep.PartnerName
ORDER BY ProjectTotalAmount DESC
```

### Level 3: Individual Commitments (Filtered by Investor and Project)

```sql
SELECT 
    ec.EquityCommitmentId,
    ec.ProjectId,
    p.ProjectName,
    ep.PartnerName AS InvestorName,
    ec.Amount,
    ec.FundingDate,
    ec.EquityType,
    ec.Notes
FROM banking.EquityCommitment ec
INNER JOIN core.EquityPartner ep ON ep.EquityPartnerId = ec.EquityPartnerId
INNER JOIN core.Project p ON p.ProjectId = ec.ProjectId
WHERE ep.EquityPartnerId = @InvestorId  -- Filter by selected investor
  AND ec.ProjectId = @ProjectId  -- Filter by selected project
ORDER BY ec.FundingDate DESC, ec.Amount DESC
```

---

## 🎨 Domo Dashboard Implementation

### Step 1: Create Level 1 - Investor Summary Card

1. **Create a Card** with the Level 1 query
2. **Visualization Type:** Table or KPI Cards
3. **Key Metrics to Display:**
   - Investor Name (as the primary dimension)
   - Total Amount (formatted as currency)
   - Total Deals (number)
   - Total Commitments (number)
4. **Enable Drill-Through:**
   - Right-click on Investor Name → Enable Drill-Through
   - Set drill parameter: `InvestorId` = `EquityPartnerId`

### Step 2: Create Level 2 - Deal Summary Card

1. **Create a Card** with the Level 2 query
2. **Add Filter:**
   - Filter by `InvestorId` (from Level 1 drill-through)
   - Use parameter: `@InvestorId`
3. **Visualization Type:** Table or Bar Chart
4. **Key Metrics:**
   - Project Name (primary dimension)
   - Project Total Amount (formatted as currency)
   - Commitment Count
   - Project Stage
5. **Enable Drill-Through:**
   - Right-click on Project Name → Enable Drill-Through
   - Set drill parameters: `InvestorId` and `ProjectId`

### Step 3: Create Level 3 - Individual Commitments Card

1. **Create a Card** with the Level 3 query
2. **Add Filters:**
   - Filter by `InvestorId` (from Level 1)
   - Filter by `ProjectId` (from Level 2)
3. **Visualization Type:** Table (detailed view)
4. **Columns to Display:**
   - Commitment ID
   - Funding Date
   - Amount (formatted as currency)
   - Equity Type
   - Notes

### Step 4: Set Up Drill-Through Flow

**In Domo:**
1. Go to Level 1 Card → Properties → Drill-Through
2. Add drill-through to Level 2 Card
3. Pass parameter: `InvestorId`
4. Go to Level 2 Card → Properties → Drill-Through
5. Add drill-through to Level 3 Card
6. Pass parameters: `InvestorId` and `ProjectId`

---

## 📊 Alternative: Single Query with Hierarchical Structure

If you prefer a single dataset that can be filtered:

```sql
-- Combined query with all levels of detail
SELECT 
    -- Level 1: Investor Info
    ep.EquityPartnerId,
    ep.PartnerName AS InvestorName,
    ep.IMSInvestorProfileId,
    
    -- Level 2: Project Info
    p.ProjectId,
    p.ProjectName,
    p.Stage AS ProjectStage,
    
    -- Level 3: Commitment Info
    ec.EquityCommitmentId,
    ec.Amount,
    ec.FundingDate,
    ec.EquityType,
    ec.Notes,
    
    -- Aggregated metrics (for Level 1 & 2)
    COUNT(DISTINCT ec.ProjectId) OVER (PARTITION BY ep.EquityPartnerId) AS InvestorTotalDeals,
    COUNT(ec.EquityCommitmentId) OVER (PARTITION BY ep.EquityPartnerId) AS InvestorTotalCommitments,
    SUM(ec.Amount) OVER (PARTITION BY ep.EquityPartnerId) AS InvestorTotalAmount,
    COUNT(ec.EquityCommitmentId) OVER (PARTITION BY ep.EquityPartnerId, ec.ProjectId) AS ProjectCommitmentCount,
    SUM(ec.Amount) OVER (PARTITION BY ep.EquityPartnerId, ec.ProjectId) AS ProjectTotalAmount
    
FROM banking.EquityCommitment ec
INNER JOIN core.EquityPartner ep ON ep.EquityPartnerId = ec.EquityPartnerId
INNER JOIN core.Project p ON p.ProjectId = ec.ProjectId
ORDER BY ep.PartnerName, p.ProjectName, ec.FundingDate DESC
```

**Usage:**
- Use filters in Domo to show Level 1 (group by Investor)
- Expand to show Level 2 (group by Project within Investor)
- Expand further to show Level 3 (individual commitments)

---

## 🎯 Recommended Dashboard Layout

### Layout Structure:

```
┌─────────────────────────────────────────────────────────┐
│  EQUITY INVESTMENTS DASHBOARD                            │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  ┌─────────────────────────────────────────────────┐   │
│  │  LEVEL 1: INVESTOR SUMMARY                      │   │
│  │  (Table with drill-through enabled)              │   │
│  │                                                  │   │
│  │  Investor Name | Total Deals | Total Amount     │   │
│  │  ────────────────────────────────────────────  │   │
│  │  Stoa Holdings, LLC | 26 | $111,972,562        │   │
│  │  The Waters at West Village... | 6 | $28,007,712│   │
│  │  ...                                              │   │
│  └─────────────────────────────────────────────────┘   │
│                                                           │
│  ┌─────────────────────────────────────────────────┐   │
│  │  LEVEL 2: DEAL SUMMARY (for selected investor) │   │
│  │  (Shows when investor is clicked)               │   │
│  │                                                  │   │
│  │  Project Name | Commitments | Total Amount      │   │
│  │  ────────────────────────────────────────────   │   │
│  │  Dawson Park | 12 | $3,476,762                 │   │
│  │  Silver Oaks | 10 | $4,350,000                 │   │
│  │  ...                                            │   │
│  └─────────────────────────────────────────────────┘   │
│                                                           │
│  ┌─────────────────────────────────────────────────┐   │
│  │  LEVEL 3: INDIVIDUAL COMMITMENTS                │   │
│  │  (Shows when project is clicked)                │   │
│  │                                                  │   │
│  │  Date | Amount | Type | Notes                   │   │
│  │  ────────────────────────────────────────────  │   │
│  │  2024-11-17 | $4,374,164.79 | ... | ...        │   │
│  │  2022-05-31 | $1,132,386.01 | ... | ...        │   │
│  │  ...                                            │   │
│  └─────────────────────────────────────────────────┘   │
│                                                           │
└─────────────────────────────────────────────────────────┘
```

---

## 🔧 Using the API Client

If you're building a custom dashboard using the API:

### Level 1: Get All Investors with Totals

```javascript
// Get all equity commitments
const commitments = await getAllEquityCommitments();
const data = commitments.data;

// Group by investor
const investorSummary = {};
data.forEach(commitment => {
  const investorId = commitment.EquityPartnerId;
  if (!investorSummary[investorId]) {
    investorSummary[investorId] = {
      investorId,
      investorName: commitment.PartnerName,
      deals: new Set(),
      commitments: [],
      totalAmount: 0
    };
  }
  investorSummary[investorId].deals.add(commitment.ProjectId);
  investorSummary[investorId].commitments.push(commitment);
  investorSummary[investorId].totalAmount += commitment.Amount;
});

// Convert to array
const investors = Object.values(investorSummary).map(inv => ({
  investorId: inv.investorId,
  investorName: inv.investorName,
  totalDeals: inv.deals.size,
  totalCommitments: inv.commitments.length,
  totalAmount: inv.totalAmount,
  avgCommitment: inv.totalAmount / inv.commitments.length,
  firstInvestment: Math.min(...inv.commitments.map(c => new Date(c.FundingDate))),
  lastInvestment: Math.max(...inv.commitments.map(c => new Date(c.FundingDate)))
}));
```

### Level 2: Get Deals for Selected Investor

```javascript
// Filter commitments by investor
const investorCommitments = data.filter(c => c.EquityPartnerId === selectedInvestorId);

// Group by project
const projectSummary = {};
investorCommitments.forEach(commitment => {
  const projectId = commitment.ProjectId;
  if (!projectSummary[projectId]) {
    projectSummary[projectId] = {
      projectId,
      projectName: commitment.ProjectName,
      commitments: [],
      totalAmount: 0
    };
  }
  projectSummary[projectId].commitments.push(commitment);
  projectSummary[projectId].totalAmount += commitment.Amount;
});

// Convert to array
const deals = Object.values(projectSummary).map(proj => ({
  projectId: proj.projectId,
  projectName: proj.projectName,
  commitmentCount: proj.commitments.length,
  totalAmount: proj.totalAmount,
  firstCommitment: Math.min(...proj.commitments.map(c => new Date(c.FundingDate))),
  lastCommitment: Math.max(...proj.commitments.map(c => new Date(c.FundingDate)))
}));
```

### Level 3: Get Individual Commitments

```javascript
// Filter by investor and project
const individualCommitments = data.filter(c => 
  c.EquityPartnerId === selectedInvestorId && 
  c.ProjectId === selectedProjectId
).sort((a, b) => new Date(b.FundingDate) - new Date(a.FundingDate));
```

---

## 📈 Key Metrics to Display

### Level 1 Metrics:
- **Total Investors:** Count of unique investors
- **Total Invested:** Sum of all commitments
- **Average Deal Size:** Average amount per project
- **Most Active Investor:** Investor with most commitments
- **Largest Investor:** Investor with highest total amount

### Level 2 Metrics (per Investor):
- **Deal Distribution:** Pie/bar chart showing amount by project
- **Timeline:** Line chart showing funding over time
- **Project Stages:** Breakdown by project stage

### Level 3 Metrics (per Deal):
- **Funding Timeline:** All commitments over time
- **Commitment Distribution:** Breakdown by amount ranges
- **Recent Activity:** Latest commitments

---

## 🎨 Visual Recommendations

### Level 1: Investor Summary
- **Primary View:** Table with sortable columns
- **Alternative:** KPI cards with top investors
- **Chart:** Bar chart showing total amount by investor

### Level 2: Deal Summary
- **Primary View:** Table grouped by project
- **Chart:** Stacked bar chart (projects stacked by commitment count)
- **Timeline:** Gantt chart showing commitment dates

### Level 3: Individual Commitments
- **Primary View:** Detailed table
- **Chart:** Timeline/waterfall chart showing funding progression
- **Summary Cards:** Total, average, min, max amounts

---

## ✅ Best Practices

1. **Performance:**
   - Use filters early to limit data
   - Cache aggregated Level 1 data
   - Load Level 2/3 on-demand when drilling down

2. **User Experience:**
   - Show loading states during drill-down
   - Provide "Back" button to go up levels
   - Show breadcrumb navigation (Investor > Deal > Commitments)

3. **Data Accuracy:**
   - Always show "as of" date
   - Include data source information
   - Allow export of detailed data

4. **Visualization:**
   - Use consistent color coding across levels
   - Format currency consistently
   - Show percentages for distributions
   - Include tooltips with additional context

---

## 🔗 Example Domo Card Configuration

### Card 1: Investor Summary
- **DataSet:** Use Level 1 query
- **Chart Type:** Table
- **Drill-Through:** Enabled → Card 2 (pass InvestorId)

### Card 2: Deal Summary
- **DataSet:** Use Level 2 query with parameter filter
- **Chart Type:** Table or Bar Chart
- **Drill-Through:** Enabled → Card 3 (pass InvestorId + ProjectId)

### Card 3: Individual Commitments
- **DataSet:** Use Level 3 query with parameter filters
- **Chart Type:** Table
- **No Drill-Through** (this is the detail level)

---

## 📝 Notes

- All amounts should be formatted as currency ($X,XXX,XXX.XX)
- Dates should be formatted consistently (MM/DD/YYYY or YYYY-MM-DD)
- Null values should be handled gracefully (show "N/A" or "-")
- Consider adding filters for date ranges, amount ranges, project stages
- Include search functionality for investor names
