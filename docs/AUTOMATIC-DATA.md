# Automatic data collection and fantasy scoring

The hosted collector is a bounded server job, independent of visitors. Supabase Cron calls the authenticated Vercel endpoint every ten minutes. It refreshes injuries and exact DraftKings and FanDuel quotes, checks all NBA/NFL team rosters and schedules hourly, and resumes a current-season final-box-score queue (80 events maximum per invocation). Source failures retain earlier files and their timestamps. Status is visible on the owner's Account page.

## Owner setup

1. In the existing EdgeBoard Vercel project's Settings → Environment Variables, add `SPORTSGAMEODDS_API_KEY` with the owner's existing key. Choose Production and Secret. Do not put it in the repository, browser, or chat.
2. Redeploy the latest main deployment after changing an environment variable. Existing deployments cannot see later changes.
3. Sign in as the owner, open Account and select Refresh odds and statistics. This queues a job and returns immediately. Check the processed/pending counts after it finishes. The next ten-minute invocation resumes unfinished games.
4. Open Trade analyzer and compare known players. Current rosters supply NFL QB/RB/FB/WR/TE options, including rookies without bookmaker quotes. NBA current roster players are available. Players without enough complete current-team observations show insufficient evidence.
5. Open Daily picks. A qualifying Lean must pass the existing sample, replay, exact-price, lower-bound, availability and freshness gates. Pass watchlist items are explicitly separate. There is no minimum daily pick count and Take remains disabled.

No Vercel plan upgrade is necessary for this scheduler: Supabase Cron is used because Vercel Hobby restricts native Cron to daily execution. Provider calls use the existing sports data subscription and its quota. Frequency and quota should be reviewed before a paid customer launch.

## Scheduler deployment

Run `supabase/refresh.sql` for the server-only lease table/RPCs. Keep `CRON_SECRET` in Vercel Production and an identical secret named `edgeboard_refresh_token` in Supabase Vault. Neither value belongs in source control. Create pg_cron and pg_net extensions, then install a service-only `public.queue_refresh()` SECURITY INVOKER function that calls net.http_get on the fixed production `/api/internal/refresh` URL with the Vault bearer secret and a 240000 ms timeout. Grant EXECUTE only to service_role (and retain postgres owner execution), then schedule that function with `*/10 * * * *`. Never grant Vault reads or scheduler RPC execution to anon or authenticated. The owner UI calls through the authorized application server.

Inspect `cron.job` for `edgeboard-refresh` and `net._http_response` for completion. A scheduled HTTP request ID only means queued, not completed. Inspect `public.refresh_jobs.last_result` for publication status. A 5-minute exclusive lease exceeds the Vercel function's 240-second maximum, preventing overlapping scheduled/manual runs. Failure and timeout preserve the last published data. All changed gzip files are uploaded under immutable paths, then the manifest is published last. Old imported files remain private.

## Fantasy calculation

- NBA points: points + 1.2 rebounds + 1.5 assists + 3 steals + 3 blocks − turnovers.
- NFL: 0.04 passing yards + 4 (or selected 6) passing TD − 2 interceptions + 0.1 rushing/receiving yards + 6 rushing/receiving TD + selected reception credit − 2 fumbles lost.
- NFL missing passing/rushing/receiving/fumbles categories are zero only if the player appears in an offensive box-score table and all required columns in every team category reconcile with source totals. ESPN team passing totals can be net of explicitly reported sack yards; the parser verifies the gross reconciliation. Missing/truncated/conflicting categories fail closed. A roster entry alone never creates a zero-point appearance.
- Current season, current team, regular season, completed games only. Up to ten scoring appearances, minimum three. No old-team borrowing. No automatic rookie-to-veteran substitution. DNPs and unrecorded zero-stat appearances are not imputed.
- Output is a descriptive per-appearance average. The next-21-day schedule pace assumes every game is played; it is not an injury-adjusted forecast. Opponent team points allowed and covered position fantasy totals are context only, not fitted multipliers. Covered games may be incomplete while history is filling.
- Unequal packages now receive a default starter-based lean: compare the best min(send count, receive count) players on each side, treating extras as bench depth. The user can select that everyone starts, or enter a waiver/drop value. Positional preferences add conditional advice, never numerical scoring bonuses. Adjusted difference = receive − send + (players sent − players received) × user replacement points. It is a per-appearance scenario, not weekly lineup optimization.
- Current Out/IR/Doubtful/suspended listings trigger availability review. Missing reports do not confirm health. Historical role changes, rest, snap/route participation, starting slots and lineup fit still need review.
- Bonuses, return TDs, two-point conversions, kickers, IDP, NBA category leagues and dynasty/keeper valuation are not supported. This is an original trade workflow, not a copy of another service's proprietary rankings or methodology.

## Verification

Tests cover real archived NFL box-score reconciliation, corrupt/truncated categories, fumbles/PPR, old-team exclusions, offensive roster options, unequal trades, injuries, exact alternate prices/timestamps, odds pagination, request-time pick expiry, resumable merging, and unsigned worker denial. Fixture source: ESPN DAL–PHI, game 401772510 (2025-09-05); it is test-only and is never substituted for live data.

## Plain-English trade view

The result leads with a default accept/keep lean, reasons and conditions that could change it. Missing history and unavailable players produce an actionable hold rather than invented scores. Sources, scoring components and schedule details are expandable. ESPN headshots use the verified roster athlete ID and a restricted image host; missing images fall back to initials. No RotoTrade proprietary values or full-league import are used.

## Daily picks, sportsbook-specific refresh

The collector requests DraftKings and FanDuel together. Each NBA/NFL shortlist is independently screened at that book’s exact quoted thresholds, prices and timestamps; no other books are available in the selector. Published reports use byBook → league. DraftKings-only legacy reports are never relabeled as FanDuel. Missing provider coverage is an explicit empty state. Every displayed quote is checked again for freshness and pregame eligibility at request time.

Cards lead with the player portrait, readable statistic, book/price and matchup. “Why it could hit” uses actual historical counts and averages; “Main risks” translates incomplete checks and role/availability limitations. “Our verdict” preserves Lean or Pass. Detailed model probabilities, expected net, test counts and sources remain expandable. No arbitrary confidence score or invented opponent/usage story is generated. Player headshots use the existing bounded same-origin image route.

## Scoped live research

The Pro Research console uses `/api/research-workspace` rather than downloading all historical series and both leagues each minute. Metadata contains the full game index with book quote counts; quotes and history are scoped to the chosen matchup, with NBA roster-only research retained. Book prices remain exact and only DraftKings/FanDuel are included. Player identity and injury context are restricted to the selected teams.

The browser checks the published snapshot revision every 60 seconds and on returning to the tab. An unchanged revision skips all quote/history downloads. Changed snapshots load in byte-bounded pages, pinning the version across metadata, quotes and histories. A version conflict retries the complete read once. Rapid navigation cancels older reads; failed or unauthorized updates retain the last complete view with an explicit warning. The server retains Pro authorization on every part; provider refresh remains owner-only.

Player, book, side, period and alternate threshold are preserved on background updates. An exact selection that disappears is marked unavailable; another line is not selected silently. The game scanner still runs in its worker with selected-game evidence. Outside-source market jumps first load the requested game, then apply the existing exact-period/line/book checks.

Daily Picks includes a Lean/Pass guide, the experimental outright model win probability beside the name, the scan funnel and a one-market-per-player explanation. The hit chance is not an independently calibrated confidence score. No decision threshold was lowered. NFL historical test counts and sampling bounds remain evidence/price requirements, not automatic unlock timers.

## Complete NFL coverage and offered-market browser

NFL team discovery now also verifies schedules for the previous two regular seasons. Each team/year must return at least 16 completed regular-season games in the requested season before discovery is marked complete. Event IDs are queued once and box scores resume in bounded batches; current rosters and future schedules are retained. The last prior season may enter the comparable season/team forecast. The older season supplies earlier-only replay inputs; it is not silently added to the current forecast. Trades and measured opportunity shifts still exclude incomparable priors. No Lean threshold is reduced.

Historical NFL evidence is stored in separate `evidence.nfl-YYYY.json` snapshots, avoiding an oversized current evidence file. Immutable source objects are cached by their integrity-checked manifest path until that path changes. Research requests only load those NFL history partitions when NFL research is requested.

Daily Picks now includes an All player lines view. It independently lists every player with current full-game offered props for the selected league/book/game, including alternate thresholds outside the shortlist price band. Search, statistic and side controls reveal the exact offered prices and break-even rates. The market browser does not assign a new probability or recommendation. It is separate from the five-Lean/five-watchlist daily shortlist, and full statistical player research remains Pro.

Quote profiles resolve within the actual matchup and by athlete ID before joining historical data. This prevents same-name athletes on other teams from contributing to the selected player’s sample. NFL historical team IDs remain attached to each old game.
