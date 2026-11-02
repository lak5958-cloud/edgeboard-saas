# Continuation handoff — EdgeBoard SaaS alpha

The user wants GitHub/Vercel and may continue in Claude. This repository is intentionally portable vanilla HTML/CSS/modules plus Node serverless endpoints, with no Sites hosting identity or platform lock-in. No deployment exists yet. Do not replace the working desktop installation; legacy-console/ preserves the prior release.

## Important files

- public/index.html, style.css, app.mjs: public product UI and free tools.
- api/server.mjs: server handler, route authorization, origin checks and rate budgets.
- lib/auth.mjs, billing.mjs, cloud.mjs: real service integrations and entitlements.
- lib/fantasy.mjs: deterministic fantasy scorer and conservative trade comparison.
- lib/prediction.mjs etc.: reused original research engines.
- public/console/: original dashboard adapted for protected cloud read-only snapshots; evidence pagination and worker paths patched.
- supabase/schema.sql: private storage/entitlements and service-only budget RPC.
- scripts/import-data.mjs: explicit-allowlist original saved-data import, no keys.
- scripts/seed-demo.mjs: required ordinary confirmed grader account.

## Highest-priority remaining work

1. Connect the owner's Supabase and import real data; validate JSON schemas, counts and public redistribution rights. Complete NFL cross-category fantasy inputs. No source data was supplied in this task.
2. Configure auth/email confirmation, AI and Stripe with owner credentials. Verify Stripe eligibility for the actual sports product and align the paid scope with class/instructor guidance.
3. Deploy to GitHub/Vercel and run real end-to-end tests. The current tests use synthetic fixtures and no connected accounts.
4. Port owner data collection to an unattended cloud job. Current Windows refresh is preserved, not replaced. Add immutable versioned snapshots plus atomic manifest publication (current file-by-file imports can mix snapshot versions).
5. Precompute the daily shortlist in the data pipeline. The current request-time scan retains original rules, may time out on large slates, and does not cache whole-slate rankings. Measure representative user data before scaling.
6. Add server-side premium queries per player/stat instead of downloading all premium evidence to a paid browser. Current bulk endpoints are authenticated and paginated but not optimized for large datasets.
7. Support custom scoring, fumbles/bonuses, category formats and roster-slot/replacement analysis. Fit/validate opponent and lineup effects before applying multipliers. Current 21-day schedule context is descriptive only.
8. Add password reset, email change, self-service account deletion, structured observability, support contact, privacy/terms, persistent saved trades and per-user notes. Those flows are not implemented. Current logout clears the local session but does not revoke every device session.
9. Harden subscription processing with serialized per-subscription reconciliation/periodic repair; test simultaneous/duplicate/delayed webhook delivery, cancellations and unpaid renewals. Current upsert plus live subscription retrieval is useful but not a complete concurrency solution.
10. Add full user/provider-ID identity joins, duplicate/conflict checking for supplemental fantasy records, request-time schema validation, source freshness gates, load and abuse tests, real browser/mobile QA. AI qualitative output is untrusted prose; current structural/numeric guardrails are not a proof of factual correctness.

## Acceptance checklist before calling it production-ready

- Anonymous direct data requests get 401; free authenticated requests get 402; paid and grader get only allowed data. No paid raw JSON in static assets.
- Sign up, sign in, refresh a session, sign out; no email-based privilege bypass. Supabase RLS blocks direct client reads/writes of storage and entitlements.
- A real imported NBA trade and NFL trade show correct math and source IDs. Incomplete scoring, traded-player history, DNP/unknown phase and stale/unknown injury data remain explicit. Supplemental zero fields are verified, not assumed.
- Daily picks use current exact book price and quote date. No forced pick when no Lean qualifies. Old cached prices must not appear as today’s results.
- AI call succeeds with a configured model and never alters numerical outputs or entitlement. Realistic prompt injection and factual-consistency tests needed.
- Stripe test checkout/webhooks/portal work; altered signatures fail; redirects cannot grant access; renewals/cancellations reconcile. Owner then completes approved live $1 proof.
- Grader credentials pass the normal login and open paid research without email verification. No owner/admin capabilities given.
- Inspect 390px/mobile and desktop, keyboard-only navigation, readable errors and external failure states. Check timeouts at real dataset scale.

## What not to claim

Do not claim validated betting edges, full rest-of-season projections, a fully opponent-aware model, live deployment, successful real payments, real customer feedback, or automatic hourly cloud data until those are actually completed and evidenced. Changing warning text or lowering gates to populate recommendations is not model validation.
