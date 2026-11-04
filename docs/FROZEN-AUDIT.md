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

## Game lines and historical odds pilot

Select **Game markets** in the Frozen Pregame Audit to grade the independently archived moneylines, spreads, game totals and team totals. It requires matching, reciprocal final scores for both teams, the UTC game date and the quoted home/away orientation. Conflicting fixtures and missing score pairs stay pending. This view does not combine game-line and prop metrics.

Run `node scripts/replay-saved-odds.mjs board.json evidence.json roster.json team-history.json` on a saved board to reconstruct forecasts for its standard full-game lines. The board observation establishes the cutoff. Player identification requires a roster record dated by that cutoff and tied to the matchup. Training uses earlier game dates. The script prints separate coverage and scores for props and game markets. It does not publish these reconstructed forecasts to the frozen ledger.

The local November 2 pilot found a dated odds board and produced 1,326 prop forecasts and 300 game-market forecasts. Local outcome files lacked matched final results, so this run did not produce an accuracy score. Earlier dated roster profiles recovered some player joins. The pilot predates part of the archived forecast coverage on November 2, but it is not evidence of a separate earlier slate.

The box-score replay reports results separately for recorded debut-year players, players with another observed team, established players and cases without a known debut year. First observed team transitions are tracked as excluded coverage. No recorded debut-year cohort qualified in the local replay. Run the same script with `--team-history team-history.json` to test the NBA opponent points-allowed adjustment on matched forecasts. The local central-line Brier scores were 0.24103 active and 0.24062 adjusted on 7,642 correlated thresholds. Pace and injury tests still require adequate dated coverage.

The pilot accepts an optional fifth input with verified audit outcome rows. They are joined by saved event and athlete identity and used only to grade outcomes. With the November 2 verified outcome rows, 43 reconstructed props were scored. Active Brier was 0.37503 and quoted-price Brier was 0.25487 on the same rows. These rows share players and games and inherit the original shortlist coverage. The other 1,283 prop forecasts and 300 game forecasts remained pending in that run.

## Multiple historical slates and early games after a team change

Run `node scripts/replay-odds-series.mjs manifest.json` with one observation per Eastern slate. Declare the final evaluation start date before looking at scores. File paths are relative to the manifest. Each slate requires a dated board, evidence, roster and team history. Verified outcome rows are optional and affect settlement only.

```json
{
  "holdoutFrom": "2026-11-03",
  "slates": [
    {
      "board": "nov02/board.json",
      "evidence": "nov02/evidence.json",
      "rosters": "nov02/rosters.json",
      "teamHistory": "team-history.json",
      "verifiedOutcomes": "nov02/audit-outcomes.json"
    }
  ]
}
```

The report compares model and original price on matched outcomes. It weights each scored date equally and separates props from game lines. The available data only populated November 2. The final evaluation window has zero scored dates.

The workload replay now also tests an early new-team challenger. It requires two to five current-team games and at least five earlier appearances with another team in the current or previous season. It compares a smoothed current-team hit rate with the same estimate plus two effective old-team appearances. The last 20% of eligible dates per league form a separate retrospective window. Game thresholds come from earlier box scores. The first observed team-change game remains excluded because a dated pregame roster is required to establish the new team at that cutoff.

| League | Window | Dates | Matched thresholds | Current-team only Brier | Limited old-team Brier |
| --- | --- | ---: | ---: | ---: | ---: |
| NBA | Earlier | 22 | 870 | 0.26532 | 0.25189 |
| NBA | Latest | 6 | 645 | 0.27915 | 0.24156 |
| NFL | Earlier | 12 | 329 | 0.16094 | 0.16190 |
| NFL | Latest | 3 | 147 | 0.14558 | 0.12979 |

The existing model had no estimate for 510 NBA and 113 NFL thresholds in the latest windows. These counts are correlated player-stat observations. The NBA result merits a prospective research comparison. These scores compare with the simple current-team reference, and a separate archived odds study is needed before using the challenger for picks.

## Prospective NBA trade shadow trial

Select **NBA trade shadow** in the Frozen Pregame Audit. The trial collects standard and alternate NBA half-point props for players with two to five appearances with the current team and at least five sourced appearances with another team in the current or previous season. The roster must identify the athlete and match the fixture, with a source timestamp within 48 hours. The latest prior appearance must already be with that team. Each game and book contributes up to 12 standard and 12 alternate lines, ranked by a stable market key. The audit uses the first archived capture between 60 and 45 minutes before tipoff.

Each entry freezes the limited old-team estimate, the new-team-only estimate, the active estimate when available, the exact price, the paired no-vig benchmark when available, and roster provenance. The trade sample can capture lines where the active model is unavailable. Half-point lines support the two-outcome estimates tested in the retrospective study. The evaluation reports paired date-weighted Brier scores, distinct athletes and games, and coverage where the active model was unavailable. The public picks endpoint omits the trial.

## Pregame injury and lineup evidence

New player-prop archives preserve a private evidence record bound to the event, book and quote timestamp. It includes dated roster identity, the player's matched injury report, same-team injury listings, verified exact-event measurements and confirmed lineup role when available. Injury rows are joined by verified athlete ID and reports dated after capture are excluded. The lineup record is empty if an exact confirmed source is unavailable or same-time sources disagree. None of these new archive fields change the forecast.

The existing injury feed supplies injury listings. Confirmed lineups require a separate verified input in `context.user.json` or the automatic context snapshot. A lineup row requires `league`, `eventID`, `athleteID`, `teamID`, `asOf`, an HTTPS `url`, `confirmed: true` and `role` equal to `starter`, `bench` or `inactive`. No live confirmed-lineup collector is configured by this update. The audit surfaces what was saved with the forecast and leaves older archives as they were.
