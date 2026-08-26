# O-12 Local-first Cloud Exit Plan

Status: **Approved baseline — preservation timing clarified 2026-08-26**  
Scope: infrastructure and data-platform migration  
Primary goal: **remove Sleep Compass runtime dependencies on chargeable Google Cloud services while preserving all existing data assets**

Progress tracking: [`docs/o12-progress.md`](./o12-progress.md)

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

The preservation inventory must cover at least:

- Health Auto Export JSON
- `normalized-sleep-records.json`
- supported Apple Health XML
- existing local `health-store.json`
- existing local `processed-files.json`
- Firestore data used by Sleep Compass

The general migration taxonomy remains:

1. **Rebuild**: reproducible from retained source data and processing logic.
2. **Migrate**: required in the new local/processed-data model.
3. **Archive**: retained as historical or source-of-record evidence.

However, **O-12e is the preservation-readiness gate, not the production-backup execution gate and not the Cloud/local semantic-parity gate**.

For O-12e, the known Firestore datasets, archive format, collection-count evidence, byte-length/SHA-256 verification, N100 storage, Google Drive copy, and integrity-check procedure must be fully defined. O-12e does not require an early production archive while Cloud ingestion is still active.

An early Firestore archive can become stale immediately after the next Cloud ingest/sync run. Therefore the final production preservation bundle is created in O-12i only after O-12h has passed, Cloud write paths have been placed into a reversible maintenance freeze, and in-flight writes are confirmed absent.

The final Firestore preservation bundle must be kept on the N100 host and copied to Google Drive outside the raw watch root, with SHA-256 equality verified after the copy.

O-12e does not require a semantic comparison between Firestore records and newly generated Processed Data. It also does not require a clean-room reconstruction test. Those functional and behavioral checks belong to O-12h.

Unknown or unsupported existing data must not be silently dropped. If important data cannot be preserved, Cloud deletion is blocked until a preservation method is defined.

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

Cloud removal is staged. Preservation procedure readiness must complete before local-runtime migration proceeds. Cloud/local behavior and recovery must be validated in O-12h. In O-12i, Cloud write paths are frozen, in-flight writes are cleared, the final Firestore preservation bundle is captured and verified, and local-only operation is confirmed. Destructive Firestore/Cloud deletion is reserved for O-12j.

## 10. Execution map

For readability, O-12 is managed as six major stages. The O-12a through O-12j work phases are the detailed execution units under those stages.

### Stage-to-phase correspondence

| Major stage | Work phase | Phase name | Exit gate |
| --- | --- | --- | --- |
| **Stage 1 — Inventory** | **O-12a** | Current-state audit | Cloud, Billing, Firestore, Drive, local data, host runtime, paths, and Tailscale have been inventoried read-only; no destructive action taken. |
| **Stage 2 — Contract** | **O-12b** | Processed Data Contract | Schemas, versioning, provenance, legacy-reader policy, snapshot rules, compatibility policy, and migration-manifest format are defined and testable. |
| **Stage 3 — Processor** | **O-12c** | Processor independence | Data Processor core can run without Sleep Compass Web/API, Firebase, Cloud Run, Firestore, Tailscale, or Google Drive API. |
| **Stage 3 — Processor** | **O-12d** | Processor hardening | Safe snapshots, corruption handling, OS/path independence, efficient fingerprinting, watcher/rescan, and Google Drive processed-data backup are working. |
| **Stage 4 — Preservation readiness** | **O-12e** | Existing-data preservation readiness | Every known Firestore/local source has a defined private preservation method; all six Firestore categories are covered; count/byteLength/SHA verification and N100/Drive copy procedures are ready; production final backup is intentionally deferred until write freeze. |
| **Stage 5 — Sleep Compass local runtime** | **O-12f** | Sleep Compass independence | Sleep Compass consumes Processed Data instead of Cloud persistence and required local API parity is available. |
| **Stage 5 — Sleep Compass local runtime** | **O-12g** | Local Web + Tailscale | React/API are same-origin, server is localhost-only, local Firebase Auth dependency is removed, and Tailscale Serve access works. |
| **Stage 5 — Sleep Compass local runtime** | **O-12h** | Parallel validation and recovery test | Cloud/local parity, new-data processing, deduplication, restart behavior, intentional-difference review, and clean-room recovery are verified while Cloud remains available. |
| **Stage 6 — Cloud exit** | **O-12i** | Cloud write freeze, final preservation, local-only verification | Cloud ingest/sync writes are reversibly frozen; in-flight writes are absent; the latest Firestore/local state is preserved to N100 + Google Drive with integrity verification; write freeze is maintained; local-only processing is verified. |
| **Stage 6 — Cloud exit** | **O-12j** | Complete Cloud exit | Final resource/Billing audit is complete; O-12i final preservation remains valid; Firestore/Cloud resources are removed when safe; Billing is disabled; and the project is shut down only if confirmed dedicated. |

The stage order and gates are mandatory. O-12e must complete before O-12f. O-12h must pass before Cloud write freeze. O-12i final preservation and local-only verification must pass before Firestore/Cloud deletion, Billing disablement, or project shutdown in O-12j.

Detailed progress is maintained separately in [`docs/o12-progress.md`](./o12-progress.md). This baseline describes what O-12 means; the progress document records where implementation currently stands.

### Stage 1 — Inventory

Read-only investigation first.

Confirm:

- all Sleep Compass-related Google Cloud resources
- Billing services/SKUs actually associated with the project
- Firestore datasets and their preservation classification
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

### Stage 4 — Preservation readiness

Prepare complete preservation coverage before local-runtime migration, but do not take an early production Firestore backup that will become stale while Cloud ingestion is still running.

For Firestore, establish and review the procedure to:

- read the known Sleep Compass collection groups without writes/deletes,
- archive every present collection to private JSONL files,
- record collection counts, byte lengths, and SHA-256 hashes,
- keep the original preservation bundle on the N100 host,
- copy the same bundle to Google Drive outside the raw watch root,
- verify the copied bundle hash matches.

For local legacy state, establish presence/absence and private-archive handling.

Do not require Cloud/local semantic parity, application tests, or clean-room reconstruction to close this stage. Those checks belong to Stage 5 / O-12h.

The production final backup is executed later in O-12i, after Cloud writes are frozen.

### Stage 5 — Sleep Compass local runtime

Make Sleep Compass consume Processed Data rather than Cloud persistence.

Complete:

- local API parity required by the Web UI
- same-origin React + API serving
- localhost-only binding
- removal of local Firebase Auth dependency
- Tailscale Serve access
- parity checks against the existing Cloud version
- new-data processing and deduplication checks
- restart and clean-room recovery tests

### Stage 6 — Cloud exit

Only after local processing, preservation readiness, Web operation, parity, and recovery tests pass:

1. enter a reversible Cloud write freeze by stopping automatic ingest/sync and avoiding manual write triggers,
2. confirm there are no in-flight Cloud writes,
3. capture the final Firestore/local preservation bundle,
4. verify collection counts, archive byte lengths/SHA-256, N100 retention, and Google Drive copy SHA equality,
5. keep Cloud write freeze in place,
6. verify new data is processed locally without Cloud assistance,
7. perform final resource and Billing audit,
8. optionally evaluate an additional native Firestore backup as a deletion-time rollback option,
9. delete Sleep Compass Firestore/Cloud resources only when no runtime still depends on them and the final preservation bundle remains current,
10. disable Billing for the Sleep Compass project when safe,
11. shut down the Google Cloud project only when confirmed dedicated and safe.

If Cloud writes are resumed after the final preservation bundle is captured, that bundle is no longer considered deletion-ready and must be replaced at the next cutover.

The principle is **prepare preservation → migrate runtime → validate/recover → freeze writes → capture final backup → verify local-only → delete → disable billing → shut down**.

## 11. Completion criteria

O-12 is complete only when all of the following are true:

1. Data Processor runs independently of Sleep Compass.
2. Sleep Compass can operate from Processed Data without Cloud persistence.
3. Processed Data is documented and usable by other applications.
4. Important Processed Data is backed up to Google Drive as versioned completed snapshots.
5. Existing raw/local sources are retained as required, and the latest Firestore/local state is preserved after Cloud write freeze to private archives on N100 + Google Drive with verified integrity.
6. Drive letters and absolute host paths are not part of persistent data identity.
7. The runtime design is portable across Windows, macOS, and Linux with OS-specific changes kept at the filesystem/service boundary.
8. Reprocessing the same source does not create unintended duplicates.
9. Local state corruption can recover from a known-good snapshot or source reconstruction.
10. Cloud/local behavior, intentional differences, restart behavior, and clean-room recovery have been validated before Cloud shutdown.
11. Web and API run locally and are reachable through Tailscale without direct LAN/public exposure.
12. Normal operation no longer depends on Cloud Run, Firestore, Cloud Scheduler, Firebase Hosting/Auth, or Google Drive API.
13. No new paid cloud service was introduced for O-12.
14. The Sleep Compass Google Cloud project has no active Billing relationship at final cutover and, if confirmed dedicated to Sleep Compass, is shut down.

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
