# O-12 Progress Tracker

Status: **Implementation not started**  
Baseline: [`o12-local-first-cloud-exit-plan.md`](./o12-local-first-cloud-exit-plan.md)  
Next executable phase: **O-12a — Current-state audit**  
Last updated: **2026-08-23**

This document tracks implementation progress only. The baseline document defines O-12 scope, architecture, gates, and completion criteria. If this tracker conflicts with the baseline, the baseline wins.

## Status legend

- **NOT STARTED** — no implementation work has begun
- **IN PROGRESS** — work has begun but the exit gate has not passed
- **BLOCKED** — work cannot safely continue until a blocker is resolved
- **COMPLETE** — the phase exit gate has passed and evidence is recorded

A phase must not be marked COMPLETE without evidence. Destructive Cloud actions are prohibited until the gates in the baseline document allow them.

## Overall progress

| Stage | Phase | Status | Exit gate / evidence | Next action |
| --- | --- | --- | --- | --- |
| **Stage 1 — Inventory** | **O-12a Current-state audit** | **NOT STARTED** | Read-only Cloud/Billing/Firestore/Drive/local/host inventory completed | Run read-only inventory |
| **Stage 2 — Contract** | **O-12b Processed Data Contract** | **NOT STARTED** | Versioned contract and migration rules defined and testable | Wait for O-12a |
| **Stage 3 — Processor** | **O-12c Processor independence** | **NOT STARTED** | Processor runs without Sleep Compass Web/API or Cloud runtime | Wait for O-12b |
| **Stage 3 — Processor** | **O-12d Processor hardening** | **NOT STARTED** | Safe snapshots, path independence, fingerprinting, watcher/rescan, Drive backup pass | Wait for O-12c |
| **Stage 4 — Migration** | **O-12e Existing-data migration** | **NOT STARTED** | Every important dataset rebuilt, migrated, or archived; reconstruction passes | Wait for O-12d |
| **Stage 5 — Local runtime** | **O-12f Sleep Compass independence** | **NOT STARTED** | Sleep Compass runs from Processed Data without Cloud persistence | Wait for O-12e |
| **Stage 5 — Local runtime** | **O-12g Local Web + Tailscale** | **NOT STARTED** | same-origin Web/API, localhost-only server, Tailscale access, no local Firebase Auth dependency | Wait for O-12f |
| **Stage 5 — Local runtime** | **O-12h Parallel validation and recovery** | **NOT STARTED** | Cloud/local parity and clean-room recovery tests pass | Wait for O-12g |
| **Stage 6 — Cloud exit** | **O-12i Cloud operation stop** | **NOT STARTED** | Local-only path processes new data correctly after Cloud automation stops | Wait for O-12h |
| **Stage 6 — Cloud exit** | **O-12j Complete Cloud exit** | **NOT STARTED** | Final audit, data preservation, Billing disablement, dedicated project shutdown | Wait for O-12i |

## Phase checklists

### O-12a — Current-state audit

- [ ] Confirm local repository status, recent commits, and remotes before changes
- [ ] Inventory Google Cloud resources using more than one source
- [ ] Review Billing service/SKU activity
- [ ] Inventory Firestore datasets and classify likely migration needs
- [ ] Confirm Google Drive raw-source coverage and existing processed assets
- [ ] Confirm current host Node/runtime environment
- [ ] Confirm current Drive-mounted source path without treating its drive letter as permanent
- [ ] Confirm Tailscale state and local access assumptions
- [ ] Confirm the Google Cloud project is dedicated to Sleep Compass before any future shutdown
- [ ] Record findings without modifying Cloud, Firestore, Drive data, or production services

**Evidence:** _not yet recorded_

### O-12b — Processed Data Contract

- [ ] Define canonical datasets and formats
- [ ] Define `schemaVersion`, `processorVersion`, `generatedAt`, and provenance fields
- [ ] Define sleep-day configuration provenance
- [ ] Define legacy-reader compatibility policy
- [ ] Define snapshot publication and retention rules
- [ ] Define migration manifest format
- [ ] Define backward-compatibility / migration-adapter policy
- [ ] Verify the contract can be consumed independently of Sleep Compass

**Evidence:** _not yet recorded_

### O-12c — Processor independence

- [ ] Separate Processor Core from Sleep Compass Web/API lifecycle
- [ ] Add a direct one-shot processing path
- [ ] Keep watcher/continuous execution as a wrapper around the same core
- [ ] Recover objective health-metric and sleep-window processing from the current Cloud path
- [ ] Verify processing does not require React, Tailscale, Firebase, Cloud Run, Firestore, or Google Drive API

**Evidence:** _not yet recorded_

### O-12d — Processor hardening

- [ ] Configure raw input, processed working data, backup output, and app-state paths
- [ ] Remove drive-letter / absolute-path identity dependence
- [ ] Normalize persistent relative paths across operating systems
- [ ] Implement atomic/versioned snapshots and known-good recovery
- [ ] Distinguish missing data from corrupt/unreadable data
- [ ] Replace the processed-file ledger's arbitrary retention limitation
- [ ] Avoid unnecessary whole-file hashing on unchanged historical files
- [ ] Keep raw-input and processed-output roots separate
- [ ] Exclude processed output from raw input scanning
- [ ] Publish validated, completed processed snapshots to Google Drive
- [ ] Verify watcher plus periodic rescan behavior

**Evidence:** _not yet recorded_

### O-12e — Existing-data migration

- [ ] Inventory Health Auto Export JSON
- [ ] Inventory `normalized-sleep-records.json`
- [ ] Inventory supported Apple Health XML
- [ ] Inventory existing `health-store.json`
- [ ] Inventory existing `processed-files.json`
- [ ] Inventory relevant Firestore datasets
- [ ] Classify each important dataset as Rebuild / Migrate / Archive
- [ ] Preserve unsupported or unexplained important data instead of dropping it
- [ ] Produce migration manifest with counts/outcomes
- [ ] Run clean-room reconstruction from retained source and migration assets
- [ ] Verify important historical periods remain readable

**Evidence:** _not yet recorded_

### O-12f — Sleep Compass independence

- [ ] Make Sleep Compass consume Processed Data as its persistent input
- [ ] Remove Firestore dependence from the local application path
- [ ] Provide local API parity required by the current Web UI
- [ ] Preserve current sleep-day, stage, source, overlap, metrics, and month-view behavior needed for parity

**Evidence:** _not yet recorded_

### O-12g — Local Web + Tailscale

- [ ] Serve React and `/api/*` from the same local origin
- [ ] Bind the application server to localhost only
- [ ] Remove local Firebase Authentication dependency after access model validation
- [ ] Configure Tailscale Serve, not Funnel
- [ ] Verify access from intended tailnet devices
- [ ] Verify no direct LAN/public exposure is required

**Evidence:** _not yet recorded_

### O-12h — Parallel validation and recovery

- [ ] Compare Cloud and local output for historical and current data
- [ ] Verify latest sleep, month views, sleepDay, main/nap/evening classification, stages, source integration, metrics, and diagnostics
- [ ] Verify new source files process correctly
- [ ] Verify repeated processing does not create unintended duplicates
- [ ] Verify failed imports can retry safely
- [ ] Verify restart/reboot recovery behavior
- [ ] Run clean-room local reconstruction and confirm the Web result is usable
- [ ] Resolve or explicitly explain any parity differences before Cloud shutdown work

**Evidence:** _not yet recorded_

### O-12i — Cloud operation stop

- [ ] Stop Cloud automatic processing using the least destructive reversible step first
- [ ] Confirm local Processor continues to process multiple new inputs without Cloud assistance
- [ ] Confirm local Sleep Compass remains usable through Tailscale
- [ ] Keep Cloud data intact as rollback until verification is complete

**Evidence:** _not yet recorded_

### O-12j — Complete Cloud exit

- [ ] Re-run resource inventory and Billing review
- [ ] Preserve any remaining required data
- [ ] Confirm Google Drive source/processed assets are independent of project shutdown
- [ ] Remove remaining normal-runtime Cloud dependencies
- [ ] Disable Billing for the Sleep Compass project
- [ ] Verify project has no required non-Sleep-Compass workload
- [ ] Shut down the dedicated Google Cloud project
- [ ] Record final state and any post-shutdown billing settlement observations

**Evidence:** _not yet recorded_

## Current blockers

None recorded. O-12a has not yet begun.

## Decision / change log

| Date | Phase | Decision or change | Evidence / reference |
| --- | --- | --- | --- |
| 2026-08-23 | Planning | O-12 baseline approved; six major stages mapped to O-12a through O-12j | [`o12-local-first-cloud-exit-plan.md`](./o12-local-first-cloud-exit-plan.md) |

## Update rule

After each meaningful O-12 work unit:

1. update the affected phase status,
2. check only items actually verified,
3. add concise evidence such as commit SHA, command/result summary, or document reference,
4. record blockers immediately,
5. set the next action,
6. do not advance to a destructive phase until the prior exit gate has passed.
