-- ============================================================
-- LEASING: Indexes for faster getAllForDashboard and dashboard build
-- Run after create_leasing_schema.sql and data exists
-- ============================================================

SET NOCOUNT ON;

-- leasing.Leasing: Property, MonthOf used in dashboard aggregation
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_leasing_Leasing_Property' AND object_id = OBJECT_ID('leasing.Leasing'))
  CREATE NONCLUSTERED INDEX IX_leasing_Leasing_Property ON leasing.Leasing (Property);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_leasing_Leasing_MonthOf' AND object_id = OBJECT_ID('leasing.Leasing'))
  CREATE NONCLUSTERED INDEX IX_leasing_Leasing_MonthOf ON leasing.Leasing (MonthOf);

-- leasing.MMRData: Property, ReportDate used in dashboard
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_leasing_MMRData_Property' AND object_id = OBJECT_ID('leasing.MMRData'))
  CREATE NONCLUSTERED INDEX IX_leasing_MMRData_Property ON leasing.MMRData (Property);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_leasing_MMRData_ReportDate' AND object_id = OBJECT_ID('leasing.MMRData'))
  CREATE NONCLUSTERED INDEX IX_leasing_MMRData_ReportDate ON leasing.MMRData (ReportDate);

-- leasing.UnitByUnitTradeout: Property, ReportDate
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_leasing_UnitByUnitTradeout_Property' AND object_id = OBJECT_ID('leasing.UnitByUnitTradeout'))
  CREATE NONCLUSTERED INDEX IX_leasing_UnitByUnitTradeout_Property ON leasing.UnitByUnitTradeout (Property);

-- leasing.PortfolioUnitDetails: Property, ReportDate (largest table; most benefit)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_leasing_PortfolioUnitDetails_Property' AND object_id = OBJECT_ID('leasing.PortfolioUnitDetails'))
  CREATE NONCLUSTERED INDEX IX_leasing_PortfolioUnitDetails_Property ON leasing.PortfolioUnitDetails (Property);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_leasing_PortfolioUnitDetails_ReportDate' AND object_id = OBJECT_ID('leasing.PortfolioUnitDetails'))
  CREATE NONCLUSTERED INDEX IX_leasing_PortfolioUnitDetails_ReportDate ON leasing.PortfolioUnitDetails (ReportDate);

-- leasing.Units: PropertyName (column is PropertyName, not Property)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_leasing_Units_PropertyName' AND object_id = OBJECT_ID('leasing.Units'))
  CREATE NONCLUSTERED INDEX IX_leasing_Units_PropertyName ON leasing.Units (PropertyName);

-- leasing.UnitMix: PropertyName (column is PropertyName, not Property)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_leasing_UnitMix_PropertyName' AND object_id = OBJECT_ID('leasing.UnitMix'))
  CREATE NONCLUSTERED INDEX IX_leasing_UnitMix_PropertyName ON leasing.UnitMix (PropertyName);

-- leasing.Pricing: Property
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_leasing_Pricing_Property' AND object_id = OBJECT_ID('leasing.Pricing'))
  CREATE NONCLUSTERED INDEX IX_leasing_Pricing_Property ON leasing.Pricing (Property);

-- leasing.RecentRents: Property
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_leasing_RecentRents_Property' AND object_id = OBJECT_ID('leasing.RecentRents'))
  CREATE NONCLUSTERED INDEX IX_leasing_RecentRents_Property ON leasing.RecentRents (Property);

PRINT 'Leasing indexes created.';
