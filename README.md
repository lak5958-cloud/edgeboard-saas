# EdgeBoard SaaS — v2.0.1 alpha

**First time setting up a SaaS? Start with START-HERE.md.** It lists the assignment requirements and walks through the account/setup steps in order.

A portable Node/Vercel web application built around the existing EdgeBoard v1.12.1 research engines. No framework installation or build dependencies are needed. This is a tested development handoff, not a deployed or connected production service.

## Start locally on Windows

1. Extract this ZIP to a NEW folder such as Downloads\EdgeBoard-SaaS. Do not overwrite the installed Windows research console.
2. Install Node.js 22 or later if needed. Open a terminal in the extracted folder.
3. Run `npm run dev`, or double-click START-SAAS-WINDOWS.bat.
4. Visit http://localhost:3000. The interface works without keys. Data, accounts, billing and AI remain unavailable until configured; no fabricated demo statistics are loaded.
5. Copy `.env.example` to `.env` using File Explorer or `Copy-Item .env.example .env`. Never upload `.env` or paste secret values into chat.
6. Follow docs/SETUP.md to connect Supabase, import data, provision the grader and configure billing/AI.

## Included

- Readable public homepage; separate trade analyzer and daily picks pages; clear navigation and active-page indicators; plans, real-auth forms, account, privacy and research pages.
- Server-side Supabase Auth token verification, refresh cookies, signup/login, local session sign-out, persistent entitlements and hourly request budgets.
- Stripe subscription checkout, signed webhook verification, authoritative subscription lookup and billing portal. Access never comes from the checkout success URL, email string, client flags or browser storage.
- AI trade evidence briefs through a real server-side OpenAI call. Statistical scores and the recommendation are computed separately; AI cannot set them. Missing configuration produces a visible unavailable error, not a fake AI response.
- Existing NBA/NFL research UI embedded with server-protected data endpoints. Original Windows source is preserved in legacy-console/ for rollback/reference. Its key/config/data were not included or changed.
- Allowlisted private snapshot importer, required grader-account provisioning script, SQL schema, Vercel configuration, tests and handoff documentation.

## Access model

Anyone: fantasy player names and trade calculation; qualifying daily picks only. Signed-in free users: three AI brief requests/hour. Pro/grader: research snapshots and twenty AI brief requests/hour. Payment/card handling occurs on Stripe. The grader is a normal confirmed Supabase account with a database entitlement, not a login bypass.

## Data limitations you must understand

The supplied package does not contain your live local data or provider key. Imported data is required for sports analysis. Importing existing logs does not make missing fantasy inputs complete. NFL passing/rushing/receiving categories cannot be presumed zero when absent from a log. Supplemental verified complete fantasy records are supported; see docs/DATA-CONTRACT.md. Until adequate inputs are present, the tool reports insufficient evidence.

Strength of schedule shows sourced future opponents and historical team points allowed when supplied. It is not position-specific and is not a fitted projection adjustment. No rest-of-season projection is fabricated. Standard NFL fumbles, bonuses, IDP, dynasty and category scoring are not included. The UI declares its supported scoring rules. Multi-player unequal trades require replacement/roster context and do not receive an unconditional accept.

The full hosted research console is read-only. Owner collection still runs in the preserved desktop pipeline; automatic cloud collection, user notes and on-demand history collection have not been ported. Long backtests must not be placed inside Vercel request handlers. Bulk evidence reads are paginated. Daily-pick scans retain the original eligibility rules and may return no picks. Large slates/data need load testing and precomputation before public scale.

## Verification

`npm test` runs SaaS scoring/security/handler tests. `npm run check` checks syntax. `node --test legacy-console/*.test.mjs` runs preserved original tests. Auth, Stripe and AI external integrations need end-to-end verification with your accounts. This package is not described as production-ready until the launch checklist passes.

Read docs/HANDOFF.md for Claude/GitHub/Vercel continuation and docs/CLASS-PLAN.md for the assignment map.
