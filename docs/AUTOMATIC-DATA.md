# Automatic data collection and fantasy scoring

The hosted collector is a bounded server job, independent of visitors. Supabase Cron calls the authenticated Vercel endpoint every ten minutes. It refreshes injuries and exact DraftKings quotes, checks all NBA/NFL team rosters and schedules hourly, and resumes a current-season final-box-score queue (80 events maximum per invocation). Source failures retain earlier files and their timestamps. Status is visible on the owner's Account page.

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
- Unequal packages require an explicit waiver/drop value from the user. Adjusted difference = receive − send + (players sent − players received) × user replacement points. It is a per-appearance scenario, not weekly lineup optimization.
- Current Out/IR/Doubtful/suspended listings trigger availability review. Missing reports do not confirm health. Historical role changes, rest, snap/route participation, starting slots and lineup fit still need review.
- Bonuses, return TDs, two-point conversions, kickers, IDP, NBA category leagues and dynasty/keeper valuation are not supported. This is an original trade workflow, not a copy of another service's proprietary rankings or methodology.

## Verification

Tests cover real archived NFL box-score reconciliation, corrupt/truncated categories, fumbles/PPR, old-team exclusions, offensive roster options, unequal trades, injuries, exact alternate prices/timestamps, odds pagination, request-time pick expiry, resumable merging, and unsigned worker denial. Fixture source: ESPN DAL–PHI, game 401772510 (2025-09-05); it is test-only and is never substituted for live data.
