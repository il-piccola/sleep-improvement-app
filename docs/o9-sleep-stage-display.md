# O-9 Sleep Stage Display

O-9 adds sleep stage visibility to the web dashboard. The goal is to distinguish REM, Core, Deep, and generic sleep in the timeline and split-sleep detail views when the source data provides those stages.

This is a display and interpretation improvement only. It is not a medical diagnosis feature, and it does not claim that any sleep stage is good, bad, improved, or worsened.

## Scope

- Preserve detailed sleep stages from Health Auto Export / Apple Health-compatible records.
- Carry stage details through sleep block construction and Cloud API timeline responses.
- Show stage-colored strips inside existing sleep timeline bars.
- Show compact stage summaries in split-sleep detail rows.
- Keep existing sleep block classification, split-sleep scoring, sleep-day boundary handling, sync, and storage behavior unchanged.

## Data Flow

Raw sleep records are normalized into `SleepRecord[]`.

Known sleep stages are normalized as:

| Source meaning | Normalized stage | Display label |
| --- | --- | --- |
| REM | `asleep_rem` | レム |
| Core | `asleep_core` | コア |
| Deep | `asleep_deep` | 深い睡眠 |
| Asleep / unspecified sleep | `asleep` / `asleep_unspecified` | 睡眠 |

Sleep blocks now carry `stageSegments` as display metadata:

```ts
type SleepStageSegment = {
  stage: NormalizedSleepStage
  start: string
  end: string
  durationMinutes: number
}
```

`stageSegments` are derived from sleep records. They do not replace the source records and do not require a Firestore data migration.

## Cloud API

`/api/unified-timeline` sleep blocks include `stageSegments` when stage-level records are available.

The field is part of the view model:

```ts
type SleepBlockView = {
  start: string
  end: string
  durationMinutes: number
  type: 'main' | 'nap' | 'supplemental' | 'evening' | 'unknown'
  sourceKeys: string[]
  sourceLabels: string[]
  stageSegments: Array<{
    stage: SleepRecordDocument['stage']
    start: string
    end: string
    durationMinutes: number
  }>
}
```

If a block has no detailed stage segments, the web app falls back to a generic sleep display.

## Web Display

The timeline keeps the existing sleep block bar and overlays a compact stage strip inside the bar.

Stage colors are intentionally gentle and pastel:

- レム
- コア
- 深い睡眠
- 睡眠

The split-sleep detail view shows a short stage summary for each block. It does not show medical advice or diagnostic wording.

## Safety Notes

- No Cloud API storage behavior changed.
- No Firestore migration was required.
- No Drive sync behavior changed.
- No save/import flow changed.
- Stage display depends on source data. If the source only provides generic sleep, the app cannot infer REM/Core/Deep.
- Stage labels are for self-monitoring only.

## Verification

Implemented checks cover:

- Cloud API timeline blocks preserve `stageSegments`.
- Frontend sleep block analysis preserves REM/Core/Deep segments.
- Timeline renders stage strips without removing existing sleep block bars.
- Generic sleep fallback remains available when detailed stages are missing.

Manual verification after deploy should include:

- Timeline shows REM/Core/Deep coloring when available.
- Split-sleep detail rows show stage summaries.
- Existing sleep totals, sleep count, and data diagnosis remain visible.
- No medical or diagnostic wording is introduced.
