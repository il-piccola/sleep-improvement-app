# O-11 Data Import Screen Consolidation

O-11 consolidates the existing `読み込み` and `睡眠ソース` tabs into a single data import screen.

The goal is to make it easier to understand where sleep data comes from, how it is imported, and which sources are used for display without changing the underlying import, sync, storage, or analysis behavior.

## Status

Implemented, verified, and deployed to Firebase Hosting.

- `npm test`: passed
- `npm run build`: passed
- `npm run lint`: passed
- Firebase Hosting deploy: completed
- Cloud Run deploy: not required
- User production screen check: completed

## Purpose

- Combine manual import checks and sleep source settings into one screen.
- Reduce top-level navigation items.
- Keep data import status, Health Auto Export file checks, and source preferences close together.
- Preserve the existing sleep analysis and source selection behavior.

## Previous State

Before O-11, the app had two separate navigation items:

- `読み込み`
  - Implemented by `FileImport` in `src/App.tsx`.
  - Uses `HealthAutoExportImportPanel`.
  - Supports local/manual Health Auto Export JSON checks and emergency browser-side import.
  - Shows local file import status.

- `睡眠ソース`
  - Implemented by `SourceSettings` in `src/App.tsx`.
  - Shows detected sleep sources and source quality details.
  - Allows changing source use, priority, and reset behavior.
  - Recalculates the unified timeline and related views through existing source preference state.

Both screens belonged to the same operational area: understanding how sleep data enters the app and which data source is used.

## Implemented Screen

The merged tab is named:

```text
データ取り込み
```

Implemented top-level navigation after O-11:

```text
今日の睡眠
タイムライン
分割睡眠
改善アクション
データ診断
データ取り込み
設定
```

The independent `睡眠ソース` tab has been removed from navigation, but the source settings functionality remains available inside `データ取り込み`.

## Display Order

The merged screen uses a simple one-column reading flow:

1. Manual check / emergency import
2. Import status
3. Sleep source settings
4. Source settings management

Section labels:

```text
手動確認・緊急取り込み
読み込み状態
睡眠ソース設定
ソース設定の管理
```

The screen avoids duplicate page headers. `SourceSettings` is embedded in the merged screen with its page-level header hidden.

## Implementation Scope

Changed files:

- `src/App.tsx`
- `docs/o11-data-import-screen-consolidation.md`

Implementation summary:

- Removed `sources` from the `AppScreen` navigation surface.
- Renamed the `import` tab label from `読み込み` to `データ取り込み`.
- Rendered the current `FileImport` content and `SourceSettings` content in the same screen.
- Added `showHeader` support to `SourceSettings` to avoid duplicated headers.
- Kept the existing source preference state and handlers unchanged.
- No `src/App.css` change was needed.

## Out of Scope

O-11 must not change:

- Cloud API behavior
- Firestore data
- Google Drive sync behavior
- Save/import persistence behavior
- Android or iOS app work
- Sleep analysis logic
- Health Auto Export parsing rules
- O-10 scheduled sync behavior

## Safety Requirements

- Do not remove source preference controls.
- Do not change how source priority, ignored sources, fallback sources, or reset behavior works.
- Do not change manual JSON import semantics.
- Do not move source settings into `データ診断`; that tab should remain focused on data status and diagnostics.
- Keep the normal Google Drive sync path described as the primary import route.

## Verification

Executed:

```powershell
npm test
npm run build
npm run lint
```

Results:

- `npm test`: passed
- `npm run build`: passed
- `npm run lint`: passed

Manual UI checks completed:

- `データ取り込み` appears in navigation.
- Independent `睡眠ソース` tab no longer appears.
- Health Auto Export manual check remains visible.
- Import status remains visible.
- Sleep source settings remain visible.
- Source use, priority, individual reset, and full reset still work.
- Dashboard, timeline, split sleep, actions, diagnostics, and settings still render.
- Mobile layout remains readable.

## Deployment

O-11 is a frontend-only UI consolidation.

- Firebase Hosting deploy: completed
- Cloud Run deploy: not needed
