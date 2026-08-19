# RankKW — Design System Specification

## 1. Design Direction

RankKW should feel:

- Modern
- Professional
- Trustworthy
- Calm
- Data-driven
- Premium

The interface should feel like a serious business intelligence/operations product, not a generic AI dashboard.

## 2. Existing Screens Are the Source of Truth

If existing RankKW screens contain an established:
- Color palette
- Logo
- Typography
- Spacing
- Radius
- Component style
- Icon style

**Preserve and extend that system.**

Do not replace the existing visual identity merely for novelty.

Before creating new UI, inspect the existing screens and extract:
- Primary color
- Secondary color
- Accent
- Background
- Surface
- Border
- Text
- Muted text
- Success
- Warning
- Error
- Info

If the existing screens do not define these clearly, use the fallback palette below.

## 3. RankKW Fallback Palette

Use an original RankKW palette. Do not imitate Etsy, eRank, EverBee, Alura, Amazon, Shopify, Daraz, or other competitors.

### Core
- Ink: `#17202A`
- Deep Slate: `#263645`
- Brand Teal: `#167C80`
- Brand Teal Dark: `#0F5F63`
- Brand Mint: `#D9F1ED`

### Surfaces
- Background: `#F7F9F8`
- Surface: `#FFFFFF`
- Surface Subtle: `#EEF3F2`
- Border: `#D9E2E0`

### Text
- Primary: `#17202A`
- Secondary: `#53636B`
- Muted: `#7B898F`

### Semantic
- Success: `#247A55`
- Warning: `#A66A18`
- Error: `#B94A48`
- Info: `#356A9A`

These are a fallback only. Existing RankKW screens override them if an established brand system exists.

## 4. Typography

Preferred font:

**Inter**

Fallback:
```text
Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif
```

Typography should prioritize readability over visual novelty.

### Scale

- Display: 40–48px / 1.05–1.1
- H1: 32px / 1.15
- H2: 24px / 1.2
- H3: 20px / 1.25
- H4: 16–18px / 1.3
- Body: 14–16px / 1.5
- Small: 12–13px / 1.4
- Caption: 11–12px / 1.35

Use font weight intentionally:
- 400 regular
- 500 medium
- 600 semibold
- 700 bold only for strong emphasis

## 5. Layout

Use a calm, structured grid.

Recommended:
- Desktop content max-width: 1440px
- Comfortable page padding
- Consistent 8px spacing base
- Use 8/16/24/32/48 spacing rhythm

Do not compress complex analytical screens into tiny cards.

## 6. Navigation

Sidebar should support:
- Clear hierarchy
- Active state
- Grouped sections
- Short labels
- Tooltips where needed
- Collapsed state if appropriate

Primary navigation should emphasize:
1. Dashboard
2. Research
3. Listings
4. Profit
5. Tools
6. Data
7. Billing
8. Settings

## 7. Cards

Cards should be:
- Clean
- Lightly bordered
- Purpose-driven
- Consistent in radius
- Easy to scan

Avoid:
- Heavy shadows
- Excessive gradients
- Huge rounded containers everywhere
- Decorative card overload

## 8. Data Visualization

Charts must answer a decision question.

Good:
- Baseline vs actual
- Revenue trend
- Profit waterfall
- Listing health distribution
- Event timeline

Avoid charts that exist only to make the dashboard look sophisticated.

## 9. Provenance UI

Make data status visually understandable.

Suggested labels:

- VERIFIED — source-backed
- CALCULATED — deterministic calculation
- ESTIMATED — model/estimate
- SELLER INPUT — user-provided
- UNAVAILABLE — insufficient data

Important metrics should have a compact provenance affordance.

Clicking it can open:
- Source
- Methodology
- Confidence
- Freshness
- Limitations

## 10. Action Center UI

Prioritize actions over metrics.

An action should contain:
- Severity
- Clear title
- One-sentence explanation
- Evidence
- Primary action
- Secondary action where useful

Example:

**SALES DROP**  
Your shop is 43% below its recent baseline.  
6 listings changed before the decline.  
`Investigate`

## 11. Shop Pulse UI

Use:
- Baseline line
- Actual line
- Event markers
- Clear date ranges
- Evidence panels
- Correlated / Ruled Out / Unknown labels

Never use visual treatment that implies certainty when evidence is uncertain.

## 12. Bulk Editor UI

Make the workflow visually explicit:

**1 Select → 2 Configure → 3 Validate → 4 Preview → 5 Confirm → 6 Apply**

The diff screen must make changes obvious.

Dangerous actions should require deliberate confirmation.

## 13. Profit Reality UI

Use a strong waterfall hierarchy:

Revenue  
↓  
Costs  
↓  
Net Profit

Always show:
- Coverage
- Confidence
- Missing cost data

Scenarios should be easy to compare:
- Conservative
- Base
- Optimistic

## 14. AI UI

AI should feel like an assistant, not magic.

Use language such as:
- Draft
- Suggested
- Based on available data
- Review before applying

Avoid:
- "AI knows..."
- "Guaranteed ranking"
- Fake confidence meters
- Fake autonomous-agent theatrics

## 15. Animation

Use subtle motion only for:
- Page transitions
- Loading
- State changes
- Success feedback
- Expand/collapse

Avoid:
- Constant floating animation
- Excessive parallax
- Decorative motion
- Long transitions

## 16. Accessibility

- WCAG-conscious contrast
- Keyboard navigation
- Visible focus
- Semantic HTML
- Accessible forms
- Accessible dialogs
- Screen-reader labels
- Do not rely on color alone

## 17. Responsive

Design intentionally for:
- Desktop
- Tablet
- Mobile

Do not simply shrink desktop cards.

For mobile:
- Prioritize action content
- Stack complex layouts
- Keep primary actions accessible
- Make tables scrollable or transform them appropriately

## 18. Design Don'ts

Never create:
- Generic purple AI SaaS aesthetics
- Competitor clones
- Excessive gradients
- Giant metric walls
- Fake AI gimmicks
- Cluttered dashboards
- Unnecessary illustrations
- Unnecessary animation
- Inconsistent icon families
- Random colors without semantic meaning
