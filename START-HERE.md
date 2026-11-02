# Start here: your ENGR 310 SaaS project

You do not need any accounts already set up. Follow this in order. This guide is based on the assignment overview and transcript screenshots you provided. Check Canvas for actual due dates and the income-statement template; those were not shown.

## What you must submit or demonstrate

By the end, a stranger must be able to visit your public website, understand it, create an account, sign back in, use a useful AI feature, and pay through Stripe. Your own card must complete a real $1 charge as proof. A test payment does not meet that requirement.

The grader must log in through the normal login form with:

- Email: demo@demo.com
- Password: password123!
- That account must already exist, skip email verification and have full paid access.

The transcript also calls for: a week-one idea/pitch video, an income statement projecting at least $3,000/month, peer feedback/debugging, feedback from five real potential customers, and a final reflection video. An actual paying customer is extra credit according to the transcript. Do not fabricate interviews, receipts or customer quotes.

## What has been built, and what is not done

Included code: public pages, NBA/NFL trade scoring, the daily shortlist, the original research UI, auth integration, server access checks, Stripe integration, AI brief integration, grader provisioning, tests and data-import tools.

Not yet completed: connected service accounts, imported actual statistics, complete NFL fantasy coverage, automated cloud collection, full schedule modeling, a public deployment, end-to-end service testing or a real payment. The current download is a development version, not a finished graded SaaS.

## What to create

| Item | Why you need it | When |
|---|---|---|
| GitHub account | Holds the source and connects it to hosting | First |
| Vercel account | Gives you a public web-app URL | First |
| Supabase account/project | Real user login, database and private statistics storage | Next |
| OpenAI API account/key | Runs the AI trade explanation | After real data and login work |
| Stripe account | Real checkout and required live $1 proof | Test setup after login; live use only after eligibility checks |
| Node.js 22 or later | Runs the app on your Windows computer | First |
| Existing EdgeBoard data folder | Supplies the actual sports statistics | After Supabase is ready |

A custom domain, paid design software and Claude subscription are optional. Do not buy a domain just to get a public URL. Select service plans deliberately; this guide does not assume current free-tier allowances or promise a zero-cost launch. API usage can incur charges. ChatGPT membership does not supply this app with an OpenAI API key or API usage credit.

## Do this first: open the website on your computer

1. Download the updated ZIP and right-click it > Extract All. Use a NEW folder named EdgeBoard-SaaS. Do not overwrite the existing research console.
2. Open https://nodejs.org and install a current supported Node LTS release that is version 22 or later. Keep the installer defaults.
3. In the extracted folder, find package.json and START-SAAS-WINDOWS.bat. If you do not see them, open the inner folder until you do.
4. Double-click START-SAAS-WINDOWS.bat. Leave its command window open.
5. Open your web browser and type http://localhost:3000.
6. Check Home, Trade Analyzer, Daily Picks, Research and Plans. The website should load, but sports results and account actions will be unavailable until the services below are connected.

Success checkpoint: the website opens locally. This URL only works while that server is running on your computer; it is not the public class-submission URL.

## Create your first three accounts

1. Go to https://github.com and create your account. Confirm its email.
2. Go to https://vercel.com and sign up using that GitHub account if you prefer. Do not choose a paid plan merely to follow this guide.
3. Go to https://supabase.com and create an account. Create a project named edgeboard-class. Save the database password in your password manager. Let project setup finish.

Success checkpoint: you can open each dashboard. Tell me which step is complete; do not send passwords or secret keys.

## Connect login and private data locally

1. In the extracted SaaS folder, enable File Explorer > View > Show > File name extensions.
2. Copy .env.example and rename the copy to .env, not .env.txt. Open .env in Notepad or your editor.
3. Set APP_URL=http://localhost:3000. Do not add a trailing slash.
4. In Supabase, locate the project URL and API keys in its project/connect/settings pages. The current code uses SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY. Use the compatible legacy anon/service_role JWT keys for this implementation; newer secret/publishable key support should be verified before substituting key types.
5. Paste those values into the corresponding .env lines on YOUR computer. The service-role key is a secret: never commit it, upload it with the source or paste it into chat.
6. In Supabase, open SQL Editor > New query. Open supabase/schema.sql from the downloaded project, copy its contents into the editor and run the query. This creates private storage, access records and request limits.
7. To generate RATE_LIMIT_SALT, open a terminal in the SaaS folder and run:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the generated value to the RATE_LIMIT_SALT line in .env. This is also a private configuration value.

8. For the first class alpha, configure ordinary email/password signup. Either turn off required email confirmation in Supabase's email-auth settings, or complete the email-provider/confirmation setup and test it. The grader script explicitly confirms the grader's account either way. The app does not yet implement a password-reset page.
9. Restart the local server after editing .env. Visit Sign in > Create account. Create YOUR OWN test user, sign out, and sign back in. It should have free access.
10. Open a terminal in the SaaS folder and run:

```powershell
npm run seed:demo
```

Then sign in as demo@demo.com / password123! and confirm Pro research opens. This is a real account. Do not put your owner account or admin rights behind those public grader credentials.

## Connect the statistics you already have

From the SaaS folder terminal, run:

```powershell
npm run import:data -- "C:\Users\logan\Downloads\EdgeBoard_Research_Console_NBA_NFL\data"
```

If your existing console is somewhere else, replace that path with its actual data folder. Do not point to config. The script uploads only approved JSON filenames and does not read the encrypted API key.

Wait for the uploads, then reload the website. Verify at least one real NBA comparison and one NFL comparison. Missing NFL scoring components must be collected properly; do not fill them with zeros to make a result appear. Read docs/DATA-CONTRACT.md for the supported input format. Future schedule information also needs a sourced import.

The current website does not independently collect live odds in the cloud. Your existing collection process and this upload step are separate. An unattended cloud collector is a remaining development task.

## Put it on GitHub and Vercel

1. In GitHub, create a PRIVATE repository named edgeboard-saas. Add the contents of the SaaS project folder, keeping package.json at the repository root.
2. Do not upload .env, key.dpapi, the old config folder, your sports data folder, or node_modules. Upload .env.example; it contains empty configuration fields. .gitignore helps when using Git, but does not replace checking a manual browser upload.
3. If uploading through GitHub's website, use Add file > Upload files, then commit. Alternatively use GitHub Desktop to add the folder, review changes and publish the repository privately.
4. In Vercel, Add New > Project > import edgeboard-saas. Use framework Other, leave the build command empty and use public as Output Directory. The included vercel.json configures the server endpoints.
5. Add the same required server environment variables in Vercel settings. Never add secrets to frontend source. Set APP_URL to your final https://...vercel.app origin and redeploy after changing it.
6. Configure the public origin in Supabase's Site URL/redirect settings. Test actual signup, login and grader access on the public URL in a fresh browser session.
7. Keep that public URL for your class submission. A deployment that only shows the homepage is not yet a complete SaaS; verify the functional requirements too.

## Connect the AI feature

Create an OpenAI API account/project, generate a server API key and set an appropriate spending limit. Configure OPENAI_API_KEY and AI_MODEL in both local and Vercel environments. Choose a model available to your account that supports JSON-object output. Do not assume a ChatGPT subscription covers API usage.

Restart locally/redeploy. Sign in, run a real trade comparison and select Explain this comparison. Confirm that a real AI explanation appears and that its factual claims agree with the supplied evidence. Save a screen recording for your assignment. Do not present a missing-key message or hard-coded paragraph as the required AI feature.

## Set up payment after the product works

1. Decide your Pro price and exactly what it buys. The current Plans page intentionally does not announce a price. Before charging users, publish the actual amount, renewal interval and cancellation information there.
2. Explain the actual sports-research business to Stripe and verify eligibility. Do not disguise betting research as a different business. If this causes an issue, discuss a genuine fantasy-only paid scope with the instructor and processor before launch.
3. Start with Stripe test/sandbox configuration. Follow docs/SETUP.md for the price, secret key, signed webhook and customer portal.
4. Confirm that payment grants Pro on the server, a success URL alone does not, and cancellation works.
5. After live setup is appropriate, complete the assignment's real $1 charge YOURSELF on your own card. Configure the $1 transaction transparently; if it is a recurring subscription, cancel after the proof if you do not want renewal. Record the receipt with private card details hidden. No real payment has been made for you.

## Class work alongside the app

- Week 1: public deployment, idea/pitch video and income statement. Example planning assumption only: 200 subscribers × $15/month = $3,000/month gross revenue BEFORE costs. This is not measured demand or profit, and $15 is not your selected price. Use actual vendor quotes for costs. Confirm whether the instructor's template targets revenue or profit.
- Week 2: complete the useful AI workflow and core product.
- Week 3: collect peer feedback and fix observed bugs.
- Week 4: collect feedback from FIVE real potential customers, finish payment proof and record the reflection video. Check Canvas for the exact timing of each deliverable.

## What to send me next

Start with these two checkpoints: (1) Does the local site open? (2) Have you created GitHub, Vercel and Supabase accounts? Tell me what screen you are on if a step fails. No passwords, API keys or card details are needed in chat.
