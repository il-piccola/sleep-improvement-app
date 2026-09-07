# O-12 作業進捗管理

状態: **O-12a COMPLETE / O-12b COMPLETE / O-12c COMPLETE / O-12d COMPLETE / O-12e COMPLETE（preservation手順確立） / O-12f COMPLETE（local API parity・runtime validation完了、tsx起動は環境例外） / O-12g COMPLETE（Local Web・Tailscale・実機表示確認済み） / O-12h COMPLETE（local validation・recovery・Cloud/local同一期間parity PASS） / O-12i COMPLETE（write freeze・Firestore final preservation・local-only確認 PASS） / O-12j BLOCKED（共有資源への影響確認・復旧対応待ち）**
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
最終更新日: **2026-09-07**

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
| O-12e | 既存データ保全準備 | **COMPLETE — procedure ready** |
| O-12f | Sleep Compass独立化 | **COMPLETE — Processed Data-backed local API parity / runtime validation PASS_WITH_ENVIRONMENT_EXCEPTION** |
| O-12g | Local Web + Tailscale | **COMPLETE — localhost・same-origin・Tailscale Serve・iPhone表示確認済み** |
| O-12h | 並行検証・復旧試験 | **COMPLETE — local validation・recovery・Cloud/local同一期間parity PASS** |
| O-12i | Cloud運用停止 + final preservation | **COMPLETE — write freeze・Firestore/local archive・local-only PASS** |
| O-12j | Cloud完全撤去 | **BLOCKED — Sleep対象削除後に共有資源への影響が判明、復旧確認待ち** |

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

# O-12h — COMPLETE

実施済み:

- Processed Data-backed local runtime test: PASS
- local rescan publication / snapshot validation / API reader integration: PASS
- watcher update detection / Processed Data publication: PASS
- Processor、snapshot、migration、既存Web回帰を含む`npm test`: PASS（既知のtsx起動環境例外には検証用shimを使用）
- 実Health Auto Export 109 JSONからの初回Processed Data生成: 失敗0件
- clean-roomでの実raw再構築: 入力109件、失敗0件、可視レコード1838件
- clean-room snapshotと稼働中snapshotのsleep-records SHA-256一致: **PASS**
- Cloud API公開health endpoint: HTTP `200`
- Cloud版データ診断のread-only比較（再スキャン後）: Cloudは日付範囲2026-08-04–2026-08-22、統合前後睡眠ブロック65件、採用レコード371件、重複除外0件、判断保留0件
- 同一表示期間のLocalは睡眠ブロック66件 / 採用レコード375件。Cloudとの差分はLocal +1ブロック / +4レコードで、Cloud側の最新Driveファイルは2026-08-17、Local側の稼働中Processed Dataは2026-09-04までを含む。再スキャン後も同一cutoffのrecord-level parityは未確定
- Cloud再スキャン後の診断表示: 最終同期09/05 11:35、確認が必要なファイル0件、処理済みDriveファイル102件、最新睡眠日2026-08-22
- 追加承認後のCloud再取り込み: 新規処理0件 / 処理済み0件。最終同期表示は09/05 11:50へ更新されたが、処理済みファイル102件、Cloud 65ブロック / 371レコード、日付範囲2026-08-04–2026-08-22に変化なし
- Google Driveのread-only folder metadata確認（旧状態）: `Health Auto Export/Sleep` はJSON 115件、最新更新2026-09-05T02:37:44Z。`HealthAutoExport-2026-08-27.json` の同名ファイルが2件ある。Cloud診断の102件・最新2026-08-17との不一致は、後続のフォルダ共有・再同期・同一期間比較で解消
- Cloud実装のread-only確認: Drive一覧は全ページを取得し、正の `DRIVE_SYNC_MAX_FILES` が設定された場合だけ先頭件数に制限する設計。デプロイ時環境変数はrepositoryに保存されていないため、実Drive 115件とCloud処理済み102件の不一致は、Cloud Run側のfolder ID / 認証主体 / `DRIVE_SYNC_MAX_FILES` / Firestore処理済み台帳のいずれかをCloud metadataで確認する必要がある
- Cloud Run環境変数のread-only確認（Console確認結果）: `HEALTH_EXPORT_DRIVE_FOLDER_ID` は実際にJSONが置かれている `Health Auto Export/Sleep` サブフォルダとは異なるIDを設定。`DRIVE_SYNC_MAX_FILES=10` も設定されている。実Drive 115件に対しCloud 102件・最新2026-08-17となる差分の主因を、参照フォルダ不一致 + 同期上限として特定。Cloud実装は指定フォルダ直下だけを一覧するため、親の `Health Auto Export` ではなく `Sleep` サブフォルダを指定する必要がある
- Cloud Run環境変数を承認済み変更: `sleep-improvement-api` と `sleep-improvement-drive-sync-api` の両方を `Health Auto Export/Sleep` サブフォルダ + `DRIVE_SYNC_MAX_FILES=200` へ更新し、各サービスの新リビジョンへ100%トラフィックを切替
- 設定変更直後のCloudアプリ再同期（旧状態）: 新規処理0件 / 処理済み0件。後続のサービスアカウント共有後同期で、処理済みDriveファイル112件から117件へ更新され、同一期間の詳細診断比較へ進行
- 追加read-only確認: Webアプリは `https://sleep-improvement-api-xzf4y6uwjq-an.a.run.app` へ接続し、`/api/drive-sync` は200応答でCloud Runへ到達。Cloud Run実行主体は `sleep-drive-ingest@sleep-improvement-cloud.iam.gserviceaccount.com`。当初は実Driveの `Health Auto Export/Sleep` フォルダ権限が所有者 `il.piccola.fleuriste@gmail.com` のみで、サービスアカウント共有がなく列挙権限未付与だった
- ユーザー承認のもと、認証済みGoogle Drive UIから `Health Auto Export/Sleep` フォルダを `sleep-drive-ingest@sleep-improvement-cloud.iam.gserviceaccount.com` に閲覧者として共有（通知なし）。共有ダイアログのアクセス一覧でサービスアカウントと「閲覧者」を確認
- サービスアカウント共有後のCloudアプリ手動取り込み: 同期完了。後続の詳細診断は最終同期09/07 12:55、確認が必要なファイル0件、処理済みDriveファイル117件、最新データ日2026-09-06を表示。通常表示の96件は当日表示用の集計であり、同一期間比較は詳細診断の113ブロック・635採用レコードを使用
- Cloud/local同一期間の詳細診断比較: Cloudの統合後ブロック113件・採用レコード635件・総睡眠239時間39分・重複除外0件・判断保留0件に対し、Localも同一期間（2026-08-06–2026-09-06）でブロック113件・統合採用レコード635件・総睡眠14379分（239時間39分）・重複除外0件・判断保留0件。record-level parity: **PASS**
- Localの同期間入力レコード645件と採用レコード635件の差10件は、統合タイムラインで採用対象外となったレコードであり、Cloudの採用レコード635件と一致することを確認。意図的差分レビュー: **PASS**
- Processed Data-onlyサーバー再起動復旧: 同一snapshot ID・可視レコード1838件・API HTTP `200`を確認
- その後のlocal watcher再公開もread-onlyで確認: 稼働中snapshotは20260905T024310Z-46c28073、入力115ファイル、全体1971レコード / 367ブロック、最新データ日2026-09-04。Cloud比較対象期間の件数は66ブロック / 375レコードで不変
- Cloud診断の旧表示（処理済みDriveファイル102件・最新Driveファイル2026-08-17）は、フォルダ権限付与前の状態。権限付与後にCloud側の最新状態を再取得し、同一期間の詳細診断でLocalと一致することを確認

参考制約:

- Cloudの保護されたview endpointの直接呼出しは認証なしでHTTP `401`。認証済みCloud UIのread-only診断で必要な比較を実施
- Firebase認証済みCloud UIでの比較を実施

**O-12h Exit Gate: COMPLETE**。Cloud operationは停止せず、parity・新規データ反映・重複排除・restart・clean-room recoveryを確認済み。次はO-12iのwrite freezeへ進む。

# O-12i — COMPLETE

O-12h完了後、Cloud自動取り込みを可逆停止した上で、Firestoreの最終保全とlocal-only運用確認を実施した。

実施結果:

- Cloud Scheduler `sleep-drive-sync-daily`: **Paused**。manual sync / ingestは実行せず、write freezeを維持
- Firestore edition / mode / location: Standard / Firestore Native / `asia-northeast1`
- read-only collector: **PASS**。Firestore writes / updates / deletes: **0**
- private Firestore archive counts: `sleep_records` 3028、`health_metric_records` 1383、`processed_drive_files` 119、`drive_sync_runs` 131、`ingest_batches` 354、`metric_audit_summaries` 81
- Firestore archive ZIP: N100 `migration-input`へ保存、6 categoryのJSONL存在・非空行数・byteLength・SHA-256を検証して **integrity=PASS**
- Firestore archive ZIP SHA-256: `f5395a5f6969cf5fa8ac695fc3fe4359be15a3dd5c46eeab6221f4b7dbc0437c`
- Google Drive `Health Auto Export/Processed Data Backup/firestore-archives`へ原本ZIPを追加保存。Drive metadataのサイズ一致と再取得SHA-256一致を確認
- local legacy state: `health-store.json` / `processed-files.json` を本文表示せずprivate ZIP化し、同じDrive保全先へ保存。ZIP SHA-256一致を確認
- local-only verification: `dataSource=processed_data`、snapshot取得成功、lastErrorなし、local drive sync status正常。Cloud syncの再実行・Firestore本文readは行っていない
- N100側の作業成果物は `.gitignore` 対象の `migration-input` に限定して保持し、tracked worktreeはclean

**O-12i Exit Gate: COMPLETE**。Cloud write freeze、Firestore final preservation、N100/Drive integrity、local-only確認をすべてPASS。Firestore削除、Billing変更、project shutdownは実施していない。

# O-12j — ACTIVE

削除前の最終read-only監査を実施した。O-12iの保全状態とCloud write freezeは維持している。

監査結果:

- Cloud Run: `sleep-improvement-api`、`sleep-improvement-drive-sync-api`、`maya-daily-observation-console`の3サービス。前2者のみSleep Compass対象。`maya-daily-observation-console`は対象外候補のため削除・停止禁止
- Firestore: `(default)` 1件、Standard / Firestore Native / `asia-northeast1`。O-12i最終保全済み
- Cloud Scheduler: `sleep-drive-sync-daily` 1件、Paused
- Artifact Registry: `cloud-run-source-deploy` 1件（`asia-northeast1`、約1.1 GB）
- Cloud Storage: `run-sources-sleep-improvement-cloud-asia-northeast1` 1バケット。用途・保持要否を削除直前に再確認する
- Firebase Hosting: `sleep-improvement-cloud`サイトが稼働中。`web.app` / `firebaseapp.com`の既定ドメインあり
- Billing: Blaze（従量制）。Cloud Console表示の当期見込み課金額は0円
- プロジェクト停止判定: `maya-daily-observation-console`が残るため、専用プロジェクトとは未確定。プロジェクトshutdownは保留

実施結果とブロッカー:

- ユーザー承認後、Sleep対象のCloud Run 2サービス、Scheduler、Firestore `(default)`、Firebase Hostingサイトを削除した
- Artifact Registry `cloud-run-source-deploy`も削除したが、同一リポジトリを`maya-daily-observation-console`が参照していたことが判明した
- Cloud Storage `run-sources-sleep-improvement-cloud-asia-northeast1`も削除したが、同一バケットにSleep対象外の`maya-daily-observation-console`成果物が含まれていた
- `maya-daily-observation-console`サービス自体は削除・停止していないが、参照イメージとビルド成果物が共有資源削除の影響を受けた可能性がある
- Storage soft-deleted bucketのread-only照会では復元候補を取得できず、Artifact Registryも通常の復元機能はなく、Google Cloud Supportによるbest-effort復旧確認が必要
- Billingの紐付け解除、`maya-daily-observation-console`の変更、プロジェクトshutdownは保留
- ローカルのProcessed Data・Firestore/legacy保全アーカイブ・Git履歴は保持している

# Final Firestore backup timing

実行済み。最終保全は **O-12i** で完了し、削除判断は **O-12j** に分離する。

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
