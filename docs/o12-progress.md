# O-12 Progress Tracker

Status: **Implementation not started**  
Baseline: [`o12-local-first-cloud-exit-plan.md`](./o12-local-first-cloud-exit-plan.md)  
Current phase: **O-12a — Current-state audit**  
Next action owner: **ChatGPT**  
Last updated: **2026-08-23**

This document is the operational control center for O-12. It tracks phase status, responsibility split, evidence, blockers, and all ChatGPT ↔ Codex handoffs.

The baseline document defines O-12 scope, architecture, gates, and completion criteria. If this tracker conflicts with the baseline, the baseline wins.

## 1. Operating model

O-12 is executed with a **ChatGPT-first, Codex-minimal** workflow.

### ChatGPT is the primary owner

ChatGPT handles work whenever it can be completed from connected sources, GitHub, Google Drive, public documentation, existing reports, or user-provided Codex output.

ChatGPT is responsible for:

- project planning and phase control
- GitHub/code/document audit
- Google Drive inventory when accessible through connected Drive tools
- public-service specification and pricing/policy verification
- Cloud dependency analysis from repository code and Codex-provided read-only output
- Firestore/data classification from available evidence
- Processed Data Contract design and review
- migration strategy and validation criteria
- test-plan design
- review of Codex changes and command output
- progress/evidence documentation
- deciding whether a phase gate has passed

Audit work is therefore **ChatGPT-owned by default**.

### Codex is an execution agent, not the project planner

Codex is used only when the task materially requires the N100/local filesystem, local runtime, local credentials, `gcloud`, Tailscale CLI, build/test execution, or multi-file code modification that needs local validation.

Typical Codex-only work includes:

- reading local uncommitted Git state
- verifying the actual local/mounted filesystem path
- checking local Node/npm/runtime versions
- checking actual Tailscale/N100 runtime state
- executing read-only `gcloud` inventory commands when ChatGPT cannot access the project directly
- applying reviewed code changes locally
- running builds/tests/migration scripts
- exercising local services and reboot/startup behavior
- performing explicitly approved Cloud/Tailscale state changes in later phases

Codex should not repeat research, architecture analysis, or repository-wide review that ChatGPT has already done.

### User approval boundary

Read-only inspection may be delegated to Codex when required.

Any action that stops, deletes, disables, migrates, overwrites, or materially changes production/Cloud data or services requires the phase gate to permit it and explicit user approval before execution.

## 2. Codex token-minimization rules

Before issuing a Codex task, ChatGPT must first exhaust work that can be done here.

Every Codex task should follow these rules:

1. **One bounded objective** per request.
2. Prefer a **small command bundle** over conversational exploration.
3. Give exact paths/files/commands when already known.
4. Tell Codex what **not** to inspect or change.
5. Ask for concise factual output, not a second architectural analysis.
6. Reuse prior command output instead of asking Codex to rediscover facts.
7. Do not ask Codex to browse documentation that ChatGPT can verify directly.
8. Do not ask Codex to produce long prose reports; evidence should be machine/fact oriented.
9. ChatGPT reviews Codex output and decides the next step.
10. Codex is not called at all when ChatGPT can safely complete the task directly.

## 3. Status legend

- **NOT STARTED** — no implementation work has begun
- **CHATGPT WORKING** — ChatGPT-owned analysis/audit/document work is active
- **CODEX NEEDED** — ChatGPT has reduced the remaining work to a local execution task
- **CODEX RUNNING** — a bounded Codex task has been issued
- **REVIEW** — ChatGPT is checking evidence/results
- **BLOCKED** — work cannot safely continue until a blocker is resolved
- **COMPLETE** — the phase exit gate has passed and evidence is recorded

A phase must not be marked COMPLETE without evidence.

## 4. Stage / phase responsibility map

| Stage | Phase | Primary ChatGPT work | Minimum Codex work | Status |
| --- | --- | --- | --- | --- |
| **1 Inventory** | **O-12a Current-state audit** | GitHub/code audit, connected Drive audit, dependency map, public fact-check, analyze local/GCP evidence | Only N100-local facts and read-only `gcloud`/Tailscale/runtime output unavailable to ChatGPT | **NOT STARTED** |
| **2 Contract** | **O-12b Processed Data Contract** | Design/version contract, legacy compatibility, provenance, migration rules, review against existing code/data | Only local prototype/test execution if required | **NOT STARTED** |
| **3 Processor** | **O-12c Processor independence** | Identify coupling, define exact refactor, review diffs/tests | Apply bounded local refactor and run tests | **NOT STARTED** |
| **3 Processor** | **O-12d Processor hardening** | Define persistence/fingerprint/path/backup requirements, review implementation | Implement/test local filesystem, watcher, snapshot and Drive-copy behavior | **NOT STARTED** |
| **4 Migration** | **O-12e Existing-data migration** | Inventory/classify data, define adapters/manifests, review migration evidence | Run local migration/reconstruction tools and only required Cloud read/export commands | **NOT STARTED** |
| **5 Local runtime** | **O-12f Sleep Compass independence** | Map Cloud dependencies/API contracts, define local replacement, review parity | Apply local code changes and run build/tests | **NOT STARTED** |
| **5 Local runtime** | **O-12g Local Web + Tailscale** | Define same-origin/localhost/access requirements, review configuration | Start/test local server and Tailscale Serve on N100 | **NOT STARTED** |
| **5 Local runtime** | **O-12h Parallel validation and recovery** | Define comparison matrix, inspect/compare evidence, decide parity gate | Execute local test matrix/restart/reconstruction commands and capture results | **NOT STARTED** |
| **6 Cloud exit** | **O-12i Cloud operation stop** | Confirm gate, prepare exact reversible stop plan, review post-stop evidence | Execute only approved Cloud stop action and local verification commands | **NOT STARTED** |
| **6 Cloud exit** | **O-12j Complete Cloud exit** | Final resource/Billing/data audit, decide safe deletion order, verify completion | Execute only explicitly approved Billing/project/resource shutdown commands that require local credentials | **NOT STARTED** |

## 5. Phase details

### O-12a — Current-state audit

**ChatGPT owns first pass.**

ChatGPT tasks:

- [ ] Audit GitHub `master`, current code, docs, dependencies, Cloud/Firebase references
- [ ] Audit existing local-server architecture from repository code
- [ ] Audit connected Google Drive for raw/source coverage and existing processed assets where available
- [ ] Build a Cloud dependency/resource checklist from code and documentation
- [ ] Verify current public Google Cloud/Tailscale behavior only where needed
- [ ] Reduce unknowns to a minimal N100/Codex read-only checklist
- [ ] Review and classify Codex output
- [ ] Record O-12a findings and blockers here

Codex tasks, only after ChatGPT first pass:

- [ ] Report local Git status/branch/remotes only if local unpublished state is still unknown
- [ ] Report actual N100 source path/mount and relevant local data paths
- [ ] Report Node/npm/runtime versions needed for implementation
- [ ] Report Tailscale local state needed for planning
- [ ] Run the smallest read-only `gcloud` inventory needed to resolve remaining project-resource/Billing unknowns
- [ ] Do not modify Cloud, Firestore, Drive, repo files, or production state

**Exit gate:** Cloud/Billing/Firestore/Drive/local/host inventory is sufficient to design O-12b and no unexplained important data/resource category remains.

**Evidence:** _not yet recorded_

### O-12b — Processed Data Contract

ChatGPT tasks:

- [ ] Define canonical datasets and text formats
- [ ] Define `schemaVersion`, `processorVersion`, `generatedAt`, provenance and processing-config fields
- [ ] Define sleep-day configuration provenance
- [ ] Define legacy-reader compatibility policy
- [ ] Define snapshot publication/retention rules
- [ ] Define migration manifest
- [ ] Compare the contract against existing raw/local/Cloud schemas
- [ ] Produce contract test cases

Codex tasks:

- [ ] Only run a small parser/fixture/prototype test if ChatGPT cannot prove contract viability statically
- [ ] No broad redesign or repository exploration

**Exit gate:** versioned contract and migration rules are documented, testable, and sufficient for Data Processor and external-app use.

**Evidence:** _not yet recorded_

### O-12c — Processor independence

ChatGPT tasks:

- [ ] Identify exact current coupling between importer, `healthStore`, API server, React, and Cloud logic
- [ ] Decide Processor Core boundaries and stable interfaces
- [ ] Identify objective health metrics/sleep-window logic that must be recovered from Cloud code
- [ ] Prepare bounded file-by-file implementation instructions
- [ ] Review Codex diff and test results

Codex tasks:

- [ ] Apply the reviewed Processor Core refactor locally
- [ ] Add/verify a direct one-shot processing path
- [ ] Keep watcher/continuous operation as a wrapper around the same core
- [ ] Run targeted tests/build only

**Exit gate:** Processor can run without Sleep Compass Web/API, Firebase, Cloud Run, Firestore, Tailscale, or Google Drive API.

**Evidence:** _not yet recorded_

### O-12d — Processor hardening

ChatGPT tasks:

- [ ] Define exact snapshot/atomic-write/corruption behavior
- [ ] Define portable path/fingerprint semantics
- [ ] Define raw-input vs processed-output separation
- [ ] Define Google Drive processed-snapshot publication rules
- [ ] Define retention and recovery tests
- [ ] Review implementation and evidence

Codex tasks:

- [ ] Implement configured raw/working/backup/app-state paths
- [ ] Remove absolute-path/drive-letter persistent identity
- [ ] Implement atomic/versioned snapshots and known-good recovery
- [ ] Remove arbitrary processed-ledger retention limit
- [ ] Optimize unchanged-file hashing
- [ ] Ensure processed output is excluded from raw scanning
- [ ] Test watcher + periodic rescan + Drive snapshot copy locally

**Exit gate:** local persistence, path portability, deduplication, watcher/rescan, recovery and Drive processed-data backup pass defined tests.

**Evidence:** _not yet recorded_

### O-12e — Existing-data migration

ChatGPT tasks:

- [ ] Inventory all evidence available through GitHub/Drive and O-12a output
- [ ] Classify each dataset as Rebuild / Migrate / Archive
- [ ] Define migration adapter behavior and manifest requirements
- [ ] Identify any Firestore-only data requiring preservation
- [ ] Review migration counts, rejects, checksums and reconstruction results
- [ ] Block Cloud deletion if unexplained important data remains

Codex tasks:

- [ ] Run the migration/rebuild tools locally against approved sources
- [ ] Run only necessary read/export commands for Firestore data that cannot be obtained otherwise
- [ ] Run clean-room reconstruction test
- [ ] Return concise counts/errors/checksums, not long prose

**Exit gate:** every important historical dataset is demonstrably rebuilt, migrated, or archived and clean-room reconstruction passes.

**Evidence:** _not yet recorded_

### O-12f — Sleep Compass independence

ChatGPT tasks:

- [ ] Map every Web/API dependency on Firestore/Cloud endpoints
- [ ] Define Processed Data-backed API behavior and compatibility requirements
- [ ] Identify minimum local API parity required by current UI
- [ ] Prepare bounded implementation instructions
- [ ] Review code diff and response-shape parity

Codex tasks:

- [ ] Apply local API/storage changes
- [ ] Remove local-path Firestore dependency
- [ ] Run targeted API/build/tests

**Exit gate:** Sleep Compass runs from Processed Data and no local application path requires Cloud persistence.

**Evidence:** _not yet recorded_

### O-12g — Local Web + Tailscale

ChatGPT tasks:

- [ ] Review same-origin frontend/API configuration
- [ ] Review localhost-only server change
- [ ] Define Firebase Auth removal point and access assumptions
- [ ] Verify Tailscale Serve requirements from official docs when necessary
- [ ] Review Codex runtime evidence

Codex tasks:

- [ ] Serve React + `/api/*` locally
- [ ] Verify bind is localhost-only
- [ ] Configure/test Tailscale Serve on N100
- [ ] Verify approved tailnet devices can access the app
- [ ] Do not use Funnel

**Exit gate:** local Web/API operate same-origin, localhost-only, and are reachable through Tailscale without local Firebase Auth dependency.

**Evidence:** _not yet recorded_

### O-12h — Parallel validation and recovery

ChatGPT tasks:

- [ ] Define exact Cloud-vs-local comparison matrix
- [ ] Review current/latest/month views, blocks, stages, sources, metrics, diagnostics and status outputs
- [ ] Review duplicate/retry/restart/recovery evidence
- [ ] Decide whether parity differences are acceptable and explained
- [ ] Mark gate pass/fail

Codex tasks:

- [ ] Run only the prescribed local comparison/test commands
- [ ] Exercise new-file processing, repeated processing, failure retry, server restart and clean-room reconstruction
- [ ] Capture concise structured evidence

**Exit gate:** required parity and recovery tests pass; remaining differences are explicitly understood and accepted.

**Evidence:** _not yet recorded_

### O-12i — Cloud operation stop

ChatGPT tasks:

- [ ] Confirm O-12h gate is complete
- [ ] Identify the smallest reversible Cloud automation stop action
- [ ] Prepare exact command/action and rollback
- [ ] Obtain explicit user approval before state change
- [ ] Review local-only processing evidence after stop

Codex tasks:

- [ ] Execute only the explicitly approved stop command/action
- [ ] Run prescribed verification commands
- [ ] Do not delete Firestore or other Cloud data

**Exit gate:** Cloud automatic processing is stopped and new source data continues through the local pipeline correctly.

**Evidence:** _not yet recorded_

### O-12j — Complete Cloud exit

ChatGPT tasks:

- [ ] Re-audit known resources, Billing evidence and migration state
- [ ] Confirm all required data has been preserved
- [ ] Confirm project is dedicated to Sleep Compass before project shutdown
- [ ] Prepare exact final disable/shutdown sequence and rollback limits
- [ ] Obtain explicit user approval for destructive/final actions
- [ ] Review completion evidence and update baseline/progress status

Codex tasks:

- [ ] Execute only explicitly approved commands that require local credentials
- [ ] Disable/stop resources or Billing only in the approved sequence
- [ ] Shut down the dedicated project only after ChatGPT/user gate approval
- [ ] Return concise final state evidence

**Exit gate:** normal Sleep Compass operation has no Google Cloud runtime dependency, required data is preserved, Billing is disabled, and the dedicated project is shut down when confirmed appropriate.

**Evidence:** _not yet recorded_

## 6. ChatGPT ↔ Codex handoff protocol

All Codex work must be registered here before or immediately after it is issued.

### Request format

Each Codex request receives an ID such as `CX-O12A-001`.

The request should contain only:

```text
Request ID:
Phase:
Goal:
Commands / files in scope:
Do not:
Return exactly:
```

`Return exactly` should request concise evidence such as versions, paths, command output, changed files, test result and commit SHA.

### Codex return format

Codex should respond with:

```text
Request ID:
Result: PASS / FAIL / BLOCKED
Facts or changed files:
Commands/tests run:
Errors/blockers:
Commit SHA (if any):
```

Long architectural explanations are unnecessary unless a blocker requires analysis.

### Review rule

Codex output is evidence, not the final decision. ChatGPT reviews it, updates the tracker, and decides whether more Codex work is actually necessary.

## 7. Codex request queue and interaction log

| Request ID | Phase | Status | Purpose | Codex scope | Result/evidence | ChatGPT review |
| --- | --- | --- | --- | --- | --- | --- |
| _none_ | O-12a | — | ChatGPT audit runs first | — | — | — |

New Codex requests are appended here rather than kept only in chat history.

## 8. Evidence register

| Evidence ID | Phase | Source | What it proves | Location / reference |
| --- | --- | --- | --- | --- |
| `EV-BASELINE-001` | O-12 overall | GitHub | Approved O-12 baseline exists | `docs/o12-local-first-cloud-exit-plan.md` |
| `EV-PROGRESS-001` | O-12 overall | GitHub | ChatGPT/Codex responsibility and progress-control model exists | this document |

Evidence generated by Codex should be summarized here. Do not commit raw health data, secrets, tokens, OAuth credentials, tailnet-sensitive details, or unnecessary Billing/account identifiers.

## 9. Decision / blocker log

| Date | Phase | Type | Decision or blocker | Owner | Resolution |
| --- | --- | --- | --- | --- | --- |
| 2026-08-23 | O-12 overall | Decision | ChatGPT performs audits and planning by default; Codex use is minimized to local execution that cannot be done here | ChatGPT | Active rule |
| 2026-08-23 | O-12 overall | Decision | Codex interactions are tracked in this progress document | ChatGPT | Active rule |

## 10. Current next action

**Owner: ChatGPT**

Begin O-12a without Codex:

1. audit GitHub code/docs and Cloud/Firebase dependencies,
2. inspect connected Google Drive data that can be safely inventoried here,
3. identify exactly which facts remain inaccessible without N100/local credentials,
4. create one minimal bundled Codex read-only request only for those remaining facts.

No Codex request should be issued before this ChatGPT-first audit reduces the scope.