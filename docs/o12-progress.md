# O-12 作業進捗管理

状態: **O-12a COMPLETE / O-12b COMPLETE / O-12c COMPLETE / O-12d COMPLETE / O-12e COMPLETE（preservation手順確立・final backupはO-12iへ遅延） / O-12f COMPLETE（local API parity・runtime validation完了、tsx起動は環境例外） / O-12g COMPLETE（Local Web・Tailscale・実機表示確認済み） / O-12h ACTIVE（local validation PASS、Cloud comparison・recovery pending）**
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
最終更新日: **2026-09-01**

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
| O-12f | Sleep Compass独立化 | **COMPLETE — Processed Data-backed local API parity / runtime validation PASS_WITH_ENVIRONMENT_EXCEPTION** |
| O-12g | Local Web + Tailscale | **COMPLETE — localhost・same-origin・Tailscale Serve・iPhone表示確認済み** |
| O-12h | 並行検証・復旧試験 | **ACTIVE — local validation PASS / Cloud comparison・recovery pending** |
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

# O-12f — COMPLETE

Sleep CompassをFirestore/Cloud persistenceではなく **Processed Data-backed local API** から動かせるようにする。

O-12fではまだCloud operationを止めない。現行Cloud版を比較対象として維持する。

主対象:

- current Webが必要とするlocal API response shape
- Processed Data snapshot reader
- import/status/timeline/context等のlocal API parity
- Cloud-specific persistence依存の除去
- current Web behaviorを壊さないadapter boundary

## 7. 2026-09-01 implementation slice

実装済み:

- completed Processed Data snapshotのreader（complete marker / manifest / dataset hashを検証）
- canonical `sleep-records`から既存Web `SleepRecord` shapeへのlocal adapter
- Processed Data-backed `/api/health-records`、`/api/summaries`、`/api/source-audit`、`/api/unified-timeline`
- Processed Data-backed import status、sleep-health context、local drive-sync status
- Web local fetchからsnapshot由来context/statusを利用する接続
- snapshot未生成時の既存`server-data/health-store.json` fallback
- synthetic local runtime reader/parity test

確認済み:

- local runtime reader test: PASS
- local rescan publication → snapshot validation → API reader/context integration test: PASS
- watcher update detection → Processed Data publication integration test: PASS
- `npm test` under the controlled tsx startup workaround: PASS
- `npm run build`: PASS
- `npm run lint`: PASS
- `git diff --check`: PASS

環境例外:

- 標準の`npm test`起動では、tsx内部の`os.userInfo()`が`uv_os_get_passwd ENOMEM`となるため開始前に停止する
- Node起動時だけ固定ユーザー名を与える検証用shimを使った場合、テスト本体は全件PASS。shimはrepositoryへ残していない

**O-12f Exit Gate: COMPLETE（PASS_WITH_ENVIRONMENT_EXCEPTION）**

次はO-12g（Local Web + Tailscale）へ進む。

# O-12g — COMPLETE

実装済み:

- local API server bindを`127.0.0.1`へ固定
- Vite local Webを`127.0.0.1`へbindし、`/api`をlocal APIへproxy
- `VITE_HEALTH_IMPORT_SERVER_URL`未設定時はsame-origin `/api`を使用
- local modeではFirebase Authを初期化せず、Cloud modeだけAuth経路を有効化
- local Web `200` + Vite proxy経由`/api/health-records` `200` のHTTP smoke test PASS
- Vite previewにも同じ`/api` proxyを設定し、local Webの配信経路を統一
- Vite preview `200` + preview proxy経由`/api/health-records` `200` のHTTP smoke test PASS
- Tailscale Serve経由のVite Host拒否を特定し、`leto.taile04360.ts.net`をdev/preview `allowedHosts`へ追加
- 修正後のServe URL HTTPS smoke test: `200`
- 同ホスト名付きVite Web/API smoke test: Web `200` / `/api/health-records` `200`
- 実Health Auto Exportの読み取り専用初回処理: JSON 109件、失敗0件、Processed Data 生成済み
- local API: `dataSource=processed_data`、レコード1838件、HTTP `200`
- Tailscale Serve経由のWeb/API: HTTP `200`
- iPhone 14 Plusからの表示確認: **PASS**

最終確認:

- Tailscale Windows serviceはRunning / Automatic
- `tailscale serve --bg http://127.0.0.1:5173`: 設定済み
- Serve URL: `https://leto.taile04360.ts.net/`（tailnet only）
- iPhone 14 PlusはTailnet接続済み、Windowsからの`tailscale ping`も6msでPASS
- Serve詳細設定は`443/HTTPS → http://127.0.0.1:5173`で正常
- iPhone SafariのVite Host拒否を`allowedHosts`設定で解消
- localhost-only / Tailscale accessの最終Exit Gate: **PASS**

運用メモ:

- 実データのraw rootは`.env.local`で指定し、repositoryへ保存しない
- Processed Dataの生成物はrepository管理対象外とし、APIは完成済みsnapshotだけを参照する
- O-12gではCloud/Firebase/Drive/Tailscaleの既存データ・設定を変更していない

**O-12g Exit Gate: COMPLETE**

# O-12h — ACTIVE

実施済み:

- Processed Data-backed local runtime test: PASS
- local rescan publication / snapshot validation / API reader integration: PASS
- watcher update detection / Processed Data publication: PASS
- Processor、snapshot、migration、既存Web回帰を含む`npm test`: PASS（既知のtsx起動環境例外には検証用shimを使用）
- 実Health Auto Export 109 JSONからの初回Processed Data生成: 失敗0件
- clean-roomでの実raw再構築: 入力109件、失敗0件、可視レコード1838件
- clean-room snapshotと稼働中snapshotのsleep-records SHA-256一致: **PASS**
- Cloud API公開health endpoint: HTTP `200`

未実施:

- Cloud/localの実データ比較と意図的差分レビュー
- Cloud稼働中の新規データ反映・重複排除の実運用比較
- サーバー再起動後のsnapshot復旧確認
- Cloudの保護されたview endpointは認証なしでHTTP `401`。Firebase認証済みのread-only比較セッションが必要

O-12hではCloud operationを停止せず、上記比較・復旧を完了してからO-12iのwrite freezeへ進む。

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
