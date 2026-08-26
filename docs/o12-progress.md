# O-12 作業進捗管理

状態: **O-12a COMPLETE / O-12b COMPLETE / O-12c COMPLETE / O-12d COMPLETE / O-12e COMPLETE（preservation手順確立・final backupはO-12iへ遅延） / O-12f NEXT**  
基準文書: [`o12-local-first-cloud-exit-plan.md`](./o12-local-first-cloud-exit-plan.md)  
Processed Data Contract: [`o12-processed-data-contract.md`](./o12-processed-data-contract.md)  
JSON Schema: [`o12-processed-data-schema.json`](./o12-processed-data-schema.json)  
Migration Source Map: [`o12-migration-source-map.md`](./o12-migration-source-map.md)  
O-12c最終結果: [`o12c-final-validation-result-cx-o12c-012.md`](./o12c-final-validation-result-cx-o12c-012.md)  
O-12d最終結果: [`o12d-final-validation-result-cx-o12d-001.md`](./o12d-final-validation-result-cx-o12d-001.md)  
O-12e scope決定: [`o12e-preservation-scope-decision.md`](./o12e-preservation-scope-decision.md)  
O-12e計画: [`o12e-existing-data-migration.md`](./o12e-existing-data-migration.md)  
O-12e Firestore final-backup手順: [`o12e-firestore-evidence-runbook.md`](./o12e-firestore-evidence-runbook.md)  
O-12e N100 integrity手順: [`o12e-n100-final-migration-runbook.md`](./o12e-n100-final-migration-runbook.md)  
最終更新日: **2026-08-26**

## 1. 運用原則

- O-12は **ChatGPT優先・Codex最小化** で進める。
- Codex確認は安全にまとめられるtest/build/runtime checkを1回へ統合する。
- 既知environment issueだけを理由に安全な後続確認を小分けにしない。
- 一度PASSした項目を理由なく再確認しない。
- Exit Gateは `O-12a → b → c → d → e → f → g → h → i → j` の順序を守る。
- **O-12eはpreservation readiness、O-12hはCloud/local parity・recovery、O-12iはwrite freeze + final backup + local-only、O-12jは削除gateとして分離する。**
- 現行Cloud取り込みが継続している間はFirestore final backupを取得しない。取得しても後続ingestで古くなるため。
- final Firestore backupはO-12h完了後、O-12iでCloud writeを凍結しin-flight処理がないことを確認した直後に実行する。
- final backup後にCloud writeを再開した場合、そのbackupはfinal扱いを失い、次回cutover時に再取得する。
- O-12h完了前にCloud operationを停止しない。
- O-12i final backup + local-only確認前にFirestore削除 / Billing disable / project shutdownを行わない。
- raw health data、secret、token、OAuth credentialをrepositoryや作業ログへ記録しない。
- implementationへN100固有drive letter / mount pathをhardcodeしない。

## 2. Phase一覧

| Phase | 内容 | 状態 |
| --- | --- | --- |
| O-12a | 現状監査 | **COMPLETE** |
| O-12b | Processed Data Contract | **COMPLETE — v1.0.0** |
| O-12c | Processor独立化 | **COMPLETE** |
| O-12d | Processor堅牢化 | **COMPLETE** |
| O-12e | 既存データ保全準備 | **COMPLETE — procedure ready / final backup deferred to O-12i** |
| O-12f | Sleep Compass独立化 | **NEXT** |
| O-12g | Local Web + Tailscale | **NOT STARTED** |
| O-12h | 並行検証・復旧試験 | **NOT STARTED** |
| O-12i | Cloud運用停止 + final preservation | **NOT STARTED** |
| O-12j | Cloud完全撤去 | **NOT STARTED** |

# O-12a — COMPLETE

確認済み:

- N100 raw source観測: `L:\マイドライブ\Health Auto Export`、`Sleep`存在
- 上記pathはhost境界のみ。implementation hardcode禁止
- repo直下`server-data: ABSENT`
- GoogleDriveFS running
- Tailscale Windows service Running / Automatic
- GCP project/Billing/Cloud Run/Scheduler/Artifact Registry/Firestore/Secrets names/Storage/Hosting/APIs inventory
- `maya-daily-observation-console`は用途不明non-Sleep-Compass candidateとしてinventory済み

`maya-daily-observation-console`は停止・削除禁止。O-12j project shutdown判定前に用途再確認する。

# O-12b — COMPLETE v1.0.0

確定済み:

- canonical JSON/JSONL
- schema/version/provenance
- deterministic ID / path portability
- canonical source integration / overlap / sleep block / sleep day
- daily + sleep-window health metrics
- immutable snapshot / manifest / `complete.json`
- migration/retention/compatibility policy

# O-12c — COMPLETE

実装済み:

- C1 standalone Health Auto Export Processor + direct one-shot
- C2 UI source preferenceから独立したcanonical integration
- C2 deterministic block / overlap / sleep-day / main sleep
- C3 Processor-owned daily + sleep-window health metrics
- Processor canonical metric型からCloud/Firestore identityを分離
- existing Cloud metric runtimeは変更せず保護

最終根拠 `CX-O12C-012`: **PASS_WITH_ENVIRONMENT_EXCEPTION**

- C1/C2/C3 native PASS
- build PASS
- Processor forbidden scan PASS
- Cloud metric runtime unchanged PASS
- watcher Processor adapter PASS
- application errorなし
- final worktree CLEAN
- full regressionのみ既知`uv_os_get_passwd ENOMEM`

**O-12c Exit Gate: COMPLETE**

# O-12d — COMPLETE

実装済み:

- atomic JSON state + backup recovery + corruption distinction
- health-store / processed-files silent truncation撤廃
- relative-path unbounded processed ledger
- metadata-first fingerprint + conditional SHA
- standalone watcher/rescan hardening
- OS/path configurable runtime boundary
- immutable/versioned Processed Data snapshot
- manifest dataset count / bytes / SHA-256 validation
- `complete.json` final marker
- completed snapshot backup + final-marker-last-copy
- raw directory → Processor → canonical snapshot standalone path
- synthetic end-to-end hardening tests

最終根拠 `CX-O12D-001`: **PASS_WITH_ENVIRONMENT_EXCEPTION**

- synthetic hardening PASS
- build PASS
- hardcoded host path scan PASS
- state truncation scan PASS
- Processor forbidden import scan PASS
- snapshot CLI usage PASS / exit `2`
- final git status CLEAN
- application errorなし
- full regressionのみ既知`uv_os_get_passwd ENOMEM`

**O-12d Exit Gate: COMPLETE**

# O-12e — COMPLETE

## 3. 2026-08-26 scope整理

O-12eは **Cloud/Firestoreデータ保全の手順確立gate** とする。

旧案からExit Gateを外したもの:

- Firestore `sleep_records` とlocal canonicalのsemantic parity
- Firestore `health_metric_records` とlocal canonicalのsemantic parity
- real raw rebuild
- migration snapshot
- clean-room reconstruction test
- Cloud取り込み継続中の早期Firestore backup

理由:

- parity/recoveryはO-12hの責務
- 現行Cloud取り込み中に取得したbackupは、その後のingestで古くなる
- final backupはwrite freeze直後に取るのが最も安全

## 4. Firestore final preservation仕様 — 確立済み

Firestore既知6 categoryをすべてprivate JSONL archive対象とする。

- `sleep_records`
- `health_metric_records`
- `processed_drive_files`
- `drive_sync_runs`
- `ingest_batches`
- `metric_audit_summaries`

`scripts/o12e-firestore-evidence.py` は6 categoryすべてをread-onlyで収集しprivate JSONLへ保存できる。

各categoryのevidence:

- document count
- presence
- archive relative path
- byteLength
- SHA-256

Firestore write/update/deleteは0。

## 5. Final preservation保存先 — 確立済み

最終cutover時にoriginal ZIPを:

1. N100 localで保持
2. Google Driveのraw watch root外へcopy
3. local / Drive SHA-256一致確認

する。

local `health-store.json` / `processed-files.json`はcutover時点でpresence / absenceを確認し、presentならprivate archiveする。

## 6. 旧migration toolingの扱い

O-12e準備中に実装したsemantic parity / migration manifest toolingは削除しないが、**O-12e Exit Gateでは使用しない**。

O-12hのcomparison/recovery補助として利用可能。

## 7. O-12e Exit Gate — COMPLETE

- [x] Firestore six categoryをcollector対象化
- [x] six categoryのprivate JSONL archive仕様確定
- [x] document count / byteLength / SHA-256 evidence形式確定
- [x] N100 local保存手順確定
- [x] Google Drive copy + SHA一致手順確定
- [x] local legacy state presence / absence / archive手順確定
- [x] Firestore write/update/delete = 0 の安全境界確定
- [x] final backupをO-12i write freeze直後へ遅延する方針確定

**O-12e Exit Gate: COMPLETE**

# 次作業 — O-12f

Sleep CompassをFirestore/Cloud persistenceではなく **Processed Data-backed local API** から動かせるようにする。

O-12fではまだCloud operationを止めない。現行Cloud版を比較対象として維持する。

主対象:

- current Webが必要とするlocal API response shape
- Processed Data snapshot reader
- import/status/timeline/context等のlocal API parity
- Cloud-specific persistence依存の除去
- current Web behaviorを壊さないadapter boundary

# Final Firestore backup timing

実行は **O-12i**。

順序:

1. O-12h PASS
2. Cloud自動取り込みを可逆停止
3. manual sync / ingestを止めたmaintenance windowへ入る
4. in-flight writeなし確認
5. Firestore six category final backup
6. N100 + Google Drive integrity PASS
7. write freeze維持
8. local-only確認
9. O-12jで削除判断

この順序により、現行取り込みがbackup取得後に走ってやり直しになる問題を防ぐ。
