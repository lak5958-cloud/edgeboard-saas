# ENGR 310 SaaS project plan

Based on the two supplied assignment/transcript screenshots. Exact due dates were not supplied; confirm them in Canvas.

| Requirement | Current preparation | Evidence still needed |
|---|---|---|
| Public working product/homepage | Responsive portable web app | Public deployment URL and fresh-browser walkthrough |
| Real signup and repeat login | Supabase-backed server endpoints and forms | Configure Supabase, verify signup, login, logout and confirmation settings |
| Useful AI core feature | Trade evidence brief uses a real OpenAI API call over computed trade evidence | Connect API key/model and record successful sourced analysis |
| Real Stripe checkout and owner's live $1 charge | Checkout, portal, signed webhook, server entitlements | Eligibility, test flow, then owner's live transaction and receipt |
| Grader normal login with paid access | Confirmed-user provisioning script | Seed demo@demo.com / password123! and test deployed normal login |
| Week one pitch/income statement | Product scope and assumptions below | Student video and instructor's required income-statement format |
| Week three peer review/debugging | Launch checklist and tests | Real peer feedback and fixes |
| Week four five potential customers/reflection | Defined target user and free onboarding | Five real interviews/tests, records and reflection video |

Proposed pitch: EdgeBoard helps fantasy football and basketball managers compare trades with visible scoring and source-backed context, then offers a deeper research workspace for people who want to inspect the evidence themselves. Free tools make the first use useful; Pro sells depth and convenience rather than guaranteed winning bets.

## Income statement planning assumptions (not measured results)

A proposed $15/month subscription would require 200 paying subscribers for $3,000 monthly gross revenue. It is a scenario, not the configured final price or evidence of demand. Payment fees, licensed sports data, AI usage, hosting, support, refunds and taxes reduce profit. A class projection should list each cost explicitly and use actual vendor quotations; no unverified vendor prices are supplied here. If the goal means $3,000 PROFIT rather than revenue, calculate required subscriptions after those costs. Price validation is a customer-interview task.

## Four-week execution

1. Deploy the free trade workflow, connect real data and signup, seed grader; record pitch; finish income-statement assumptions.
2. Complete verified fantasy coverage and schedule import; connect AI; implement owner cloud collection; test billing in test mode.
3. Show peers the actual product, log observed failures, improve onboarding, performance, scoring and mobile accessibility.
4. Recruit five plausible customers and collect honest feedback; verify all rubric requirements, perform the approved live $1 proof, record reflection. Extra credit requires an actual paying customer, not a fabricated testimonial.

## Verified implementation status, November 2, 2026

- Public production: https://edgeboard-saas.vercel.app/ . Home, trade analyzer, daily picks and gated research are deployed. Automatic private odds/stat refresh is active.
- Statistical research: existing empirical season/team model and decision gates retained. Current-team fantasy scoring, schedule scenarios and incomplete-data warnings are explicit. No independently validated profitability or calibrated future forecast is claimed.
- Grader: demo@demo.com / password123! exists as a confirmed real Supabase Auth account with permanent grader entitlement. Owner privileges remain separate. Normal deployed login and server authorization are tested; the grader cannot request owner refresh actions.
- AI: evidence-prioritization code accepts only verified evidence IDs, keeps the calculated recommendation fixed and renders source-derived numbers on the server. OPENAI_API_KEY and AI_MODEL must be added to Vercel Production and redeployed before live AI verification. No canned explanation is presented as a successful AI response.
- Billing: Stripe keys, price and webhook secret are not configured. Checkout, cancellation, entitlement reconciliation and the student's required live $1 receipt remain unverified. No real payment has been made.
- Customer launch: support contact and applicable data-feed distribution rights need confirmation. Peer feedback, five real customer tests, income-statement submission and student videos cannot be claimed complete without their actual evidence.

### Evidence-first product policy

The statistical engine supplies scoring and experimental recommendations. AI only prioritizes existing evidence and limitations, never substitutes its own statistics, odds, probabilities, schedule multipliers or betting edges. Schedule pace is a descriptive scenario. The daily shortlist distinguishes Leans from Pass watchlist items. No minimum pick count is forced.
