# O-8b Cloud API Sleep Day Boundary Design

## Purpose

O-8a made the frontend sleep-day display and current-day fallback use a configurable `sleepDayBoundaryHour`.
O-8b aligns Cloud API read models and derived sleep-window metric aggregation with the same rule:

```text
sleepDay = date(localDateTime - boundaryHour hours)
```

The goal is not to migrate to a specific hour such as 6:00. The goal is that any configured hour from `0` to `23` behaves consistently across frontend display, Cloud API grouping, diagnostics, and future derived records.

## Current Implementation

### Cloud API Boundary Utility

Cloud API now has a dedicated utility:

```text
cloud-api/src/lib/sleepDayBoundary.ts
```

It provides:

- `getConfiguredSleepDayBoundaryHour`
- `normalizeSleepDayBoundaryHour`
- `parseSleepDayBoundaryHour`
- `getSleepDayKeyForDate`
- `isSleepWindowRecordBoundaryCompatible`

The default remains `18` for backward compatibility. The effective boundary can come from:

- query parameter `boundaryHour`
- environment variables `SLEEP_DAY_BOUNDARY_HOUR` or `SLEEP_DAY_BOUNDARY_HOUR_DEFAULT`
- default fallback `18`

### View APIs

The view routes now parse `boundaryHour` and pass it into:

- `/api/summaries`
- `/api/unified-timeline`
- `/api/insights`
- `/api/sleep-health-context`

The responses include the effective `boundaryHour` where relevant, so frontend and API output can be checked for alignment.

### Frontend Fetch

`src/App.tsx` sends the current `config.sleepDayBoundaryHour` to Cloud API requests:

```text
boundaryHour=<configured hour>
```

This keeps timeline and sleep-health context requests aligned with the frontend setting.

### Sleep Window Metrics

`cloud-api/src/lib/sleepWindowMetricAggregator.ts` now uses the shared Cloud API boundary utility instead of fixed 18:00 logic.

New `sleep_window_summary` records include:

```text
sleepDayBoundaryHour
```

For compatibility:

- records without `sleepDayBoundaryHour` are treated as legacy 18:00 records
- non-18 boundary records use boundary-aware `sleepBlockId` values
- 18:00 keeps legacy IDs to avoid unnecessary duplicate records for existing behavior

### Drive Sync

`cloud-api/src/routes/driveSync.ts` now parses `boundaryHour` and passes it to sleep-window metric aggregation during:

- normal Drive JSON processing
- sleep-window metric backfill

Drive sync run metadata and response data also include the effective sleep-day boundary hour.

## Fixed 18:00 Residue Review

| File | Previous issue | Current status |
| --- | --- | --- |
| `cloud-api/src/lib/viewModels.ts` | Used `date.getHours() < 18` to group sleep records. | Replaced with `getSleepDayKeyForDate(value, boundaryHour)`. |
| `cloud-api/src/lib/sleepWindowMetricAggregator.ts` | Used `dateParts.hour < 18` to assign `sleepDay`. | Replaced with configurable boundary utility. |
| `cloud-api/src/lib/sleepHealthContext.ts` | Could join summaries and sleep-window metrics from different boundaries. | Filters sleep-window records by compatible `sleepDayBoundaryHour`. |
| `cloud-api/src/routes/view.ts` | Could not receive frontend boundary. | Parses `boundaryHour` query value. |
| `cloud-api/src/routes/driveSync.ts` | Aggregated sleep-window metrics with default/fixed boundary only. | Parses and forwards `boundaryHour`. |
| `src/App.tsx` | Cloud API requests did not include frontend boundary. | Sends `boundaryHour` to relevant Cloud API endpoints. |

The remaining `hour >= 9 && hour < 18` logic in `viewModels.ts` is a daytime activity/circadian scoring heuristic, not a sleep-day boundary rule.

## Target Examples

```text
boundaryHour = 6
2026-05-25 05:59 -> sleepDay = 2026-05-24
2026-05-25 06:00 -> sleepDay = 2026-05-25
```

```text
boundaryHour = 9
2026-05-25 08:59 -> sleepDay = 2026-05-24
2026-05-25 09:00 -> sleepDay = 2026-05-25
```

```text
boundaryHour = 13
2026-05-25 12:59 -> sleepDay = 2026-05-24
2026-05-25 13:00 -> sleepDay = 2026-05-25
```

```text
boundaryHour = 18
2026-05-25 17:59 -> sleepDay = 2026-05-24
2026-05-25 18:00 -> sleepDay = 2026-05-25
```

## Existing Data Impact

### Raw Sleep Records

`SleepRecordDocument` stores `start` and `end`, not `sleepDay`. Raw sleep records do not need Firestore rewriting. They can be regrouped on read with the requested boundary.

### Daily Activity Metrics

Daily activity metrics use calendar `date` and `aggregation = daily_total`. They are not rewritten by O-8b.

### Sleep Window Metrics

Sleep-window metric records are derived data and store:

- `sleepDay`
- `sleepBlockId`
- `windowStart`
- `windowEnd`
- `aggregation = sleep_window_summary`

O-8b does not rewrite existing records. Instead:

- legacy records without `sleepDayBoundaryHour` remain compatible with boundary `18`
- newly generated records can carry the configured boundary hour
- nonmatching boundary records are excluded from sleep-health context joins

This avoids a broad write migration while allowing future backfill or sync runs to create boundary-specific derived records.

## Operational Notes

Changing the frontend setting alone can regroup raw sleep records immediately in view APIs, because the frontend passes `boundaryHour` into Cloud API read endpoints.

However, sleep-window metrics for a non-18 boundary require matching derived records. If those are missing, sleep-health context may intentionally show fewer sleep-window metrics until a boundary-aware Drive sync/backfill creates them.

O-8b has been deployed to Cloud Run for the read-model and boundary-aware aggregation code path. A broad Firestore rewrite/backfill of existing derived records has not been performed.

## Test Coverage

Added or updated tests cover:

- arbitrary boundary examples including `0`, `6`, `9`, `13`, `18`, and `23`
- invalid boundary normalization
- Cloud API day-model grouping
- sleep-window metric aggregation with configurable boundary
- stored `sleepDayBoundaryHour`
- sleep-health context filtering by matching boundary
- legacy sleep-window records remaining compatible with boundary `18`

## Safe Deployment Plan

1. Review this implementation and test results.
2. Deploy Cloud Run only after explicit approval, because O-8b changes backend read and derived aggregation behavior.
3. Keep default boundary at `18` unless intentionally changed.
4. If operating with a non-18 boundary, run a limited boundary-aware Drive sync/backfill before relying on sleep-window metric diagnostics.
5. Confirm:
   - top page latest sleep
   - timeline
   - split sleep tab
   - data diagnostics
   - sleep-health context candidate flags
6. Only after verification, decide whether old 18-boundary derived records should remain as compatibility records or be cleaned up in a separate phase.

## Recommendation

O-8b is safe as a code-level alignment step with default `18`. It does not require rewriting raw sleep records.

For actual operation at another boundary such as `6`, `9`, or `13`, treat sleep-window metrics as boundary-specific derived data. Use a limited backfill/sync path and verify diagnostics before considering any cleanup of legacy records.

## Safety Notes

- This document does not include secrets, tokens, environment values, `google-services.json` contents, or raw health data values.
- This document does not request Firebase Hosting or Cloud Run deployment.
- This document does not change Android or iOS direction; mobile app work remains frozen.
