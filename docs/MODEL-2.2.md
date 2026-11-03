# Research models in 2.2

## NFL player screening

The old shared 20-game/20-test rule was a product screening policy, not a statistical guarantee. NFL now uses a predeclared experimental research minimum of **12 training outcomes and 10 earlier-only test predictions**, plus **5 current-team current-season games** for Lean. NBA retains 20 training outcomes and 20 tests. Daily Picks and Research import the same policy module.

The latest season/team empirical model may produce an experimental estimate before Lean is eligible. Last-season borrowing requires at least ten eligible same-team prior games and a combined sample of twelve for NFL, versus twenty for NBA. Current-team identity, measured opportunity shifts, minutes/role changes, exact offered price, positive estimated return, lower sampling-bound and push checks remain active. Automatic Take remains disabled. Changing a screening minimum does not demonstrate calibration or profitability, and an example blocked by its lower bound can remain Pass after its test-count check clears.

## Game markets

Full-game scoring moneyline, spread, total and team-total analysis uses verified paired team results. Both team scores, opponent identity, explicit home/away or venue metadata, regular-season tags, sources, dates and duplicate/conflict checks are required. NBA abbreviation aliases are normalized before matching. A team statistic is never substituted with a player statistic.

The new experimental score model fits a league baseline, home advantage, team attack and opposing defense with a fixed ridge penalty of eight weighted games. Current season weight is 1, prior season 0.35, and older season 0.15. Weights and penalty are declared, not optimized to obtain a particular pick. At least forty league fixtures, twelve earlier-only matchup errors and three current-season games for each team are required. No odds are used in score fitting.

Up to eighty recent league fixtures form chronological tests. Every fit excludes the entire held-out date. Each probability calculation in those tests uses only previously observed prediction errors. Paired home/away residuals preserve empirical error dependence. Derived scores are nonnegative integers; NBA full-game simulations exclude tied final scores. NFL ties and sportsbook void rules remain explicit limitations. The comparison baseline uses earlier actual league scores, with the same threshold; Brier scores are not ROI and the cohort is league-wide, not a team-specific accuracy guarantee.

Moneyline wins, spread coverage, combined totals and team totals settle from their own exact thresholds. Estimated outright win, push and loss probabilities are separate. Book break-even compares non-push outcomes. New game estimates remain Pass pending independent matchup and archived-price validation; no fake Lean or Take is produced to fill a list.

Current injuries and availability can be shown as sourced risks. Starting quarterback, injury effects, weather, rest, changing rosters and coaching are **not fitted numerical inputs**. They must not be described as calculated extra edge. Old-season team coefficients can be less representative of current personnel.

## Display and collection

Research shows the experimental hit percentage prominently, including each supported alternate-line comparison. Daily Picks retains player probabilities and adds an automatically updated Game lines view with sportsbook/game/market filters, prices, numerical evidence, risks and source links. Unsupported or insufficient data displays Unavailable rather than a manufactured percentage. Started games and stale prices are excluded.

Game-market reports are computed on the server during the existing scheduled refresh; UI refresh does not contact the provider or run a full league backtest. A time-limited report is labeled incomplete. The existing layout, NBA/NFL navigation, quoted alternate slider, searches, free fantasy tools, owner access, Pro checks and saved source data remain in place.

## Verification scope

Automated tests cover future-data exclusion, earlier-only held-out predictions, paired-score integrity, venue metadata, team aliases, complementary probabilities, NBA non-ties, line monotonicity, missing-data rejection and consistent NFL rules. Synthetic browser fixtures exercise the complete UI without supplying fake production statistics. Real sourced team history has also been exercised locally. Provider-level prospective calibration and archived-price profitability remain outstanding work.

A diagnostic replay on the saved verified team history (2026-11-03 UTC cutoff, home-moneyline threshold, no archived bookmaker prices) produced:

| League | League fixtures used in final fit | Earlier error games | Eligible probability tests | Model multiclass Brier | Earlier-score baseline Brier |
| --- | ---: | ---: | ---: | ---: | ---: |
| NFL | 664 | 80 | 58 | 0.1638 | 0.1790 |
| NBA | 1,323 | 80 | 61 | 0.1414 | 0.1740 |

Lower Brier is better on these particular historical cohorts. These are development diagnostics, not independent prospective validation, statistical significance, a calibration certificate, or evidence of profitable betting. They do not validate the player-policy thresholds, and they do not enable game-market Lean or Take.

First-to-score and last-to-score markets are not game-winner moneylines. Research labels their actual statistic and defaults scoring game tabs to points when offered. The public Game lines view excludes those unsupported specialty markets rather than relabeling them as winning the game.


## Background refresh reliability

Daily Picks updates preserve open evidence by exact event/player/market/line/book, including when shortlist ordering changes. A focused player search or filter is left in place for the next poll. Failed background reads keep the previously loaded cards and show a timestamp warning; they do not make old prices current. Public reads and paged Research reads abort after 45 seconds per request, without automatic retries of mutations. Poll cycles do not overlap, hidden tabs pause checks, and returning to the tab checks for updates.

Game-line pages now report their visible range and allow both previous and next navigation. If a live update removes the page being viewed, the view returns to the first current page instead of showing an invalid-page error. Sportsbook changes reset player-specific and page filters. These changes do not alter forecast probabilities, research qualification rules, entitlements or payment configuration.

## November 2 retained-shortlist audit

The Pro `/api/frozen-audit` endpoint reads eight immutable, catalog-verified afternoon Daily Picks objects from November 2. It uses original probabilities and labels, selects the earliest retained pregame copy of each exact selection, and matches regular-season sourced results by athlete identity, statistic and game date. Conflicting values, absent IDs or missing game sources stay unsettled. This date-based settlement remains provisional; it is not an audited sportsbook settlement feed. Repeated books/alternate lines are correlated. The UI shows settled/unsettled counts, original forecasts and binary Brier for wins/losses, with pushes separate. Coverage excludes unarchived selections, and no model coefficients or gates are tuned from this day. The cloud does not yet run the old desktop evaluation job; note/outside-pick publication remains unavailable rather than pretending those forms save.

Pro trade briefs now select separately validated scenario and action evidence: recent-three versus comparison average, largest scoring components, scheduled appearances, and algebraic roster-slot break-even where applicable. These are descriptive scenarios, not injury, matchup or rest-of-season projections. The response schema rejects invented facts or evidence IDs. Free briefs retain the original three sections.
