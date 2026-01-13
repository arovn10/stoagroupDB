#!/usr/bin/env ts-node
/**
 * Import Targeted Banks Data
 * 
 * Imports targeted banks data (relationship/capacity tracking) from provided text data.
 * Creates/updates banking.BankTarget records.
 * 
 * Usage: npm run db:import-targeted-banks
 */

import { getPool } from './db-manipulate';
import sql from 'mssql';

// Helper functions
function parseAmount(str: string | null | undefined): number | null {
  if (!str || str.trim() === '' || str === 'N/A' || str === '-' || str === '$-') return null;
  const cleaned = str.replace(/[$,]/g, '').trim();
  if (cleaned === '' || cleaned === '0') return null;
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? null : parsed;
}

async function getBankId(pool: sql.ConnectionPool, bankName: string): Promise<number | null> {
  const cleanedName = bankName.trim();
  const result = await pool.request()
    .input('name', sql.NVarChar, cleanedName)
    .query('SELECT BankId FROM core.Bank WHERE BankName = @name');
  
  return result.recordset.length > 0 ? result.recordset[0].BankId : null;
}

async function getOrCreateBank(pool: sql.ConnectionPool, bankName: string): Promise<number> {
  const cleanedName = bankName.trim();
  let bankId = await getBankId(pool, cleanedName);
  
  if (!bankId) {
    try {
      // Create bank if doesn't exist
      const result = await pool.request()
        .input('name', sql.NVarChar, cleanedName)
        .query(`
          INSERT INTO core.Bank (BankName)
          OUTPUT INSERTED.BankId
          VALUES (@name)
        `);
      bankId = result.recordset[0].BankId;
    } catch (error: any) {
      // If insert fails (e.g., duplicate), try to get the bank again
      // This handles race conditions
      if (error.number === 2627 || error.number === 2601) {
        bankId = await getBankId(pool, cleanedName);
        if (!bankId) {
          throw error; // Re-throw if still not found
        }
      } else {
        throw error;
      }
    }
  }
  
  return bankId;
}

// Raw data provided by user - tab-separated
const targetedBanksData = `
 $1,743,283,000 	Wells Fargo	Sioux Falls, South Dakota	SD	 $41,580,000 	Brady Hutka	3/16/21: Showed no interest
 $526,714,000 	Truist Bank	Charlotte, North Carolina	NC	 $-   	Eddie Copeland	3/16/21: Didn't show much interest
 $217,724,000 	First Citizens Bank & Trust	Raleigh, North Carolina	NC	 $-   		
 $213,681,000 	5th/3rd Bank	Cincinnati	OH	 $-   	Ted Smith, Casey Ciccone, Shane Lowe	"3/16/21: Guaging interest in their approval committee.
5/16/23: Michael spoke with Casey. Sent all Stoa financials and future pipeline. Waiting to hear back.
7/24/23: Sent follow-up email to try and get terms back on Mobile."
 $185,233,258 	KeyBank	Cleveland	OH	 $-   	Brian Kuhn, Paul Angle	8/15/23: Spoke with Key Bank about Bridge product and construction loans. They do very little construction, primarily focused on agency lending.
 $153,946,000 	Regions	Birmingham, Alabama	AL	 $-   	"Hunter Knight, Travis Damerau
Andrew Buckley, Jorge Goris"	"3/22/21: Had a call with Andrew Buckley and Jorge Goris. Only interested in the permanent side.
3/22/24: Had a meeting with Hunter and Travis at NMHC. Looking to finance deals still. Will want the permanent loan, but LTC is not a problem as long as it debt covers a 30yr am at 7.25% at a 1.25xDSCR. Can go up to $150MM in exposure, but want the permanent debt on back end.
4/14/24: Regions team came to Hammond for a meeting. Looking to keep the relationship going, and will send prelim term sheet soon."
 $81,504,034 	First Horizon Bank	Memphis, Tennessee	TN	 $72,773,000 	Tine Neames, John Everett	"6/5/23: Spoke with Tine breifly. They are on pause right now, as they await investor feedback after the merger with TD Bank was killed.
3/22/24: Michael and Saun met with Tine and John again at First Horizon office. Interested in doing another deal. Able to go to NC/SC if needed... After meeting they followed up to say they aren't quite open for business just yet, potentially 6 months out."
 $79,513,000 	Comerica Bank	Dallas	TX	 $-   		6/26/23: John Barton reached out to a contact of his at Comerica. They are completely shut down on commercial lending right now.
 $60,990,051 	Valley National Bank	Wayne, New Jersey	NJ	 $-   	Todd Harris	2/19/24: Toby met with Todd in Brimingham.
 $59,715,619 	Synovus Bank	Columbus, Ohio	GA	 $-   	Frank Lynch	"3/16/21: Spoke with Synovus on 3/15. They are interested in looking at the Crestview deal. They determine loan amount based on debt yield of 9.25%-9.5%. 
4/1/21: Synovus cancelled meeting with Stoa, not interested in our future deals.
3/22/24: Met with Frank in Birmingham. They can take $30-$35MM per deal, total exposure around $75-$100MM with 1 customer. Targeting an 11% Debt Yield"
 $49,567,514 	Frost Bank	San Antonio	TX	 $-   		
 $48,762,400 	Pinnacle Bank	Nashville, Tennessee	TN	 $-   	Chase Allen	9/12/24: Met with Toby and Michael over Teams. Really low on capacity, but could be a player for end of 2025 deals and beyond.
 $48,313,863 	Cadence Bank	Tupelo, Mississippi	MS	 $-   	Scott Newcomer, Eugene Scriber, Kevin Koh	"4/26/23: Held conference call. Still open for business. Will be more selective, wants deposits, probably looking at 70% LTC
5/12/23: Met over breakfast. Confirmed continued interest. Still going over our future pipleine. Biggest hurdle is convincing approval committe to allow for 2 concurrent deals"
 $45,127,613 	South State Bank	Winter Haven, Florida	FL	 $-   		Locations in Fairhope
 $38,761,842 	Prosperity Bank	El Campo, Texas	TX	 $-   		
 $37,922,802 	Everbank	Jacksonville, Florida	FL	 $-   		
 $36,029,904 	Bank OZK	Little Rock, Arkansas	AR	 $-   	Paul Williams, Anthony Swainey	"6/5/23: Meeting Schedule for June 16th. 
6/16/23: Average deal size $5-50 Million, they are typically lower leverage. Tough to do deals in LA, MS, and some AL, but like Birmingham. They love Florida. They don't syndicate at all. Closed $13-14 Billion in construction loans last year.
7/24/23: per Paul Willaims: ""for now if you have any deals you are looking for financing for in our markets (Carolinas, GA, FL, TN, TX) feel free to send our way and we will take a look... Our LTC for multi deals are generally coming out in the 50-55% range due to current interest rates.""... Underwriting based on 1.30x amortizing DSC based on untrended rents.  1 Month Term SOFR +/- 3.35% and a 30 year AM "
 $35,229,989 	Hancock Whitney	Gulfport, Mississippi	MS	 $107,167,182 	Brian Calander	"8/11/21: Looking for a 9% Debt Yield, Seemed Interested
8/1/23: 75bps fee, 25 year am, Year 1 NOI cover at a 1.30x, 300 over SOFR
3/22/24: Met Brian and Dale St. John at Stoa Office. Next step is to meet in New Orleans with Credit team and discuss cost basis
4/11/24: Met with Hancock Whitney team in New Orleans. Meeting went well, interested in looking at a future deal."
 $35,066,650 	BankUnited	Miami Lakes, Florida	FL	 $-   		
 $30,203,812 	Commerce Bank	St. Louis	MO	 $-   		
 $29,092,724 	Texas Capital Bank	Dallas	TX	 $-   	Brock Tautenhahn	3/16/21: Texas Capital is interested in the Crestview deal, but could go into other markets.
 $27,329,686 	Simmons Bank	Pine Bluff, Arkansas	AR	 $-   	Justin McCarty	6/5/23: By way of introduction from John Barton, Justin McCarty declined the opportuinty citing geograpy "As for the lending opportunities on the multi-family front, that is going to be something that we don't have interest in at this time. One main reason being that those 3 primary markets are outside of our geographical footprint. If there is a project that comes within the footprint, we can possibly see if the deal would make sense for us to get involved, but at this time we'll have to pass."
 $27,299,239 	United Community Bank	Greenville, South Carolina	SC	 $-   		Locations in Fairhope
 $26,373,182 	Arvest Bank	Fayetteville, Arkansas	AR	 $-   		
 $26,126,524 	City National Bank of Florida	Miami	FL	 $-   		
 $25,579,085 	Ameris Bank	Atlanta	GA	 $-   	Jason Glas	Creating network of participating lenders. Michael Sent him a list of our participating banks on 10/11/23. Hoping to create goodwill for future deals.
 $24,641,518 	Atlantic Union Bank	Richmond, Virginia	VA	 $-   	Kevin Kennelly	9/12/24: Teams meeting with Michael and Toby. Went really well, and interested in looking at 2025 projects. Only hiccup he could see would be principals not being in their market area.
 $22,759,676 	Centennial Bank	Conway, Arkansas	AR	 $-   		Locations in Pensacola
 $18,866,990 	Independent Bank	McKinney, Texas	TX	 $-   		
 $18,374,234 	Trustmark Bank	Jackson, Mississippi	MS	 $59,049,589 	Mason Dixon, Andy Reeves	
 $17,351,025 	Renasant Bank	Tupelo, Mississippi	MS	 $63,000,000 	Kacie Sanford, Stephen De Kock	"4/27/23: Introduction from Mason Dixon at Trustmark Bank. Michael followed up to schedule meeting. Call scheduled for 5/15/23.
5/15/23: Held introductory call. Wanted to see future pipeline, and would like to meet in person. Plan to reach back out shortly to get scheduled.
8/30/23: Met with Renasant in Jackson. Want to lead a deal, preferably outside of LA. They expect deposits. Could take an entire deal. 1st quarter 2024 would be good timing for them. Wants us to meet with Bryan Edwards - another credit officer - potentially at one of our sites."
 $15,799,774 	NexBank	Dallas	TX	 $-   		
 $15,720,721 	Servis1st Bank	Homewood, Alabama	AL	 $-   		"5/26/23: Michael held call with Taylor. Relationship based bank, looking for deposits and long-term runway. Plan to meet in person later this year.
6/14/23: Met Taylor at Stoa office, and toured Waters at Hammond. $50MM limit, would look to hold entire deal, likely 70% LTC for 1st deal, stressed deposits. 
7/3/23: Sent Taylor info on The Waters at Inverness
9/25/23: Met with Taylor and his bosses. Threw out terms like 60% LTC, SOFR + 400. Underwriting to a 9% debt yield, 1.2-1.25x DSCR, based on a 25-30yr am. Michael told Taylor we weren't interested at that leverage, but Taylor thinks he can get closer to 70% LTC."
 $14,821,611 	Seacoast National Bank	Stuart, Florida	FL	 $-   		
 $13,186,453 	PlainsCapital Bank	Dallas	TX	 $-   		
 $12,663,074 	Veritex Community Bank	Dallas	TX	 $-   		
 $12,533,194 	FirstBank	Nashville, Tennessee	TN	 $-   	Taylor Chadwell	"3/22/24: Taylor moved from ServisFirst over to FirstBank. We reconnected over Birmingham deal. Trying to setup a meeting.
7/1/24: Sent Taylor information on future deals to get ball rolling. Deposits harped on again. $55MM per relationship, could do 2 deals at once. Could maybe do 2 deals at $30MM each."
 $12,095,329 	First Bank 	Southern Pines, North Carolina	NC	 $-   		
 $11,430,230 	Live Oak Banking Co	Wilmington, North Carolina	NC	 $-   	Adam Sherman	"12/22/23: Digital-only bank. Reached out to see if they finance multifamily, but looks like they are focused on SBA loans.
1/4/24: Held call with Adam. Said they are new to multifamily, so focusing on regional deals right now, primarily all of Carolinas and larger markets in the southeast. Looking for deals in the $20-$50MM range, and would look to hold $20-$25MM of any one deal. Actively lending right now. Typical structure is a 5yr I/O period."
 $10,718,502 	Stellar Bank	Houston	TX	 $-   		
 $9,822,054 	Origin Bank	Choudrant, Louisiana	LA	 $-   	Gibson Eatherly; Shane Frederic	"7/24/23: Connected through Mason Dixon at Trustmark. Trying to setup a call.
8/30/23: Met with Gibson in Jackson, MS. Looking for a long term relationship, want deals in their market area. Primarily East Texas, North LA, and MS. Right on border of $10B, so aren't trying to grow above $10B banks are under scrutiny. Would like additional services and/or deposits. Seemed interested in Waterpointe, if Trustmark pushed them for it.
7/1/24: Held a call with Shane Frederic and his market president. Seem very interested in creating a long-term relationship. They are now open for business with plans to grow above their $10B mark. Looking at participating in Ransley 2. Like to keep participations below $10M, but could lead with more. Deposits are going to be a must."
 $9,798,352 	Amerant Bank	Coral Gables, Florida	FL	 $-   		
 $9,588,422 	Wintrust	Chicago	IL	 $-   	Ed Parker, Bradley Breman, Bill Jurjovec	"3/31/21: Had a call with Wintrust. Appeared interested. 
6/2/21: Wintrust has failed to respond despite multiple attempts to guage interest in specific deals."
 $8,349,541 	Southside Bank	Tyler, Texas	TX	 $-   		
 $8,003,224 	First Security Bank	Searcy, Arkansas	AR	 $-   		
 $7,956,641 	The First	Hattiesburg, Mississippi	MS	 $-   	David Roussel	7/1/24: Met with David about doing Ransley 2. Underwriting: 10% vacancy, 5% management contract, 1.25x DSCR, and 30yr am $ SOFR +275
 $7,790,270 	Bank Plus	Belzoni, Mississippi	MS	 $-   	Dennis Shill, Steve Latino	"6/2/23: Michael sent Steve portfolio dashboard to take a look at.
7/10/23: Steve Latino said they would need a payoff of a loan before they could lend again."
 $6,696,336 	b1Bank	Baton Rouge, Louisiana	LA	 $106,076,380 	Leslie Matlock, Mike Nizzo	
 $6,340,942 	Ocean Bank	Miami	FL	 $-   		
 $5,780,401 	Great Southern Bank	Springfield, Missouri	MO	 $-   	Chip Brinkman, Roy Jenkins	2/27/24: Toby and Michael had a call with them. Their bread and butter is MF construction. Max hold is $20-25MM per deal, $75MM across 3 deals. Would like a Charlotte deal to start, but they could work for other NC/SC deals.
 $5,686,763 	The American National Bank of Texas	Terrell, Texas	TX	 $-   		
 $5,597,213 	Broadway National Bank	San Antonio	TX	 $-   		
 $5,572,542 	TBK Bank	Dallas	TX	 $-   		
 $4,951,697 	SmartBank	Pigeon Forge, Tennessee	TN	 $-   		
 $4,938,380 	Wilson Bank and Trust	Lebanon, Tennessee	TN	 $-   		
 $4,901,970 	Community Bank of MS	Forest, Mississippi	MS	 $-   	Will Smithhart	"6/12/23: Met Community Bank reps to discuss the Waterpointe deal. They can't lend on that deal, but they seemed very interested in multfimaly construction lending. Michael looking to establish relationship with lender.
7/10/23: Per Will Smithhart, the bank is not participating in any deals unless Trustmark is the lead. Also will not take more than $10MM on any lead position. Wants to reschedule a meeting.
8/30/23: Confirmed that they could participate in Waterpointe, as long as we buy the landa  few weeks before closing construction loan."
 $4,843,386 	Beal Bank	Plano, Texas	TX	 $-   		
 $4,777,181 	Southern Bank and Trust	Mount Olive, North Carolina	NC	 $-   		
 $4,683,680 	Hometrust Bank	Asheville, North Carolina	NC	 $-   		
 $4,650,798 	Third Coast Bank	Humble, Texas	TX	 $-   	Melissa Abel	4/20/23:"I discussed with our CEO and we are in a holding pattern on multi family and saving our space for production residential. If this changes, I promise to let you know!" 
 $4,444,563 	Inwood National Bank	Dallas	TX	 $-   		
 $4,376,810 	Texas Bank and Trust	Longview, Texas	TX	 $-   		
 $4,266,722 	First National Bank Texas	Killeen, Texas	TX	 $-   		
 $4,253,594 	Capital City Bank	Tallahassee, Florida	FL	 $-   	Brantley Henderson	"6/30/23: The First was in contact with Capital City about The Waters at Crestview. They dropped out of that deal, but David asked to coordinate a meeting for future deals.
9/19/23: Had a call with Brantley. Internal hold limit of $10MM, so would rather participate than lead. However, most of the deals they have done are around 66% LTC, so our LTC may be a problem for them.
12/20/23: Multiple post-call follow-up emails have gone unanswered."
 $4,188,244 	Finemark National Bank & Trust	Fort Myers, Florida	FL	 $-   		
 $4,118,164 	Verabank	Henderson, Texas	TX	 $-   		
 $4,106,376 	Southern First Bank	Greenville, South Carolina	SC	 $-   		
 $3,962,516 	Encore Bank	Little Rock, Arkansas	AR	 $-   		
 $3,946,961 	Banesco USA	Coral Gables, Florida	FL	 $-   		
 $3,828,464 	Citizens First Bank	The Villages, Florida	FL	 $-   		
 $3,806,726 	The Fidelity Bank	Fuquay-Varina, North Carolina	NC	 $-   		
 $3,615,824 	Metro City Bank	Atlanta	GA	 $-   		
 $3,552,496 	First Guaranty Bank	Hammond, Louisiana	LA	 $-   	Christy Wells, Randy Vicknair, Craig Scelfo	"3/16/21: Would probably do a deal within their footprint, much lower leverage.
4/27/23: Sent information on Under Contract projects, along with financials. They confirmed they would look at a deal in LA. No further details to send them at this time.
6/13/23: Actively doing deals right now, market area basically matches our current market area, can do up to $40MM across 2 deals. Typically 80% of Hard Costs
12/7/23: Denied a participation in McGowin"
 $3,368,922 	River Bank & Trust	Prattville, Alabama	AL	 $-   	Chad Woddail, Doug Thomas	12/20/23: Michael sent info on Mobile deal to Chad. Will get back in the next few weeks.
 $3,349,192 	Home Bank	Lafayette, Louisiana	LA	 $12,500,000 	John Zollinger	
 $3,211,996 	Gulf Coast Bank and Trust	New Orleans	LA	 $7,065,771 	Ferd Marsolan, Bruce Falkenstein, Hart Bordelon	"5/22/23: Michael sent all financials. Awaiting details on their interest. Said they would like to lead, but also looking for loans not to exceed $5MM.
6/15/23: per Ferd ""I have run the information up our flagpole, so to speak, and before I take up too much of your time I need to tell you that Gulf Coast Bank chooses to pass on this opportunity at this time.  The main and only reason is that the requested amount is beyond our maximum commercial loan window of $5M.  Our bank will stretch on the right deal to a maximum of $10M but this also far exceeds our maximum commercial loan exposure.  Our bank also chooses to pass on any opportunity to participate in a subordinate position on a loan request.
10/25/23: Met with Bruce and HArt. They seemed much more open to the idea of financing us than Ferd did. Open to participations, could do up to $10MM, with $5MM being their sweet spot. Will go alll the way to Bay County."
 $3,119,475 	Pen-Air Credit Union	Pensacola, Florida	FL	 $19,000,000 	Tom Furr, Chris Funk	"4/5/22: Met for dinner in Austin, Tx. Expressed interest in doing a deal, sent Freeport package. Sent underwriting information, pursuing Freeport loan
12/20/23: Freeport loan approved, need remaining participations."
 $3,072,747 	Red River Bank	Alexandria, Louisiana	LA	 $5,000,000 	Jordan Hultberg	"3/16/21: They did a townhome deal with DSLD. They would need to be paid off there before doing a deal with Stoa.
5/25/23: Held call with Michael
6/13/23: Jordan called Michael to follow up after meeting with senior leadership. Red River want to lead a deal, would like to be as close to home as possible. Looking at roughly $15MM
7/26/23: Met with Jordan in person, $15-20MM hold limit. Would like to lead a deal, but willing to participate."
 $3,062,692 	The Bank of Tampa	Tampa, Florida	FL	 $-   		
 $3,005,346 	Colony Bank	Fitzgerald, Georgia	GA	 $-   		
 $2,890,968 	First Carolina Bank	Rocky Mount, North Carolina	NC	 $-   		
 $2,784,772 	Investar Bank	Baton Rouge, Louisiana	LA	 $-   	Mike Matthis	"6/15/23: Ryan talked to Mike Maththis, they are interested, could do up to $20MM
7/10/23: Aggresively trying to get into Crestview"
 $2,715,185 	Bank Independent	Sheffield, Alabama	AL	 $-   		
 $2,697,311 	BankFirst	Macon, Mississippi	MS	 $-   	Stephen Walker	7/1/24: Had a call with Stepehen Walker, introduced via Craig Hey. In-house limit of $25MM, lead of $15MM. Don't do participations just yet. Real Estate is their forte though.
 $2,645,695 	CB&S Bank	Russellville, Alabama	AL	 $-   		
 $2,597,979 	Southern Bancorp	Arkadelphia, Arkansas	AR	 $4,750,000 	Cory Whittington	12/20/23: Southern Bancorp approved for $4.75MM for Mobile
 $2,566,503 	American Momentum Bank	College Station, Texas	TX	 $-   		
 $2,534,505 	Guaranty Bank & Trust	Belzoni, Mississippi	MS	 $-   		Will Smithart with Community Bank to potentially make introduction.
 $2,512,175 	Southern States Bank	Anniston, Alabama	AL	 $-   		
 $2,488,336 	US Century Bank	Miami	FL	 $-   		
 $2,459,926 	Bryant Bank	Tuscaloosa, Alabama	AL	 $5,000,000 	Greg Strachan	12/20/23: Sent Greg information on Mobile deal to guage interest.
 $2,189,810 	Crews Bank & Trust	Wauchula, Florida	FL	 $-   		
 $2,174,160 	Pinnacle Bank	Elberton, Georgia	GA	 $-   		
 $2,146,581 	United Bank	Zebulon, Georgia	GA	 $-   		
 $2,114,308 	Queensborough National Bank & Trust	Louisville, Georgia	GA	 $-   		
 $2,079,824 	The Piedmont Bank	Peachtree Corners, Georgia	GA	 $-   		
 $2,049,528 	Coastal States Bank	Hilton Head Island, South Carolina	SC	 $-   		
 $2,003,415 	Planters Bank & Trust	Indianola, Mississippi	MS	 $-   	Fritz Anderson, Dev Patel	"12/20/23: Met with Fritz and Dev at the Stoa office. $5MM limit on participations. Very non-committal. Decided to pass on Mobile.
5/9/24: Heard about our Promenade Deal. Very interested in taking a look at it, but can only lead with $5MM. Participation might be the better route."
 $1,938,360 	Anderson Brothers Bank	Mullins, South Carolina	SC	 $-   		
 $1,885,960 	First Community Bank	Lexington, South Carolina	SC	 $-   		
 $1,861,049 	Cogent Bank	Orlando, Florida	FL	 $-   		
 $1,764,993 	The Conway National Bank	Conway, South Carolina	SC	 $-   		
 $1,743,564 	Thomasville National Bank	Thomasville, Georgia	GA	 $-   		
 $1,717,267 	Georgia Banking Company	Atlanta	GA	 $-   		
 $1,709,460 	The Citizens National Bank of Meridian	Meridian, Mississippi	MS	 $13,733,984 	James Brown	12/5/23: Received approval for The Waters at McGowin participation. Wants to be in future deals
 $1,698,887 	One Florida Bank	Orlando, Florida	FL	 $-   		
 $1,693,122 	Southpoint Bank	Birmingham, Alabama	AL	 $-   		
 $1,669,057 	Peoples Bank	Newton, North Carolina	NC	 $-   		
 $1,666,789 	South Atlantic Bank	Myrtle Beach, South Carolina	SC	 $-   		
 $1,598,899 	Oakworth Capital Bank	Birmingham, Alabama	AL	 $-   		
 $1,545,087 	Citizens National Bank	Bossier City, Louisiana	LA	 $-   	Don Greer	"12/2/22: $20MM hold limit, appeared interested.
4/24/23: ""We are closely watching our CRE numbers, so I need to pass on anything at this time."""
 $1,514,834 	Troy Bank & Trust	Troy, Alabama	AL	 $-   		
 $1,471,624 	The Citizens Bank	Philadelphia, Mississippi	MS	 $7,999,995 		
 $1,455,108 	Security Federal Bank	Aiken, South Carolina	SC	 $-   		
 $1,448,508 	Dogwood State Bank	Raleigh, North Carolina	NC	 $-   		
 $1,440,173 	Red River Employees Federal Credit Union	Texarkana, Texas	TX	 $500,000 		
 $1,438,905 	North State Bank	Raleigh, North Carolina	NC	 $-   		
 $1,428,883 	Morris Bank	Dublin, Georgia	GA	 $-   		
 $1,398,332 	Bank of Travelers Rest	Travelers Rest, South Carolina	SC	 $-   		
 $1,391,771 	Avadian Credit Union	Birmingham, Alabama	AL	 $2,000,000 		
 $1,357,121 	First American Bank & Trust	Vacherie, Louisiana	LA	 $-   	Brian Nizzo	5/3/23: per Saun "I talked to Brian Nizzo at First American about their ability to do another deal after west bank pays off and he said they would definitely look at.   It would have to be in their foot print so maybe another deal on west bank would work."     
 $1,352,457 	Neighbors Federal Credit Union	Baton Rouge, Louisiana	LA	 $-   	Eddie Vollenweider	"1/4/24: Liquidity is very tight, passed on any opportunity for a participation right now.
3/22/24: Freeport outside market area, but liquidity position is getting better."
 $1,313,139 	Citizens Bank & Trust - FL	Frostproof, Florida	FL	 $-   		
 $1,310,967 	Peoples Bank of Alabama	Cullman, Alabama	AL	 $-   		
 $1,257,698 	Primesouth Bank	Blackshear, Georgia	GA	 $-   		
 $1,243,979 	First State Bank of the Florida Keys	Key West	FL	 $-   		
 $1,240,437 	Pacific National Bank	Miami	FL	 $-   		
 $1,189,371 	United Bank	Atmore, Alabama	AL	 $-   		
 $1,186,176 	Synergy Bank	Houma, Louisiana	LA	 $4,000,000 		
 $1,161,233 	JD Bank	Jennings, Louisiana	LA	 $14,500,000 	Cherine Patin	12/20/23: Discussed Mobile deal with Cherine. Seemed interested, needed to have discussion with higher-ups
 $1,147,529 	First IC Bank	Doraville, Georgia	GA	 $-   		
 $1,144,417 	Bayfirst National Bank	St. Petersburg, Florida	FL	 $-   		
 $1,137,842 	Grove Bank & Trust	Miami	FL	 $-   		
 $1,134,497 	PriorityOne Bank	Magee, Mississippi	MS	 $-   		Will Smithart with Community Bank to potentially make introduction.
 $1,120,468 	Fidelity Bank	New Orleans	LA	 $12,000,000 	Kevin Schexnayder; Christian Blough	7/7/23: Michael met with Kevin and Christian, very interested in Mobile and Office Phase 2
 $1,104,751 	Citizens Bank & Trust - AL	Guntersville, Alabama	AL	 $-   		
 $1,103,094 	International Finance Bank	Miami	FL	 $-   		
 $1,100,857 	Peoplessouth Bank	Colquitt, Georgia	GA	 $-   		
 $1,094,604 	Uwharrie Bank	Albemarle, North Carolina	NC	 $-   		
 $1,087,312 	Bank of Central Florida	Lakeland, Florida	FL	 $-   		
 $1,064,706 	First US Bank	Birmingham, Alabama	AL	 $8,733,984 		
 $1,052,660 	Metro Bank	Pell City, Alabama	AL	 $-   		
 $1,044,175 	Helm Bank USA	Miami	FL	 $-   		
 $1,039,195 	Liberty Bank	New Orleans	LA	 $5,000,000 		
 $1,033,284 	BOM Bank	Natchitoches, Louisiana	LA	 $4,999,684 		12/20/23: Denied participation in Mobile.
 $1,026,420 	First Bank of Alabama	Talladega, Alabama	AL	 $-   		
 $1,005,278 	Resource Bank	Covington, Louisiana	LA	 $-   	Hunt Vaughn	"3/16/21: Board is not looking at apartment deals right now. 
4/20/21: Sent Resource Heritage Crossing information. Appeared interested at first, however ultimately could not get comfortable."
 $1,004,090 	First Metro Bank	Muscle Shoals, Alabama	AL	 $-   		
 $979,011 	AuburnBank	Auburn, Alabama	AL	 $-   		
 $857,946 	First Commercial Bank	Jackson, Mississippi	MS	 $-   	June Owens	12/20/23: Had call with June and her supervisor. Seem very interested in the Mobile deal and future deals.
 $850,462 	Community Bank of Louisiana	Mansfield, Louisiana	LA	 $5,000,000 		
 $778,776 	FNB Oxford Bank	Oxford, Mississippi	MS	 $-   	Drew Hull	1/10/24: Called Drew after being connected through Joe Schneider. Still looking for loans, and would like to take a look at a future deal. Community Development Financial Institution, so looking for areas with a certain % AMI threshold.
 $734,440 	Jefferson Financial Federal Credit Union	Metairie, Louisiana	LA	 $-   	Carie Lopez, Mark Rosa	1/4/24: Reached out to Carie, through Mark Rosa. Seemed interested, put in contact with Pen-Air to discuss Freeport. 
 $683,167 	Community First Bank	New Iberia, Louisiana	LA	 $4,999,684 		
 $643,709 	United Community Bank - Louisiana	Raceland, Louisiana	LA	 $5,000,000 	David Campbell	6/1/23: Held a call, interested in being a participant on future projects. Up to $12MM in total exposure, but less on individual deals. Primarily in LA. Hard for them to participate in SOFR indexed deals
 $605,524 	CommerceOne Bank	Birmingham, Alabama	AL	 $-   	Art Freeman; David Sizemore	"1/11/24: Called Art after being connected through Joe Schneider. Can't lead this deal size, and participations would be challenging for them right now. Mentioned a land loan as a possibility to work together.
6/28/24: Had a call with David Sizemore, connection through Craig Hey. Expressed similar sentiment. Working to get participations up and running but their bank hasn't adopted them yet."
 $594,410 	RadiFi Federal Credit Union	Jacksonville, Florida	FL	 $2,500,000 		
 $502,616 	Rayne State Bank	Rayne, Louisiana	LA	 $1,999,874 		
 $497,846 	Gibsland Bank & Trust	Gibsland, Louisiana	LA	 $-   		
 $490,653 	FNB Jeanerette	Jeanerette, Louisiana	LA	 $4,999,684 		
 $471,842 	Florida State University Credit Union	Tallahassee, Florida	FL	 $-   	Clay Smith	"1/5/24: Reached out to Clay after an introduction through Harvesters Credit Union. Put in contact with Dave Gooch to discuss Freeport deal.
3/21/24: Full on Multifamily"
 $459,577 	Magnolia State Bank	Bay Springs, Mississippi	MS	 $-   		
 $454,406 	United Mississippi	Natchez, Mississippi	MS	 $-   	Matthew Goldman	12/20/23: Introduction through Fidelity Bank. Interested in growth, but likely can't be in a deal until mid-24.
 $443,084 	Citizens Bank & Trust	Plaquemine, Louisiana	LA	 $3,000,000 		
 $410,082 	Bank of Zachary	Zachary, Louisiana	LA	 $4,500,000 		
 $381,360 	Southern Heritage Bank	Jonesville, Louisiana	LA	 $3,000,000 	Randy Ponthie	11/30/23: Toby and Michael met Randy at The Waters at Millerville. Bank already has approval for Mobile deal.
 $349,409 	Winnsboro State Bank & Trust	Winnsboro, Louisiana	LA	 $-   		
 $340,724 	Bank of St. Francisville	St. Francisville, Louisiana	LA	 $-   	Walker "Mac" Field	4/25/24: Met with Mac Field in Hammond. They can't lead a deal but could potentially participate. Geography isn't an issue for them. They could potnetially do some land banking for outparcels. Hold limit of $5MM
 $310,984 	Mutual Federal Credit Union	Vicksburg, Mississippi	MS	 $1,000,000 		
 $299,771 	CLB Bank	Jonesville, Louisiana	LA	 $3,999,747 		
 $297,407 	Citizens Savings Bank	Bogalusa, Louisiana	LA	 $-   		
 $293,862 	St Landry Bank	Opelousas, Louisiana	LA	 $2,500,000 		
 $291,944 	Harvesters Credit Union	Cantonment, Florida	FL	 $-   	Stanley Bruce	1/5/24: Connected with Stanley through Chad Henderson. Not in a Balance Sheet position to lend on a participation right now. Passed on Freeport.
 $278,402 	Catalyst Bank	Opelousas, Louisiana	LA	 $4,999,684 		
 $236,481 	American Bank & Trust	Opelousas, Louisiana	LA	 $-   		
 $221,900 	Aneca Federal Credit Union	Shreveport, Louisiana	LA	 $1,000,000 		
 $201,744 	Plaquemine Bank	Plaquemine, Louisiana	LA	 $1,000,000 		
 $195,855 	First National Bank USA	Boutte, Louisiana	LA	 $3,000,000 		
 $186,185 	Currency Bank	Oak Grove, West Carroll Parish, Louisiana	LA	 $-   	Scott Gaudin	7/26/23: Met with Scott at Currency Bank. $10MM internal limit, $15MM total lending limit. Like LA, SE Arkansas, East Texas. Mentioned 85% LTC.
 $164,607 	Farmers State Bank	Church Point, Louisiana	LA	 $-   		
 $136,933 	Heart of Louisiana Federal Credit Union	Pineville, Louisiana	LA	 $1,500,000 		
 $51,371 	Richton Bank & Trust	Richton, Mississippi	MS	 $-   		
`;

interface TargetedBankRow {
  assets: string | null;
  bankName: string;
  city: string;
  state: string;
  exposureWithStoa: number | null;
  contact: string | null;
  comments: string | null;
}

function parseTargetedBanksData(data: string): TargetedBankRow[] {
  const rows: TargetedBankRow[] = [];
  const lines = data.trim().split('\n').filter(line => line.trim() !== '');
  
  for (const line of lines) {
    // Split by tab character
    const columns = line.split('\t').map(col => col.trim());
    
    if (columns.length < 7) continue;
    
    const row: TargetedBankRow = {
      assets: columns[0] && columns[0].trim() !== '' ? columns[0].trim() : null,
      bankName: columns[1]?.trim() || '',
      city: columns[2]?.trim() || '',
      state: columns[3]?.trim() || '',
      exposureWithStoa: parseAmount(columns[4]),
      contact: columns[5] && columns[5].trim() !== '' ? columns[5].trim() : null,
      comments: columns[6] && columns[6].trim() !== '' ? columns[6].trim() : null
    };
    
    if (!row.bankName) continue; // Skip rows without bank name
    
    rows.push(row);
  }
  
  return rows;
}

async function main() {
  console.log('🚀 Starting Targeted Banks Import...\n');
  
  const pool = await getPool();
  
  try {
    const rows = parseTargetedBanksData(targetedBanksData);
    console.log(`📊 Parsed ${rows.length} rows of targeted banks data\n`);
    
    let banksCreated = 0;
    let bankTargetsCreated = 0;
    let bankTargetsUpdated = 0;
    let errors = 0;
    
    for (const row of rows) {
      try {
        // Check if bank exists before creating
        const existingBankId = await getBankId(pool, row.bankName);
        
        // Get or create bank
        const bankId = await getOrCreateBank(pool, row.bankName);
        if (!bankId) {
          console.log(`⚠️  Could not create/find bank: ${row.bankName}`);
          errors++;
          continue;
        }
        
        // Track if this was a new bank
        if (!existingBankId) {
          banksCreated++;
        }
        
        // Check if bank target already exists
        const existingResult = await pool.request()
          .input('BankId', sql.Int, bankId)
          .query('SELECT BankTargetId FROM banking.BankTarget WHERE BankId = @BankId');
        
        if (existingResult.recordset.length > 0) {
          // Update existing bank target
          await pool.request()
            .input('BankTargetId', sql.Int, existingResult.recordset[0].BankTargetId)
            .input('AssetsText', sql.NVarChar, row.assets)
            .input('City', sql.NVarChar, row.city)
            .input('State', sql.NVarChar, row.state)
            .input('ExposureWithStoa', sql.Decimal(18, 2), row.exposureWithStoa)
            .input('ContactText', sql.NVarChar(4000), row.contact)
            .input('Comments', sql.NVarChar(sql.MAX), row.comments)
            .query(`
              UPDATE banking.BankTarget
              SET AssetsText = @AssetsText,
                  City = @City,
                  State = @State,
                  ExposureWithStoa = @ExposureWithStoa,
                  ContactText = @ContactText,
                  Comments = @Comments
              WHERE BankTargetId = @BankTargetId
            `);
          bankTargetsUpdated++;
        } else {
          // Create new bank target
          await pool.request()
            .input('BankId', sql.Int, bankId)
            .input('AssetsText', sql.NVarChar, row.assets)
            .input('City', sql.NVarChar, row.city)
            .input('State', sql.NVarChar, row.state)
            .input('ExposureWithStoa', sql.Decimal(18, 2), row.exposureWithStoa)
            .input('ContactText', sql.NVarChar(4000), row.contact)
            .input('Comments', sql.NVarChar(sql.MAX), row.comments)
            .query(`
              INSERT INTO banking.BankTarget (BankId, AssetsText, City, State, ExposureWithStoa, ContactText, Comments)
              VALUES (@BankId, @AssetsText, @City, @State, @ExposureWithStoa, @ContactText, @Comments)
            `);
          bankTargetsCreated++;
        }
        
        console.log(`✅ Processed: ${row.bankName}`);
      } catch (error: any) {
        console.error(`❌ Error processing ${row.bankName}:`, error.message);
        errors++;
      }
    }
    
    console.log('\n📊 Import Summary:');
    console.log(`  ✅ Banks created: ${banksCreated}`);
    console.log(`  ✅ Bank targets created: ${bankTargetsCreated}`);
    console.log(`  ✅ Bank targets updated: ${bankTargetsUpdated}`);
    console.log(`  ❌ Errors: ${errors}`);
    
  } catch (error: any) {
    console.error('❌ Fatal error:', error);
    throw error;
  } finally {
    await pool.close();
  }
}

if (require.main === module) {
  main().catch(console.error);
}
