# Model development and evidence requirements

The new candidates are research experiments. The production season/team model continues to supply pick probabilities. A candidate needs a paired evaluation and review before promotion. More data or a more complicated model does not establish an improvement.

## Available now

The scheduled collector saves workload and count-distribution candidates alongside the original pregame forecast. Workload estimates use up to five earlier current-season/current-team games. NBA uses measured minutes. NFL uses labeled targets, rushing attempts or passing attempts according to the statistic. Snaps and routes are unavailable. A workload distribution combines earlier output per exposure with recent observed exposures. Integer rounding, stable efficiency and excluded zero-exposure rate rows are disclosed assumptions. Scenario count is never presented as a count of independent games. Longest-play markets are excluded from linear workload scaling.

A Poisson candidate tests low integer count outcomes, including touchdown counts. Mean/variance assumptions need evaluation. Yardage and longest-play outcomes retain empirical forecasts. Exact standard and alternate thresholds share the distribution and treat integer pushes separately.

Measured usage, when available, supplies a separately evaluated usage-change feature. NBA pregame features include opponent team allowance for the exact recorded statistic, defensive rating and pace relative to the available league sample. Every input uses sourced regular-season games with dates strictly before prediction. Coverage is recorded. These are team-level features, not inferred individual defensive matchups. NFL opponent features remain unavailable when the data source lacks the required fields.

Injury and lineup evidence comes from the existing pregame archive. Separate regularized logistic candidates test workload, opponent allowance, recorded teammate absence reports, the player's reported questionable status, and the combined features. Missing reports never mean health or zero injury impact. The injury regression needs a fresh matched player report and a saved teammate-report list. It may have little eligible coverage. No numeric injury bonus is hand assigned.

## Review in Research

Select a player prop and choose **Test selected prop model candidates** in the Research Desk. This reconstructs rolling earlier-statistics workload and count-distribution tests at the selected threshold. It compares identical test rows with current-team empirical history. It has no historical bookmaker prices and cannot establish historical profitability.

Use **Compare completed slates** to inspect the latest seven archived slates. The comparison includes probability calibration bins, input coverage, paired candidate/active Brier errors, and separate sport/market-family training. Expensive fitting runs in a browser worker. Missing data and pending outcomes remain unscored.

Regression fits use strictly earlier dates and only outcomes whose recorded verification time preceded the next test forecast. Older outcomes without verification timestamps are excluded. The collector preserves the earliest verification time for unchanged results. A score correction resets that time; the fully reconciled home/away verification time is used for game markets. Fixed ridge shrinkage targets the original probability mapping. Training requires 100 selections, 30 distinct games, five dates and 20 outcomes of each class. These are conservative experiment rules, not proof of reliability. Validation is on later dates, not training rows.

Repeated snapshot reads are deduplicated by exact book/event/athlete/statistic/side/line. Conflicting settlements are excluded. Game markets retain selected-team identity. Errors give each game equal total weight across books and alternate lines. Market-specific paired tests need several independent slates and comparison with the archived same-book no-vig baseline. Descriptive flat-stake net across correlated captured lines is not a recommended portfolio return.

## Capture coverage

The broader player cohort retains a bounded deterministic hash sample of up to 40 standard and 40 alternate selections per game/book from the 60–45 minute pregame window. It is sampled before shortlist ranking and positive-return filters, after identity, availability and supported forecast checks. It is not a census of every line or injured player. A changed sampling policy is recorded separately as candidate version opportunity-context-count-v1.

## Still dependent on additional observations

Confirmed lineups need an exact-event verified source. Complete snap/route feeds, official injury clearances, position-specific NFL defensive allowances, and dated pregame quarterback/weather effects need source integration. Feature coefficients cannot be validated from missing historical context. New frozen records are required for prospective workload, injury, defense and probability calibration comparisons. No model is automatically enabled because its in-sample fit looks good.
