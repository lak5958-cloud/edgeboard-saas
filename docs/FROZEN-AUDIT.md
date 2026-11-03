# Frozen player-prop evaluation

The Research workspace can review one retained slate or compare up to seven completed Eastern dates. Original pregame forecasts and archive objects remain unchanged. No new shadow forecast is reconstructed for an old game. The scope is the published Daily Picks shortlist and watchlist, not all offered lines or game-market forecasts.

## Review coverage

Read every unique indexed player report for the selected date, including retained legacy November 2 paths. Hourly sampling was removed because a pick can appear and disappear inside one hour. Four archive reads run concurrently. Dates exceeding 512 reports or 40 MB expanded total fail explicitly instead of returning a sampled or partial score. A source read failure also prevents a combined result. The supported archive path and timestamps are validated.

## Eligibility and settlement

Use the earliest retained snapshot for each league, sportsbook, event, verified athlete, normalized statistic, full-game period, side and threshold. Storage and quote timestamps must be before the scheduled start; future storage times are rejected. Conflicting quoted fields or saved athlete IDs are excluded. Full-game period must be explicit in the archived quote. Exclusion counts include repeated archive rows and are separate from settled losses.

Results require the same athlete, equivalent statistic, full-game series, scheduled UTC game date, regular-season tag, game ID, numeric value and HTTPS source. Explicit per-game period or athlete conflicts are rejected. Missing and conflicting results remain unsettled with a reason. A repeated identical game/value is deduplicated; different game IDs or values remain unresolved. Outcome dates alone cannot reconcile postponed games, DNPs or sportsbook-specific void rules. No verified settlement or ROI is inferred for those cases.

## Probability evaluation

Wins/losses use a binary Brier score on P(win)/(1-P(push)). Calibration groups now use that same conditional probability, rather than the raw win mass. Integer-line archives without a saved push mass are unscored. A supplied invalid push mass is never silently replaced with zero, including for half-point lines. Impossible win-plus-push masses remain unscored. Pushes and pending outcomes are never losses.

Compare active and genuinely saved shadow forecasts only on paired scored outcomes. Also show the original quoted-price implied probability on the same scored outcomes with valid saved odds. This includes bookmaker margin; it is a break-even reference, not a no-vig fair probability. The 50% baseline remains available. Group scores by slate, league, book, original decision, model version and statistic. Estimates and observed wins in the tables use the same scored subset. Expose sample counts and unresolved gaps.

These are exploratory checks on selected, correlated lines. Even a lower error on this archive does not establish a profitable betting strategy or prospective calibration. No live probability, threshold, rank or label changes in this release. Do not tune or promote a model using this small selected sample as its only evidence.

## Verification for this update

Regression cases cover periods, duplicate IDs, conflicting quote fields, conditional calibration, invalid probability mass, aliases and earliest-snapshot selection, source conflicts, paired price comparisons, complete intrahour coverage, bounded read concurrency and escaped output. The Research browser flow is checked with synthetic fixtures, never presented as real sports performance. Production account-based settlement verification requires authorized sign-in; report it as incomplete if blocked.

## Market benchmark and broader sample

New captures save the two prices for an exact player prop when both were offered by the same sportsbook in the same provider response. The pair must match the player, event, statistic, period and threshold. The audit divides the selected side's implied probability by the sum of both sides' implied probabilities. Comparisons use matched scored outcomes and show coverage. Earlier archives can still use the original price as the break-even benchmark.

The broader sample is separate from the shortlist. It selects up to twelve standard and twelve alternate forecasts per game and sportsbook, using stable market keys before the positive-return and shortlist filters. The audit selects the first retained capture in the 60-to-45-minute pregame window. A missed refresh window yields missing coverage. Captures include available dated injury and exact-event factors for later experiments. Game markets remain in their own archive.

## Local replay

Run `node scripts/replay-workload.mjs path/to/evidence.json` with one or more saved evidence files. This compares fixed prior-strength and workload alternatives with chronological box-score history using thresholds generated from earlier appearances. A threshold replay measures probability error on synthetic lines. A historical odds replay additionally requires timestamped sportsbook quotes, outcomes and point-in-time context. Keep those reconstructed runs separate from prospective frozen forecasts.
