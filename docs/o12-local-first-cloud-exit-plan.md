# O-12 Local-first Cloud Exit Plan

Status: **Approved baseline**  
Scope: infrastructure and data-platform migration  
Primary goal: **remove Sleep Compass runtime dependencies on chargeable Google Cloud services while preserving all existing data assets**

## 1. Purpose

O-12 migrates Sleep Compass from the current Cloud Run / Firestore / Firebase-centered runtime to a local-first architecture.

The target is not merely to move the web app onto one Windows machine. The target is to establish two independently usable systems:

1. **Data Processor**: imports, normalizes, integrates, validates, and exports health/sleep data.
2. **Sleep Compass Runtime**: reads processed data and provides Sleep Compass analysis, API, and Web UI.

The Data Processor must be able to run without Sleep Compass. Processed data is treated as a durable data asset, not as a disposable cache.

O-12 must not introduce a new paid cloud dependency.

## 2. Target architecture

```text
iPhone
  ↓ Health Auto Export
Google Drive
  ↓ OS-visible file access layer
Data Processor
  ├─ format detection / legacy readers
  ├─ normalization
  ├─ source integration / duplicate handling
  ├─ sleep blocks / stages / sleepDay
  ├─ health metrics / sleep-window metrics
  ├─ validation / migration
  └─ processed-data export
          ↓
Processed Data Contract
  ├─ local working/snapshot data
  └─ versioned Google Drive backup
          ↓
    ┌─────┴──────────┐
    ↓                ↓
Sleep Compass     Other apps/tools
  ├─ analysis
  ├─ diagnostics / actions
  ├─ API
  └─ React Web
      ↓
  127.0.0.1
      ↓
Tailscale Serve
      ↓
Tailnet devices
```

The dependency direction is one-way:

```text
Raw data → Data Processor → Processed Data → Sleep Compass
```

Sleep Compass must not become a prerequisite for data processing.

## 3. Data ownership and storage

### Raw source data

Google Drive remains the primary store for source files such as Health Auto Export data and supported legacy inputs.

Raw input is read-only from the processor's point of view. O-12 must not rewrite or delete source health files as part of normal processing.

### Processed data assets

Important processed results are durable assets and must be usable outside Sleep Compass.

The Processed Data Contract should cover, as needed:

- normalized sleep records
- sleep blocks and sleep stages
- sleep-day records / summaries
- source and overlap information
- health metrics
- sleep-window metrics
- data-quality / conversion diagnostics
- generation metadata and schema version

The canonical machine-readable formats should use broadly usable text formats such as JSON / JSONL. CSV may be emitted as a convenience format, but must not be the only canonical representation.

### Local runtime state

Working state and actively updated runtime files stay on the host's local disk. They must not be live-edited inside the Google Drive synchronized area.

Local storage should remain file-based unless measured scale or reliability requirements later justify a database. SQLite is therefore optional, not an O-12 requirement.

### Google Drive backup of processed data

Processed data must also be backed up to Google Drive as completed, versioned snapshots.

The processor must:

1. generate locally,
2. validate the completed snapshot,
3. publish/copy the completed snapshot to a separate Google Drive output location.

The processed-data output directory must be separate from the raw-input watch root and must be excluded from input scanning. This prevents generated JSON from being re-imported as source data.

## 4. Processed Data Contract

Data Processor and Sleep Compass communicate through a documented, versioned contract rather than through implementation-specific internal state.

At minimum, exported datasets must carry enough provenance to interpret them later, including where applicable:

- `schemaVersion`
- `processorVersion`
- `generatedAt`
- processing configuration relevant to derived values
- `sleepDayBoundaryHour` when sleep-day dependent data is exported

A future schema change must use a migration adapter or explicit backward-compatibility path. Old processed assets must not silently become unreadable after an application update.

## 5. Existing data must be preserved

O-12 must not discard previously created Sleep Compass data.

The migration inventory must cover at least:

- Health Auto Export JSON
- `normalized-sleep-records.json`
- supported Apple Health XML
- existing local `health-store.json`
- existing local `processed-files.json`
- Firestore data used by Sleep Compass

Each existing Cloud/Firestore dataset must be classified as one of:

1. **Rebuild**: provably reproducible from retained source data and current processing logic.
2. **Migrate**: required in the new local/processed-data model.
3. **Archive**: not required for current computation, but retained as historical evidence or operational history.

Unknown or unsupported existing data must not be silently dropped. If important data cannot be migrated or proven reproducible, Cloud deletion is blocked until a preservation method is defined.

A migration manifest must record counts and outcomes without embedding unnecessary personal health values.

## 6. Data Processor independence

The Data Processor is a standalone processing system.

It must be possible to run processing without:

- React
- Sleep Compass Web UI
- Sleep Compass API being already started
- Tailscale
- Firebase
- Cloud Run
- Firestore
- Google Drive API

The processor must have a direct one-shot execution path in addition to any long-running watcher. A scheduled/continuous runner may invoke the same processor core, but the core processing logic must not depend on an HTTP request to a running Sleep Compass server.

The processor owns objective transformation tasks such as normalization, integration, metrics, schema migration, and validation.

Sleep Compass owns application-specific interpretation and presentation such as improvement actions, user-facing diagnostics, and UI behavior.

## 7. Portability and path independence

The first O-12 host is the current N100 Windows machine, but Windows is not part of the data model or application contract.

Paths must be configuration values, for example:

```text
HEALTH_EXPORT_WATCH_DIR=<raw input path>
PROCESSED_DATA_DIR=<processed-data working path>
PROCESSED_DATA_BACKUP_DIR=<Google Drive backup path>
SLEEP_COMPASS_DATA_DIR=<Sleep Compass local state path>
```

No drive letter such as `L:` may be hard-coded into application logic. The current drive letter is only an environment detail and may change.

Processed-file identity must not depend on an absolute path or drive letter. It should use a normalized relative path plus file metadata and, when needed, a content hash.

OS-specific path construction must use Node path utilities rather than hard-coded separators.

Windows, macOS, and Linux migrations should require changes mainly in configuration and service startup. The mechanism that exposes Google Drive as local files is outside the Data Processor contract. Linux may therefore use a different mount/sync mechanism without changing processor logic.

## 8. Local Web and network access

Sleep Compass Web and API should run from the same local origin.

The application server must listen on localhost only, preferably `127.0.0.1`, rather than exposing the service directly on the LAN.

External device access is provided through Tailscale Serve. Tailscale Funnel is outside O-12 scope.

The local Sleep Compass path should no longer require Firebase Authentication once the Tailscale-based access model is validated.

## 9. Google Cloud exit target

At O-12 completion, normal Sleep Compass operation must not depend on:

- Cloud Run
- Firestore
- Cloud Scheduler
- Firebase Hosting
- Firebase Authentication
- Google Drive API
- Artifact Registry runtime artifacts
- Cloud Build runtime dependency
- Secret Manager runtime secrets
- other Sleep Compass-specific Google Cloud runtime resources

Google Drive remains permitted as a data store and backup destination, but access from the local runtime is through the OS-visible filesystem layer rather than the Google Drive API.

Cloud removal is staged. No destructive deletion occurs before local parity and data-preservation checks pass.

## 10. Execution map

For readability, O-12 is managed as six major stages. Detailed implementation tasks may keep O-12a/O-12b style sub-numbering under these stages.

### Stage 1 — Inventory

Read-only investigation first.

Confirm:

- all Sleep Compass-related Google Cloud resources
- Billing services/SKUs actually associated with the project
- Firestore datasets and their migration classification
- existing Google Drive source coverage
- existing processed/local datasets
- current host runtime, paths, and Tailscale state

Do not rely on a single inventory mechanism. Cross-check Cloud Asset Inventory, Billing, and known service-specific resource lists.

No Cloud resource deletion, Firestore mutation, Drive deletion, or production deployment belongs in this stage.

### Stage 2 — Contract

Define and test the Processed Data Contract before large migration work.

Lock down:

- schemas and versioning
- provenance fields
- supported legacy readers
- snapshot publication rules
- compatibility policy
- migration manifest format

### Stage 3 — Processor

Separate and complete the standalone Data Processor.

This stage includes:

- extracting processing from Sleep Compass runtime coupling
- recovering objective health-metric processing currently performed in the Cloud path
- safe local snapshot storage
- path/OS independence
- efficient file fingerprinting
- independent one-shot processing
- watcher/rescan operation
- processed-data Google Drive snapshot backup

### Stage 4 — Migration

Move all existing data into the new preservation model.

For every important legacy/Cloud dataset, prove one of:

- successfully rebuilt,
- successfully migrated,
- deliberately archived.

Run a clean-room reconstruction test from retained source and migration assets. Important historical data must remain readable after reconstruction.

### Stage 5 — Sleep Compass local runtime

Make Sleep Compass consume Processed Data rather than Cloud persistence.

Complete:

- local API parity required by the Web UI
- same-origin React + API serving
- localhost-only binding
- removal of local Firebase Auth dependency
- Tailscale Serve access
- parity checks against the existing Cloud version

### Stage 6 — Cloud exit

Only after local processing, migration, Web operation, and recovery tests pass:

1. stop Cloud automatic processing first,
2. verify new data is processed locally without Cloud assistance,
3. perform final resource and Billing audit,
4. preserve any remaining required data,
5. disable Billing for the Sleep Compass project,
6. shut down the dedicated Google Cloud project when confirmed safe.

The principle is **stop → verify → preserve → disable billing → shut down**.

## 11. Completion criteria

O-12 is complete only when all of the following are true:

1. Data Processor runs independently of Sleep Compass.
2. Sleep Compass can operate from Processed Data without Cloud persistence.
3. Processed Data is documented and usable by other applications.
4. Important Processed Data is backed up to Google Drive as versioned completed snapshots.
5. Existing raw, local, processed, and Firestore data has been rebuilt, migrated, or archived without unexplained loss.
6. Drive letters and absolute host paths are not part of persistent data identity.
7. The runtime design is portable across Windows, macOS, and Linux with OS-specific changes kept at the filesystem/service boundary.
8. Reprocessing the same source does not create unintended duplicates.
9. Local state corruption can recover from a known-good snapshot or source reconstruction.
10. Web and API run locally and are reachable through Tailscale without direct LAN/public exposure.
11. Normal operation no longer depends on Cloud Run, Firestore, Cloud Scheduler, Firebase Hosting/Auth, or Google Drive API.
12. No new paid cloud service was introduced for O-12.
13. The Sleep Compass Google Cloud project has no active Billing relationship at final cutover and, if confirmed dedicated to Sleep Compass, is shut down.

## 12. Out of scope

O-12 does not reopen unrelated product work. In particular, it does not include:

- mobile app development/release work
- CPAP OCR
- new AI health inference
- major UI redesign
- new sleep-scoring algorithms unless required for parity
- introduction of a replacement paid cloud platform

## 13. Decision rule

When an O-12 implementation decision is ambiguous, prefer this order:

```text
Preserve data
  ↓
Remove Cloud dependency
  ↓
Keep Data Processor independent
  ↓
Keep processed data portable and reusable
  ↓
Keep OS-specific behavior at the boundary
  ↓
Prefer simple, recoverable local operation
  ↓
Do not introduce surprise cost
```

This document is the baseline for O-12. Sub-phase implementation documents must remain consistent with these goals unless this baseline is explicitly revised.