# O-12e 既存データ移行

Status: **ACTIVE — E1 tooling実装済み / Cloud evidence取得待ち**  
Phase: **O-12e — Existing-data migration**  
Updated: **2026-08-24**

## 1. 目的

O-12eでは、Cloud停止・削除の前に既存データを `Rebuild / Migrate / Archive` へ確定し、重要データがlocal-first Processed Dataへ再構築または保存されたことを証明する。

このPhaseでは **Cloud dataを削除しない**。Cloud Run / Scheduler / Billingも停止・変更しない。

## 2. 前提

- O-12a COMPLETE
- O-12b Processed Data Contract v1.0.0 COMPLETE
- O-12c Processor independence COMPLETE
- O-12d Processor hardening COMPLETE
- `CX-O12D-001`: `PASS_WITH_ENVIRONMENT_EXCEPTION`
  - synthetic hardening PASS
  - build PASS
  - static safety checks PASS
  - snapshot CLI PASS
  - application errorなし
  - full regressionのみ既知 `uv_os_get_passwd ENOMEM`

## 3. O-12e確定分類

| Source | Classification | O-12e handling |
| --- | --- | --- |
| Health Auto Export JSON | **Rebuild** | N100 raw rootからcanonical snapshotを再生成 |
| local `health-store.json` | **Rebuild if reproducible / otherwise block** | 存在時はsemantic hashでcanonical `sleep-records`との一致を確認。元fileもprivate archive |
| local `processed-files.json` | **Archive** | 存在時はprivate archive。canonical stateには直接移植しない |
| Firestore `sleep_records` | **Rebuild + parity** | health valueを表示せず、共通semantic projectionのcount + SHA-256でlocal canonicalと比較 |
| Firestore `health_metric_records` | **Rebuild + parity** | metric/value/window/sourceのcore semantic projectionをcount + SHA-256で比較。旧Cloudとcanonicalで意図的に異なるmain-sleep UI分類はhash対象外 |
| Firestore `processed_drive_files` | **Archive** | raw Firestore document JSONLをprivate archive |
| Firestore `drive_sync_runs` | **Archive** | private archive |
| Firestore `ingest_batches` | **Archive** | private archive |
| Firestore `metric_audit_summaries` | **Archive** | private archive |

`maya-daily-observation-console` はO-12eのdata migration対象ではない。O-12j dedicated-project判定へ引き継ぐ。

## 4. E1 — Migration tooling

実装済み:

- `processor/migration.ts`
  - migration evidence validation
  - archive artifact byteLength/SHA-256 verification
  - Firestore rebuild semantic parity
  - required evidence category enforcement
  - `migration-manifest.json`生成
  - migration snapshot publication
- `processor/localMigrationEvidence.ts`
  - local legacy state存在/不在の証拠化
  - present stateのprivate archive
  - `health-store` semantic hash
  - Cloud/local evidence merge
- `processor/runLocalMigrationEvidence.ts`
- `processor/runMigration.ts`
- `scripts/o12e-firestore-evidence.py`
  - Firestore six collection groups read-only scan
  - document本文をterminalへ表示しない
  - rebuild collectionはcount + semantic SHA-256のみevidenceへ記録
  - archive collectionはprivate JSONL artifact
  - Firestore write/delete = 0
- `tests/processor-migration.test.ts`
- `tests/processor-local-migration-evidence.test.ts`

Local-only working directories:

- `migration-input/`
- `migration-output/`

両方ともGit管理外。

## 5. E2 — Firestore evidence / archive

正式手順:

[`o12e-firestore-evidence-runbook.md`](./o12e-firestore-evidence-runbook.md)

1回のCloud Shell実行でsix collection groupsを読み取る。

出力:

- `o12e-firestore-evidence.json`
- `firestore-archive/*.jsonl`
- 上記を含むZIP bundle

terminalへ出すのはcollection count、bundle path、bundle SHA-256のみ。document本文、user ID、health valueは表示しない。

Cloud Shell bundleはN100へdownloadし、repoの `migration-input/` 配下へ置く。

## 6. E3 — N100 final migration / validation

Cloud bundleのdownload後、Codex確認は **1回だけ** にまとめる。

同一task内で:

1. latest `master` sync
2. O-12e synthetic tests
3. build
4. Firestore bundle SHA / evidence artifact verification
5. current raw rootからreal canonical rebuild snapshot生成
6. completed snapshotをGoogle Drive backupへcopy
7. local legacy state evidence生成
8. Cloud + local evidence merge
9. migration snapshot生成
10. `migration-manifest.json` validation
11. Firestore `sleep_records` / `health_metric_records` semantic parity判定
12. archive artifact completeness確認
13. final worktree CLEAN

実Health値は返却に含めない。

## 7. O-12e Exit Gate

O-12eをCOMPLETEにできる条件:

- [ ] real Health Auto Export rawからcompleted canonical snapshot生成
- [ ] local completed snapshot validation PASS
- [ ] Google Drive backup completed snapshot validation PASS
- [ ] local `health-store` / `processed-files` presenceを明示
- [ ] Firestore six category evidenceがすべて存在
- [ ] `sleep_records` rebuild parity matched、または明示的に説明・保存された差異のみ
- [ ] `health_metric_records` core rebuild parity matched、または明示的に説明・保存された差異のみ
- [ ] archive対象のpresent collectionにartifact + byteLength + SHA-256が存在
- [ ] migration manifest `unresolved=[]`
- [ ] migration status `completed` または、rejected/warningのみの `completed_with_warnings` で重要データ欠落なし
- [ ] Cloud data削除なし
- [ ] final worktree CLEAN

O-12e COMPLETE前にCloud dataを削除しない。
O-12h COMPLETE前にCloud operationを停止しない。
