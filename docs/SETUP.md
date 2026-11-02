# Connection and deployment guide

## 1. Supabase

Create a dedicated project for this class. Save the project URL, anon/public key and service-role key into the matching `.env` fields. Only the server uses the service-role key. Run supabase/schema.sql in the SQL editor. It creates entitlements, an atomic request-budget RPC and a private Storage bucket. No anonymous or authenticated client may write an entitlement or read the bucket directly.

Set APP_URL exactly to your origin, initially http://localhost:3000 with no trailing slash. Set RATE_LIMIT_SALT to a newly generated random secret, for example `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Configure Supabase Site URL and allowed redirects for your local and eventual Vercel origin. Enable password signup. For a minimal class alpha, disable email confirmation for ordinary signups or configure/verify SMTP and confirmation templates; verify the complete confirmation flow before relying on it. No password-reset UI is implemented yet.

Run `npm run seed:demo`. This creates and confirms demo@demo.com with password password123! and grants grader access by the created UUID. It is not an administrator. If the user already exists, inspect that user in Supabase, then grant by its correct UUID in SQL:

```sql
insert into public.entitlements(user_id,kind) values ('ACTUAL-USER-UUID','grader') on conflict do nothing;
```

The class requires known grader credentials. Anyone who knows them can use that grader account; remove it or rotate its password and revoke the grader entitlement when the class ends. The account's AI request budget prevents unbounded use. Never publish an owner/admin password.

## 2. Import the existing statistics

Keep the existing console untouched. From the NEW SaaS folder run:

```powershell
npm run import:data -- "C:\Users\logan\Downloads\EdgeBoard_Research_Console_NBA_NFL\data"
```

This reads only the listed JSON snapshots and uploads them to private Supabase Storage. It does not read config, key.dpapi, refresh logs or archives. Existing local refresh/backtest jobs continue separately. Run this importer again after fresh results are saved; the cloud app caches snapshot reads for up to a minute.

The first version still depends on owner-run imports. To remove that dependence, port collectors to a separate scheduled job with persistent Storage output and concurrency locks, then schedule at the desired frequency. Do not claim hourly cloud updates until that job has been installed and observed. Your provider plan must permit the public/paid redistribution you intend; current paid API access alone does not establish those rights.

## 3. AI

Create a server-side OpenAI API key, set OPENAI_API_KEY, and set AI_MODEL to a currently available model supporting JSON-object output. No model name is hard-coded. OpenAI API usage is separate from a ChatGPT subscription. Sign in, calculate a trade, then choose Explain this trade with AI. Test both complete evidence and missing evidence. The AI cannot change the deterministic recommendation or numerical score. Its qualitative explanation can still err and needs review.

## 4. Stripe

Describe the actual offering accurately to Stripe. This product includes sports forecasting/betting research, and Stripe eligibility must be confirmed for that business model. Do not conceal restricted content by renaming it. A fantasy-research-only paid offer can be the class MVP if the instructor accepts the scope and Stripe supports it.

Use test mode first. Create a recurring Pro product/price and put its `price_...` identifier in STRIPE_PRICE_ID, its secret key in STRIPE_SECRET_KEY. Configure the customer portal. Add a webhook to https://YOUR-APP/api/billing/webhook for checkout.session.completed, customer.subscription.created/updated/deleted and invoice.paid/payment_failed. Put its signing secret in STRIPE_WEBHOOK_SECRET. For local tests, use Stripe CLI forwarding to localhost:3000/api/billing/webhook.

Use Stripe's documented test card in test mode. Confirm that a free account gets HTTP 402 from research-data endpoints, checkout creates a real session, a signed webhook grants entitlement, and cancellation/nonpayment removes access when its active entitlement ends. A success-page visit alone must not unlock anything. Repeated webhook delivery uses an upsert; authoritative state is fetched from Stripe. Simultaneous webhook processing still requires concurrency/load testing before scale.

After eligibility and all test checks pass, use live keys, a live price and live webhook secret, and set STRIPE_LIVE_ENABLED=true. The class requires the owner to perform a real $1 charge on their own card. One option is a clearly disclosed $1/month grading price, then cancel it through the portal after verification. The owner performs that transaction; it has not been run for you. Test-mode evidence does not satisfy a live-charge requirement. Display the final chosen price and renewal interval prominently on the pricing page before customer launch.

## 5. GitHub and Vercel

Create a PRIVATE GitHub repository. Add this extracted folder's CONTENTS as the repository root, not the old Windows project. Ensure `.env`, local data and keys are absent from git status. The .gitignore provides defaults. The project has no npm dependencies, so no dependency installation is needed.

In Vercel, Add New > Project > import the repository. Use framework Other, no build command, and output directory `public`. Node runtime must satisfy package.json. vercel.json supplies API function rewrites and security headers. Add environment variables in Vercel settings, set APP_URL to the final https://...vercel.app origin, and redeploy. Keep local .env APP_URL local. Add the new Supabase allowed URL and Stripe webhook destination. No Vercel/GitHub account or deployed URL was created in this package.

Run the end-to-end acceptance checklist in HANDOFF.md with real services. Test phone and desktop layouts. Review source attribution, data rights, contact/privacy terms and accessibility before public launch. Do not invite paying customers until these checks pass.
