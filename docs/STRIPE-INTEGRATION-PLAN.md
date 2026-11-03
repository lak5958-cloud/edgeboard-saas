# EdgeBoard billing integration

Prepared with Stripe's implementation planner on 2026-11-03. Accepted guide: `iguide_61VgtKs6VG3bwHK3O41AKuQHeLTIr`.

## Product and environment

- Business: EdgeBoard Sports, https://edgeboard-saas.vercel.app/.
- Free: fantasy trade comparisons and Daily Picks. Paid: detailed Research Pro and the higher AI-brief allowance.
- Research Pro: USD 7.99 each month. No Pro free trial or usage charge is configured. A free account requires no payment information.
- The currently authorized Stripe account is **EdgeBoard Sports sandbox**, `acct_1UXRg9AKuQHeLTIr`. These resources cannot collect real money.
- Product: `prod_VYce3wr49xkS8h`.
- Monthly price: `price_1UXVPBAKuQHeLTIrG9TaMciu`, verified active, USD 799 cents, one month, licensed quantity.
- Portal configuration: `bpc_1UXVOxAKuQHeLTIrUScXxBqt`.
- Webhook: `we_1UXVSaAKuQHeLTIrC3LZFsmG`, https://edgeboard-saas.vercel.app/api/billing/webhook.
- API/webhook version: 2026-09-30.endive. Customers v1 is retained for compatibility with the existing integration; no Accounts v2 or Connect migration is required for this direct SaaS subscription.

## Planner decisions and code review

| Planner requirement | Implementation |
| --- | --- |
| Hosted Checkout | Authenticated server creates a subscription session; card details stay with Stripe. |
| Flat monthly plan | Server retrieves and verifies the configured price matches the advertised USD 7.99 monthly amount and environment. |
| Flexible subscription billing | Explicitly requested in Checkout subscription_data. |
| Free tier | Fantasy and Daily Picks retain their existing access; research is checked on the server. |
| Customer Portal | Invoice history, payment-method updates and cancellation at period end are enabled in the sandbox portal. |
| Fulfillment after payment | A verified webhook retrieves authoritative subscription state and requires a paid latest invoice before granting subscription access. The success URL cannot unlock Pro. |
| Renewals and failures | invoice.paid, invoice.payment_failed and subscription lifecycle events resynchronize access. Past-due or unpaid access is revoked under the current policy; the customer can update payment details in the portal. |
| Cancellations | An active subscription scheduled to cancel remains accessible through the paid period. Effective cancellation removes subscription access. |
| Retry safety | Checkout requests have an hourly per-user/price idempotency key. Processed webhook event IDs are retained; duplicate risk events do not reopen acknowledged review tasks. |
| Ownership | Existing subscription/customer bindings take precedence; verified server-written checkout metadata is an initial fallback. Another active replacement subscription is protected against an old cancellation event. |
| Refund/dispute/fraud events | PaymentIntent -> all paid InvoicePayment pages -> invoice -> subscription. Relevant events create a private owner-review task. No refund, dispute submission or monetary action is performed automatically. |
| Owner and grader | Permanent owner/grader grants are separate rows and cannot be removed by billing webhooks. |
| Secret handling | API and webhook secrets are server-only sensitive Vercel variables. No keys belong in source, chat or frontend assets. Restricted API keys are supported. |

## Provisioned and pending

The sandbox Product, Price, portal and webhook have been created and verified. The webhook signing secret, Price ID, portal configuration ID and disabled live-mode flag are stored in the existing Vercel project's Production environment. The webhook audit table has RLS enabled and denies direct anonymous/signed-in access; only the server can write it. Owner-only application controls show review tasks and can mark them reviewed.

The website still requires its **sandbox restricted API credential** in the server's `STRIPE_SECRET_KEY` setting. The Stripe ChatGPT connection does not supply a reusable server credential, and no API to create that credential was exposed by the connected tools. Create the key in the authorized sandbox and enter it directly into Vercel as a sensitive/Secret Production variable. Never paste it into chat. A variable named STRIPE_SECRET_KEY can hold an `rk_test_` restricted key.

Minimum API access needed by this code: read Prices, Subscriptions, Customers, Invoices/Invoice Payments and Charges; write Checkout Sessions and Customer Portal sessions. Do not grant refunds, payouts or balance-transfer write access. If Stripe returns a permissions error, inspect the rejected operation and add only its required permission.

Until the credential is configured, the app keeps Checkout disabled. After adding it, redeploy and test the real website flow with a non-owner account in the sandbox. Verify initial payment -> Pro, a renewal, failure -> access removal, recovery -> restored access, period-end cancellation, duplicate events, and an owner-review risk event. Automated tests do not replace this provider-level test.

## Revenue recovery, invoices and tax

Subscription invoices are created by Stripe Billing and can be viewed in the portal. Smart Retries and appropriate payment-failure/customer emails are recommended by the planner; Dashboard settings must be checked before live launch. They have not been claimed as enabled by API provisioning.

No automatic tax collection was enabled. Confirm the business address, tax obligations and active registrations before enabling Stripe Tax. Threshold monitoring is the starting planner recommendation while registration status is unresolved; it is not a legal determination of obligations.

## Final live step for the class

Connect the correct live Stripe account, confirm business onboarding and tax settings, provision matching live resources and separate live secrets, then explicitly enable live checkout. The owner must complete the required real USD 1 class verification charge on their own card. No real charge has been made, and sandbox payments do not satisfy that assignment requirement. Do not silently switch this sandbox into live mode or reuse sandbox IDs with a live key.
