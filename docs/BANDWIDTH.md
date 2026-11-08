# Supabase bandwidth controls

The November 8 quota notice concerns cached egress, which counts bytes served,
not the size of the saved research archive. Deleting historical snapshots cannot
undo transfer already counted. Keep the archive for reproducible validation.

## Changes

- Player directories load only the roster and small publication manifest.
- Current-season health and workload reviews no longer load two prior NFL seasons.
- Workload reviews omit unrelated odds, fantasy logs, schedules and team context.
- Fantasy analysis omits the live odds board; its scoring and opponent inputs stay intact.
- Refreshes invalidate the mutable manifest while retaining unchanged decoded files.
- Immutable compressed objects have a private, disposable server-local disk cache
  with a 128 MiB budget and an 8 MiB per-object maximum. Frozen audits reuse these
  bytes too. Downloads are coalesced, checksummed locally and isolated by project
  and server credential. Cache failures fall back to the original source.
- Manifests and mutable legacy objects never use the disk cache. Manifest hash,
  size and decompression checks remain in force for published research files.

No changes to sportsbook pull budgets, update times, model rules, entitlements,
retained snapshots or saved user forecasts are required.

## Limits and verification

This cache is local to each server instance, not shared across Vercel instances.
Cold instances still need their first download. It is an optimization, not a
promise to remain below a monthly quota. Cache files contain research bytes only,
with private filesystem permissions; API keys are never written to these files.

Compare Supabase Organization → Usage → Cached Egress and Uncached Egress over
the next 24–48 hours. Usage already incurred does not decrease after deployment.
Use daily growth, not the accumulated monthly total, to assess the effect. The
email's December 8 grace deadline is not a reason to postpone monitoring.

Tests in `private-object-cache.test.mjs` cover object reuse, concurrent reads,
mutable-path exclusion, corruption recovery, eviction, filesystem failure,
manifest updates, changed object identities, and minimal directory/workload reads.

Official reference: https://supabase.com/docs/guides/platform/manage-your-usage/egress
