# RankKW — Product Requirements Document

**Status:** Build specification  
**Product:** RankKW  
**Category:** Etsy Seller Decision & Operations Intelligence

## 1. Product Vision

RankKW is not another Etsy keyword/SEO dashboard. It is an Etsy Seller Decision & Operations Intelligence platform.

The product should answer:

> **What is happening in my Etsy shop, what can I reasonably infer from the evidence, what should I do next, what happened after I acted, and what did it mean for my profit?**

Core loop:

**DISCOVER → DIAGNOSE → DECIDE → FIX → VERIFY → MEASURE → LEARN**

The product must optimize for:

**TRUST + ACTIONABILITY + SAFETY + RETENTION**

## 2. Target Users

### Primary
- Solo Etsy sellers
- Growing Etsy businesses
- Sellers with many listings
- Sellers who need listing/SEO optimization
- Sellers who need operational automation
- Sellers who want to understand sales changes
- Sellers who need better profit visibility

### User Problems

Users struggle to:
- Know what deserves attention today
- Understand why shop performance changed
- Separate facts from estimates
- Optimize many listings safely
- Know whether a change actually worked
- Understand real profit after fees and costs
- Turn research into concrete actions

## 3. Product Experience

The home experience must answer:

**WHAT NEEDS MY ATTENTION?**

Do not make the dashboard a wall of metrics.

An important insight must lead to a useful destination/action.

Example:

Shop Pulse → Sales drop → Evidence/diagnosis → Review affected listings → Safe Bulk Editor → Verify recovery → Profit Reality.

## 4. MVP — Must Have

### 4.1 Action Center
Prioritized actions with:
- Priority
- Severity
- Title
- Explanation
- Evidence/source
- Destination
- Status
- Created time
- Completion time
- Dismissed state

No dead-end alerts.

### 4.2 Shop Pulse
Seller-specific monitoring based on the shop's own historical baseline.

Detect observable changes in:
- Sales
- Revenue/orders
- Title
- Tags
- Price
- Description
- Listing state
- Stock

Diagnosis labels:
- CORRELATED
- RULED OUT
- UNKNOWN

Never claim access to Etsy's private ranking algorithm.

### 4.3 Data Provenance
Every important metric must identify:
- VERIFIED
- CALCULATED
- ESTIMATED
- SELLER_INPUT
- UNAVAILABLE

Also show:
- Source
- Methodology
- Confidence
- Freshness
- Limitations
- Coverage where applicable

Estimated data must never look like verified facts.

### 4.4 Listing Audit
Evaluate observable listing information:
- Listing health
- Title quality
- Keyword alignment
- Tag quality
- Description quality
- Completeness
- Issues
- Recommended actions

### 4.5 AI Rewrite Copilot
AI may assist with:
- Title suggestions
- Tag suggestions
- Description improvements
- Listing rewrites
- Issue explanations
- Action recommendations

AI output is a draft. Human approval is required before applying changes.

### 4.6 Safe Bulk Editor
Workflow:

**SELECT → CONFIGURE → VALIDATE → DIFF PREVIEW → CONFIRM → APPLY → AUDIT → ROLLBACK**

Supported fields:
- Title
- Tags
- Description
- Price
- Quantity
- State

Operation states:
- DRAFT
- VALIDATING
- READY
- APPLYING
- PARTIAL_SUCCESS
- COMPLETED
- FAILED
- ROLLBACK_AVAILABLE
- ROLLED_BACK

Every mutation must have an operation ID and audit record.

### 4.7 Profit Reality
Financial intelligence, not a simple calculator.

Waterfall:

Gross Revenue  
→ Etsy Fees  
→ Payment Processing  
→ Offsite Ads  
→ Shipping  
→ COGS  
→ Labor  
→ Other Costs  
→ **NET PROFIT**

Show:
- Revenue
- Costs
- Net profit
- Margin
- Coverage
- Confidence
- Missing data

Scenarios:
- Conservative
- Base
- Optimistic

Editable inputs:
- Sales
- Average price
- COGS
- Shipping
- Etsy fees
- Ads
- Labor
- Other costs

### 4.8 Etsy Shop Connection
Build a clean Etsy OAuth/API abstraction.

**Initial website development must work completely in mock/demo mode.**

Real Etsy credentials are not required for UI development.

### 4.9 Event / Change History
Immutable events power:
- Shop Pulse
- Rollback
- Audit history
- Action Center
- Historical analysis

Event types include:
- PRICE_CHANGED
- TITLE_CHANGED
- TAGS_CHANGED
- DESCRIPTION_CHANGED
- LISTING_DEACTIVATED
- LISTING_REACTIVATED
- STOCKOUT
- BULK_EDIT_STARTED
- BULK_EDIT_COMPLETED
- BULK_EDIT_FAILED
- AI_CHANGE_APPLIED

### 4.10 Billing & Usage
Show:
- Plan
- Price
- Usage
- Limits
- Renewal
- Cancellation
- Upgrade
- Downgrade
- Trial terms
- Refund terms
- Billing history

No dark patterns.

### 4.11 Onboarding
Guide users through:
- Account setup
- Shop connection/demo mode
- Initial shop context
- First useful insight/action

### 4.12 Complete UI States
Every important screen needs:
- Loading
- Empty
- Error
- Success
- Partial data
- Unavailable data

## 5. Existing Features — Preserve

Do not remove:
- Etsy Connect
- Listing Audit
- AI Rewrite Copilot
- Keyword Explorer
- Keyword Lists
- Free Tool Hub
- CSV Export
- Billing
- Onboarding

Integrate them into the RankKW product loop.

## 6. Should Have

- Keyword Explorer improvements
- Keyword Lists
- Chrome extension
- Firefox extension
- Simple Calculator
- Weekly Shop Pulse Digest
- CSV Export
- Free Tool Hub
- Opportunity Research

## 7. Could Have

- Advanced seasonal modeling
- ML anomaly detection
- Advanced recommendations
- Additional extension integrations
- More advanced profit modeling

## 8. Explicitly Not Now

Do not build:
- A replacement for the Etsy Seller Dashboard
- A system claiming to predict Etsy's private algorithm
- Automatic destructive listing changes
- Fully autonomous AI publishing
- Fake exact competitor sales numbers
- A full accounting platform

## 9. Navigation

Recommended information architecture:

- Dashboard
  - Action Center
  - Shop Pulse
- Research
  - Keywords
  - Opportunities
  - Niche Research
- Listings
  - All Listings
  - Listing Audit
  - AI Copilot
  - Bulk Editor
- Profit
  - Profit Reality
  - Scenarios
  - Costs
- Tools
  - Simple Calculator
  - Fee Calculator
  - Ads ROI Calculator
  - Profit Calculator
  - Category Finder
  - Seasonal Calendar
  - Keyword Lists
  - Trademark Screening
- Data
  - Methodology
  - Data Sources
- Billing
  - Plan
  - Usage
  - Billing History
- Settings
  - Etsy Connection
  - Browser Extension
  - Notifications
  - Account

## 10. Browser Extension

Chrome/Firefox companion experience.

When an Etsy listing is detected:
- Listing health
- Keyword opportunities
- Optimization opportunities
- Data confidence
- Estimated vs verified
- Quick actions

States:
- Logged out
- No shop connected
- Listing detected
- Loading
- Data unavailable
- Estimated data
- Error
- Non-Etsy/non-listing page

Never expose Etsy credentials in the extension.

## 11. Simple Calculator

Keep this separate from Profit Reality.

Support:
- Percentage
- Discount
- Profit
- Margin
- Markup
- Fee
- Net Revenue
- Break-even

Requirements:
- Fast
- Deterministic
- No Etsy connection required
- Validation
- Formula display
- Copy result
- Reset
- Mobile support

## 12. Success Criteria

A seller should finish a session feeling:

- I know what changed.
- I understand what the data means.
- I know what I should do.
- I can make the change safely.
- I can see whether it worked.
- I understand how it affected my profit.
