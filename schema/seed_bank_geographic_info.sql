-- Seed geographic info (City, State, Address) for core.Bank
-- Researched HQ locations; run after add_bank_address_contact.sql so Address column exists.
-- Idempotent: safe to run multiple times.

SET NOCOUNT ON;

-- b1Bank – Baton Rouge, LA
UPDATE core.Bank SET City = N'Baton Rouge', State = N'LA', Address = N'500 Laurel Street, Baton Rouge, LA 70801' WHERE BankName = N'b1Bank';

-- First Horizon Bank – Memphis, TN
UPDATE core.Bank SET City = N'Memphis', State = N'TN', Address = N'165 Madison Avenue, Memphis, TN 38103' WHERE BankName = N'First Horizon Bank';

-- Hancock Whitney – Gulfport, MS
UPDATE core.Bank SET City = N'Gulfport', State = N'MS', Address = N'2510 14th Street, Gulfport, MS 39501' WHERE BankName = N'Hancock Whitney';

-- Renasant Bank – Tupelo, MS
UPDATE core.Bank SET City = N'Tupelo', State = N'MS', Address = N'209 Troy Street, Tupelo, MS 38804' WHERE BankName = N'Renasant Bank';

-- Trustmark Bank – Jackson, MS
UPDATE core.Bank SET City = N'Jackson', State = N'MS', Address = N'248 East Capitol Street, Jackson, MS 39201' WHERE BankName = N'Trustmark Bank';

-- Wells Fargo – Sioux Falls, SD (operational HQ; parent in San Francisco)
UPDATE core.Bank SET City = N'Sioux Falls', State = N'SD', Address = N'101 N Phillips Ave, Sioux Falls, SD 57104' WHERE BankName = N'Wells Fargo';

-- Cadence Bank – Tupelo, MS
UPDATE core.Bank SET City = N'Tupelo', State = N'MS', Address = N'201 S Spring St, Tupelo, MS 38804' WHERE BankName = N'Cadence Bank';

-- Pen-Air Credit Union – Pensacola, FL
UPDATE core.Bank SET City = N'Pensacola', State = N'FL', Address = N'1495 East 9 Mile Road, Pensacola, FL 32514' WHERE BankName = N'Pen-Air Credit Union';

-- Pen-Air (if present as separate entry)
UPDATE core.Bank SET City = N'Pensacola', State = N'FL', Address = N'1495 East 9 Mile Road, Pensacola, FL 32514' WHERE BankName = N'Pen-Air';

-- Fidelity Bank – New Orleans, LA
UPDATE core.Bank SET City = N'New Orleans', State = N'LA', Address = N'353 Carondelet Street, New Orleans, LA 70130' WHERE BankName = N'Fidelity Bank';

-- JD Bank – Jennings, LA
UPDATE core.Bank SET City = N'Jennings', State = N'LA', Address = N'507 Main Street, Jennings, LA 70546' WHERE BankName = N'JD Bank';

-- The Citizens National Bank of Meridian – Meridian, MS
UPDATE core.Bank SET City = N'Meridian', State = N'MS', Address = N'512 22nd Avenue, Meridian, MS 39301' WHERE BankName = N'The Citizens National Bank of Meridian';

-- Home Bank – Lafayette, LA
UPDATE core.Bank SET City = N'Lafayette', State = N'LA', Address = N'503 Kaliste Saloom Road, Lafayette, LA 70508' WHERE BankName = N'Home Bank';

-- First US Bank – Birmingham, AL
UPDATE core.Bank SET City = N'Birmingham', State = N'AL', Address = N'3291 U.S. Highway 280, Suite 100, Birmingham, AL 35243' WHERE BankName = N'First US Bank';

-- The Citizens Bank – Philadelphia, MS
UPDATE core.Bank SET City = N'Philadelphia', State = N'MS', Address = N'521 Main Street, Philadelphia, MS 39350' WHERE BankName = N'The Citizens Bank';

-- Gulf Coast Bank and Trust – New Orleans, LA
UPDATE core.Bank SET City = N'New Orleans', State = N'LA', Address = N'200 St. Charles Avenue, New Orleans, LA 70130' WHERE BankName = N'Gulf Coast Bank and Trust';

-- Bryant Bank – Tuscaloosa, AL
UPDATE core.Bank SET City = N'Tuscaloosa', State = N'AL', Address = N'1550 McFarland Blvd N, Tuscaloosa, AL 35406' WHERE BankName = N'Bryant Bank';

-- Liberty Bank – New Orleans, LA
UPDATE core.Bank SET City = N'New Orleans', State = N'LA', Address = N'6600 Plaza Drive, Suite 600, New Orleans, LA 70127' WHERE BankName = N'Liberty Bank';

-- Red River Bank – Alexandria, LA
UPDATE core.Bank SET City = N'Alexandria', State = N'LA', Address = N'1412 Centre Court Drive, Suite 101, Alexandria, LA 71301' WHERE BankName = N'Red River Bank';

-- Community Bank of Louisiana – Mansfield, LA
UPDATE core.Bank SET City = N'Mansfield', State = N'LA', Address = N'118 Jefferson Street, Mansfield, LA 71052' WHERE BankName = N'Community Bank of Louisiana';

-- United Community Bank - Louisiana – Raceland, LA
UPDATE core.Bank SET City = N'Raceland', State = N'LA', Address = N'4626 Highway 1, Raceland, LA 70394' WHERE BankName = N'United Community Bank - Louisiana';

-- BOM Bank – Natchitoches, LA
UPDATE core.Bank SET City = N'Natchitoches', State = N'LA', Address = N'814 Washington Street, Natchitoches, LA 71457' WHERE BankName = N'BOM Bank';

-- Catalyst Bank – Opelousas, LA
UPDATE core.Bank SET City = N'Opelousas', State = N'LA', Address = N'235 North Court Street, Opelousas, LA 70570' WHERE BankName = N'Catalyst Bank';

-- Community First Bank – New Iberia, LA
UPDATE core.Bank SET City = N'New Iberia', State = N'LA', Address = N'1101 E. Admiral Doyle Drive, New Iberia, LA 70560' WHERE BankName = N'Community First Bank';

-- CLB Bank (CLB The Community Bank) – Jonesville, LA
UPDATE core.Bank SET City = N'Jonesville', State = N'LA', Address = N'301 Mound Street, Jonesville, LA 71343' WHERE BankName = N'CLB Bank';

-- Southern Bancorp – Little Rock, AR (corporate office)
UPDATE core.Bank SET City = N'Little Rock', State = N'AR', Address = N'400 Hardin Rd, Suite 100, Little Rock, AR 72211' WHERE BankName = N'Southern Bancorp';

-- Bank of Zachary – Zachary, LA
UPDATE core.Bank SET City = N'Zachary', State = N'LA', Address = N'4743 Main Street, Zachary, LA 70791' WHERE BankName = N'Bank of Zachary';

-- Synergy Bank – Houma, LA
UPDATE core.Bank SET City = N'Houma', State = N'LA', Address = N'210 Synergy Center Boulevard, Houma, LA 70360' WHERE BankName = N'Synergy Bank';

-- Investar Bank – Baton Rouge, LA
UPDATE core.Bank SET City = N'Baton Rouge', State = N'LA', Address = N'10500 Coursey Boulevard, Baton Rouge, LA 70816' WHERE BankName = N'Investar Bank';

-- RadiFi Federal Credit Union – Jacksonville, FL
UPDATE core.Bank SET City = N'Jacksonville', State = N'FL', Address = N'562 Park Street, Jacksonville, FL 32204' WHERE BankName = N'RadiFi Federal Credit Union';

-- Radifi Federal Credit Union (alternate spelling if present)
UPDATE core.Bank SET City = N'Jacksonville', State = N'FL', Address = N'562 Park Street, Jacksonville, FL 32204' WHERE BankName = N'Radifi Federal Credit Union';

-- Avadian Credit Union – Hoover, AL
UPDATE core.Bank SET City = N'Hoover', State = N'AL', Address = N'1 Riverchase Parkway South, Hoover, AL 35244' WHERE BankName = N'Avadian Credit Union';

-- Rayne State Bank – Rayne, LA
UPDATE core.Bank SET City = N'Rayne', State = N'LA', Address = N'200 South Adams Avenue, Rayne, LA 70578' WHERE BankName = N'Rayne State Bank';

-- Heart of Louisiana Federal Credit Union – state only
UPDATE core.Bank SET State = N'LA' WHERE BankName = N'Heart of Louisiana Federal Credit Union';

-- Plaquemine Bank – Plaquemine, LA
UPDATE core.Bank SET City = N'Plaquemine', State = N'LA', Address = N'24025 Eden Street, Plaquemine, LA 70764' WHERE BankName = N'Plaquemine Bank';

-- Mutual Federal Credit Union – MS (state only)
UPDATE core.Bank SET State = N'MS' WHERE BankName = N'Mutual Federal Credit Union';

-- Aneca Federal Credit Union – LA (state only)
UPDATE core.Bank SET State = N'LA' WHERE BankName = N'Aneca Federal Credit Union';

-- Red River Employees Federal Credit Union – TX (state only)
UPDATE core.Bank SET State = N'TX' WHERE BankName = N'Red River Employees Federal Credit Union';

-- Bank Plus – Belzoni, MS
UPDATE core.Bank SET City = N'Belzoni', State = N'MS', Address = N'202 Jackson Street, Belzoni, MS 39038' WHERE BankName = N'Bank Plus';

-- Currency Bank – LA (state only)
UPDATE core.Bank SET State = N'LA' WHERE BankName = N'Currency Bank';

-- Gibsland Bank & Trust – Gibsland, LA
UPDATE core.Bank SET City = N'Gibsland', State = N'LA' WHERE BankName = N'Gibsland Bank & Trust';

-- United Mississippi Bank – Natchez, MS
UPDATE core.Bank SET City = N'Natchez', State = N'MS', Address = N'75 Melrose Montebello Parkway, Natchez, MS 39120' WHERE BankName = N'United Mississippi';

-- Magnolia State Bank – Bay Springs, MS
UPDATE core.Bank SET City = N'Bay Springs', State = N'MS', Address = N'28 Highway 528, Bay Springs, MS 39422' WHERE BankName = N'Magnolia State Bank';

-- American Bank & Trust – LA (state only)
UPDATE core.Bank SET State = N'LA' WHERE BankName = N'American Bank & Trust';

-- Farmers State Bank – LA (state only)
UPDATE core.Bank SET State = N'LA' WHERE BankName = N'Farmers State Bank';

-- Richton Bank & Trust – Richton, MS
UPDATE core.Bank SET City = N'Richton', State = N'MS' WHERE BankName = N'Richton Bank & Trust';

-- Winnsboro State Bank & Trust – Winnsboro, LA
UPDATE core.Bank SET City = N'Winnsboro', State = N'LA' WHERE BankName = N'Winnsboro State Bank & Trust';

-- First American Bank & Trust – Hammond, LA
UPDATE core.Bank SET City = N'Hammond', State = N'LA', Address = N'1800 Southwest Railroad Avenue, Hammond, LA 70403' WHERE BankName = N'First American Bank & Trust';

-- Citizens Savings Bank – LA (state only)
UPDATE core.Bank SET State = N'LA' WHERE BankName = N'Citizens Savings Bank';

-- Citizens Bank & Trust – Covington, LA (southeastern LA)
UPDATE core.Bank SET City = N'Covington', State = N'LA', Address = N'222 N. New Hampshire St., Covington, LA 70433' WHERE BankName = N'Citizens Bank & Trust';

-- St Landry Bank – Opelousas, LA
UPDATE core.Bank SET City = N'Opelousas', State = N'LA', Address = N'132 East Landry Street, Opelousas, LA 70570' WHERE BankName = N'St Landry Bank';

-- Southern Heritage Bank – Jonesville, LA
UPDATE core.Bank SET City = N'Jonesville', State = N'LA', Address = N'1201 4th Street, Jonesville, LA 71343' WHERE BankName = N'Southern Heritage Bank';

-- FNB Jeanerette – Jeanerette, LA
UPDATE core.Bank SET City = N'Jeanerette', State = N'LA' WHERE BankName = N'FNB Jeanerette';

-- First National Bank USA – LA (state only)
UPDATE core.Bank SET State = N'LA' WHERE BankName = N'First National Bank USA';

PRINT 'Bank geographic seed completed.';
GO
