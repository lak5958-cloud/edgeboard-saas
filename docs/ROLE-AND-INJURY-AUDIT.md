# Playing-time and availability audit

## Corrected behavior

A matched unavailable injury status (Out, Doubtful, inactive, suspended, IR or PUP) blocks a recommendation even if its fetch timestamp becomes stale. Age is disclosed, not interpreted as recovery. Future fetch timestamps are ignored; dated reports are ordered by verified fetch time. A newer matched status can supersede an older one. No matched injury listing remains “availability not confirmed,” not healthy clearance. Injury status is a decision gate, not an arbitrary numerical probability adjustment.

Exact-event sourced factors now also check athlete IDs when supplied and reject ambiguous names without identity. Dated minutes, usage, pace, defense, snap and target projections remain context unless a fitted model explicitly uses them. They are not hidden probability multipliers.

NFL collection now saves separate receiving targets, rushing attempts and passing attempts. The opportunity guard selects the measure for the actual prop statistic. Mixed rushing/receiving statistics have no fabricated single workload measure. Measured zero is retained; missing counts remain null. Historical generic opportunity fields without a verified kind are omitted from the guard. Newly collected rows include the labeled counters. Existing NFL events are reprocessed once using a separate opportunity schema marker; newest games are prioritized, with normal source retry behavior and refresh limits retained. The fantasy scoring schema remains unchanged.

## User-visible disclosure

Research and newly generated Daily Picks include “What actually affects this estimate?” covering outcomes, identity, availability, historical minutes or NFL opportunity, other-team exclusions, and context-only factors. NBA historical minutes decide prior-season comparability; they are not a confirmed rotation forecast. NFL target/attempt shifts decide whether to borrow comparable prior-season history; they are not projected snap/route counts. The reports include measured coverage and observed averages where available.

## Limits and validation

Role changes, teammate injuries, coaching decisions and confirmed future playing time are not fully modeled. No new coefficient or injury bonus is fitted in this release. This corrects data selection and safety gates; higher prospective accuracy has not been established. Frozen forecasts remain unchanged. New Daily Picks reports identify the typed-opportunity model version so later evaluations can distinguish releases. NFL backfill proceeds over scheduled refreshes and may temporarily report more pending events. Tests cover stale unavailable listings, future timestamps, namesake projections, the correct NFL workload family, measured zero/missing values and chronological isolation from later workload information.

## Availability and freshness panel

Daily Picks and quoted Research selections now display original sportsbook, injury feed/report and roster timestamps. Freshness is recomputed in the browser, so loading an old saved report never restamps it as current. Injury feed and roster checks use a two-hour disclosure window; the existing sportsbook eligibility window remains unchanged. A stale unavailable listing still blocks; a missing listing never confirms health. Future dates require checking. Historical workload shows measured coverage in the last five current-team NBA games (two measurements required by the comparability guard) or three NFL games (three measurements required). Typed measured zero counts for NFL. Coverage is a current-role input audit, not a projected workload or a new recommendation gate. Team markets display price freshness without irrelevant player identity/injury checks.

New scheduled Daily Picks publications save the source metadata. Older reports disclose missing roster and workload metadata rather than reconstructing it from quote timestamps. Research constructs the panel directly from its current loaded evidence. This adds transparency; no forecast coefficients, decision thresholds or frozen historical predictions change.
