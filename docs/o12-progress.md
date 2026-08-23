# O-12 作業進捗管理

状態: **O-12a BLOCKED（残り: GCP監査のみ） / O-12b PREPARATION（静的設計ほぼ完了）**  
基準文書: [`o12-local-first-cloud-exit-plan.md`](./o12-local-first-cloud-exit-plan.md)  
O-12b契約: [`o12-processed-data-contract.md`](./o12-processed-data-contract.md)  
O-12b JSON Schema: [`o12-processed-data-schema.json`](./o12-processed-data-schema.json)  
GCP監査: [`o12-gcp-readonly-audit.md`](./o12-gcp-readonly-audit.md)  
Drive mount確認: [`o12-drive-mount-manual-check.md`](./o12-drive-mount-manual-check.md)  
主フェーズ: **O-12a — 現状監査**  
並行準備: **O-12b — Processed Data Contract**  
次の担当: **GCP `GCP-O12A-001` / 結果レビューはChatGPT**  
最終更新日: **2026-08-23**

この文書はO-12の実作業を管理する中心文書です。進捗、ChatGPT/Codexの分担、証拠、判断、ブロッカーを日本語で管理します。基準文書と矛盾する場合は基準文書を優先します。

## 1. 運用原則

- O-12は **ChatGPT優先・Codex最小化** で進める。
- ChatGPTがGitHub/code/docs/connected Drive/公開仕様/設計/review/gate判定を担当する。
- CodexはN100 local filesystem/runtime/CLI/build/testなど、ChatGPTから直接実行できない作業だけ担当する。
- 一度PASSした項目を理由なく再確認しない。
- 前フェーズ待ちでもChatGPTは1フェーズ先の非破壊・非確定作業をPREPARATIONとして進められる。
- Exit Gateは `O-12a → b → c → d → e → f → g → h → i → j` の順番を崩さない。
- 停止、削除、無効化、移行、上書き、Billing変更、Project shutdownは該当gateとユーザー明示承認後のみ実行する。
- raw health data、secret、token、OAuth credential、不要なaccount/tailnet識別情報をrepositoryへ記録しない。

## 2. Phase一覧

| Phase | 内容 | 状態 |
| --- | --- | --- |
| O-12a | 現状監査 | **BLOCKED — GCP監査のみ残り** |
| O-12b | Processed Data Contract | **PREPARATION — 静的設計ほぼ完了** |
| O-12c | Processor独立化 | **NOT STARTED** |
| O-12d | Processor堅牢化 | **NOT STARTED** |
| O-12e | 既存データ移行 | **NOT STARTED** |
| O-12f | Sleep Compass独立化 | **NOT STARTED** |
| O-12g | Local Web + Tailscale | **NOT STARTED** |
| O-12h | 並行検証・復旧試験 | **NOT STARTED** |
| O-12i | Cloud運用停止 | **NOT STARTED** |
| O-12j | Cloud完全撤去 | **NOT STARTED** |

# O-12a — 現状監査

## 3. ChatGPT監査済み

### GitHub / local architecture

- [x] `master` code/docs/dependency/Cloud/Firebase参照を監査
- [x] `server/server.ts` local HTTP API + watcherを確認
- [x] serverが `0.0.0.0` bind、起動時watcher開始であることを確認
- [x] `server/importHealthExports.ts` が `mergeAndAnalyzeSleepRecords` を直接呼び、Processor未独立であることを確認
- [x] `server/config.ts` に旧Windows drive-letter既定pathが残ることを確認
- [x] `health-store.json` / `processed-files.json` の直接上書き、read失敗時empty state問題を確認
- [x] processed ledger 500件上限とfull-file SHA-256 fingerprintを確認

### Connected Google Drive

- [x] `Health Auto Export` folder存在確認
- [x] 配下の `Sleep` folder存在確認
- [x] 2026-08-23までの日付付きHealth Auto Export JSON存在確認
- [x] raw source供給経路が継続していることを確認
- [x] connected検索では `normalized-sleep-records.json`, `export.xml`, `Sleep Compass` folderを確認できなかったことを記録

### Cloud / Firebase code/docs

- [x] Firebase既定project `sleep-improvement-cloud`
- [x] repository/docs上の既知Cloud Run: `sleep-improvement-api`, `sleep-improvement-drive-sync-api`
- [x] repository/docs上の既知Scheduler: `sleep-drive-sync-daily`
- [x] Firestore監査対象category: `sleep_records`, `processed_drive_files`, `drive_sync_runs`, `health_metric_records`, `ingest_batches`, `metric_audit_summaries`
- [x] health metrics / sleep-window metrics / metric auditがProcessor回収対象であることを確認
- [x] WebがFirebase Auth / ID Token + Cloud APIへ依存することを確認

## 4. Codex / N100結果レビュー

### `CX-O12A-001`

判定: **PARTIAL PASS / BLOCKED**

確定済み、再確認しない:

- Git: `master`, clean, `origin/master`同期
- Node.js `v22.23.1`
- npm `10.9.8`
- O-12b JSON Schema JSON構文PASS
- Cloud / Firestore / Drive / Tailscale設定変更なし

### `CX-O12A-002`

判定: **PARTIAL PASS**

PASS:

- [x] `server-data: ABSENT`。current-state inventoryとして受理し、作成しない。
- [x] Tailscale Windows service存在
- [x] Tailscale service `Running`
- [x] StartType `Automatic`
- [x] Serve configured状態はO-12gでlocalhost-only構成を検証するためO-12a必須証拠から外す

### `CX-O12A-003`

判定: **PARTIAL PASS / BLOCKED**

PASS:

- [x] GoogleDriveFS processが稼働中
- [x] Drive設定/registry/file/GoogleDriveFS process変更なし

Codex execution contextではlogical drive列挙がアクセス拒否となり、mount candidateを取得できなかった。この結果を「Drive mount不存在」とは解釈せず、追加Codexは行わない。

### `OBS-O12A-DRIVE-001`

判定: **PASS**

2026-08-23、ユーザーがN100上で目視確認:

- [x] `L:` driveが見える
- [x] `L:\マイドライブ\Health Auto Export` が見える
- [x] その配下に `Sleep` directoryが見える

重要:

- `L:` は現在環境の観測値であり、実装へhardcodeしない。
- raw rootの現観測pathは `L:\マイドライブ\Health Auto Export`。
- Processorは設定されたraw rootを利用し、persistent identityへabsolute path / drive letterを含めない。
- `CX-O12A-002/003`で見つからなかったことは、Codexのlogical-driveアクセス制約と、raw sourceが `L:` 直下ではなく `L:\マイドライブ\...` にあることと整合する。

## 5. 残監査 — `GCP-O12A-001`

手順: [`o12-gcp-readonly-audit.md`](./o12-gcp-readonly-audit.md)

状態: **READY / 未実行**

Cloud Shellでread-only確認する:

- project lifecycle
- `billingEnabled`
- Cloud Run
- Cloud Scheduler
- Artifact Registry
- Firestore database metadata
- Secret Manager names
- Cloud Storage bucket names
- service-account count
- Cloud Build triggers
- relevant enabled APIs
- Cloud Asset Inventory assetType count（既にAPI有効な場合のみ）
- Firebase Hosting site IDs（Hosting APIが既に有効な場合のみ）

安全境界:

- API enable/disableなし
- Billing変更なし
- resource変更/停止/削除なし
- Firestore document本文read/query/exportなし
- Secret payload readなし

## 6. O-12a Exit Gate

残り:

- [ ] `GCP-O12A-001`

すでに満たしたもの:

- [x] Git/repository architecture
- [x] connected Drive raw source existence
- [x] N100 OS-visible Drive boundary
- [x] local runtime Node/npm
- [x] `server-data` current state
- [x] Tailscale Windows service current state
- [x] GoogleDriveFS process running
- [x] Cloud/Firestore category map from code/docs

GCP監査結果で重要な未説明resource categoryがないことを確認できれば、ChatGPTがO-12a Exit Gateを判定する。Firestore document本文やhistorical migration実行はO-12eで扱う。

# O-12b — Processed Data Contract

## 7. 状態

**PREPARATION。静的設計ほぼ完了。O-12a完了後にfinal reviewしてExit Gate判定。**

ChatGPT完了:

- [x] canonical dataset / format
- [x] `schemaVersion` / `processorVersion` / `generatedAt` / provenance
- [x] processing config / sleep-day provenance
- [x] legacy reader compatibility policy
- [x] snapshot publication / completion marker / retention
- [x] migration manifest
- [x] raw/local/Cloud schema対応
- [x] contract test case
- [x] machine-readable JSON Schema
- [x] JSON Schema JSON構文PASS
- [x] source integration / overlap / block classification static cross-check
- [x] O-12a local observation `server-data: ABSENT` をmigration前提へ反映
- [x] N100 raw root観測値をportable-path方針へ反映

O-12a結果からの現在の扱い:

- `health-store.json` / `processed-files.json` は現時点でrepo直下`server-data`に存在しない。
- 後で別pathから発見された場合のみlegacy-local sourceとしてRebuild/Migrate/Archive分類へ追加する。
- connected Drive raw sourceとCloud側データ分類は主要migration source候補とする。
- N100でraw rootは現在 `L:\マイドライブ\Health Auto Export` と観測されたが、drive letter/pathは環境境界でありcontract identityには含めない。

残り:

- [ ] GCP実在resource/Firestore database metadataをmigration対象表へ反映
- [ ] final review
- [ ] Exit Gate判定

成果物:

- `docs/o12-processed-data-contract.md`
- `docs/o12-processed-data-schema.json`

## 8. O-12b主要設計

- completed/versioned immutable snapshot
- canonical JSON/JSONL
- `manifest.json` にschema/processor/config/count/hash
- `complete.json` を最終publication marker
- raw watch rootとprocessed backupを分離
- host absolute path/drive letterをpersistent IDへ含めない
- fragmentation/circadian/actionはSleep Compass側へ残す
- source integration policyをUI preferenceから独立させる
- overlap policy 80%/30%をprovenance/policy versionで追跡
- canonical block IDをdeterministicにする
- main sleepはsleep day単位で整合させる

# O-12c〜O-12j

## 9. O-12c — Processor独立化

状態: **NOT STARTED**

O-12b Exit Gate通過後に開始する。

ChatGPT:

- importer / `healthStore` / API / React / Cloud coupling確定
- Processor Core boundary/interface
- Cloud objective metrics/sleep-window処理回収範囲
- file単位実装指示
- Codex diff/test review

Codex:

- reviewed bounded refactor
- direct one-shot processor
- watcherをsame core wrapperへ変更
- targeted test/build

Exit Gate: ProcessorがSleep Compass Web/API、Firebase、Cloud Run、Firestore、Tailscale、Google Drive APIなしで動く。

## 10. O-12d〜O-12j 安全順序

- O-12d: Processor堅牢化、portable path、atomic snapshot、fingerprint、watcher/rescan、Drive backup
- O-12e: Rebuild/Migrate/Archive、clean-room reconstruction。**完了前にCloud dataを削除しない**
- O-12f: Sleep CompassをProcessed Data-backed local APIへ移行
- O-12g: same-origin、`127.0.0.1`、Tailscale Serve、Funnel不使用
- O-12h: Cloud/local parity、restart/recovery。**完了前にCloud operationを停止しない**
- O-12i: 最小・可逆のCloud automatic processing停止
- O-12j: final audit、Billing disable、dedicated project shutdown（安全確認・明示承認後のみ）

# 進捗・証拠管理

## 11. ChatGPT進捗ログ

| ID | Phase | 状態 | 作業 | 結果 |
| --- | --- | --- | --- | --- |
| `GPT-O12A-001` | O-12a | COMPLETE | GitHub/Cloud/Firebase/local architecture監査 | dependencyとmigration seam特定 |
| `GPT-O12A-002` | O-12a | COMPLETE | connected Drive監査 | raw `Health Auto Export/Sleep`確認 |
| `GPT-O12A-003` | O-12a | COMPLETE | Web Cloud API/Auth依存監査 | O-12f minimum parity特定 |
| `GPT-O12A-004` | O-12a | COMPLETE | Firestore category整理 | O-12e分類対象特定 |
| `GPT-O12A-005` | O-12a | COMPLETE | `CX-O12A-001`設計/review | Git/runtime/schema確定 |
| `GPT-O12A-006` | O-12a | COMPLETE | 残監査をGCP/N100へ分離 | 重複Codex作業削減 |
| `GPT-O12A-007` | O-12a | COMPLETE | Cloud Shell GCP監査手順作成 | `GCP-O12A-001` READY |
| `GPT-O12A-008` | O-12a | COMPLETE | `CX-O12A-002` review | Tailscale + server-data確定 |
| `GPT-O12A-009` | O-12a | COMPLETE | Drive streaming location仕様再確認 | drive letter/folder双方を考慮 |
| `GPT-O12A-010` | O-12a | COMPLETE | `CX-O12A-003` review | DriveFS running確定、Codex権限制約特定 |
| `GPT-O12A-011` | O-12a | COMPLETE | Drive mount確認経路を目視read-onlyへ変更 | 追加Codex不要化 |
| `GPT-O12A-012` | O-12a | COMPLETE | N100 Drive目視結果review | `L:\マイドライブ\Health Auto Export\Sleep` を確認、Drive boundary PASS |
| `GPT-O12B-PREP-001` | O-12b | COMPLETE | existing contract/schema比較 | 継承/分離方針確定 |
| `GPT-O12B-PREP-002` | O-12b | COMPLETE | Processed Data Contract作成 | contract draft作成 |
| `GPT-O12B-PREP-003` | O-12b | COMPLETE | snapshot/version/provenance/migration/test設計 | 静的主要設計完了 |
| `GPT-O12B-PREP-004` | O-12b | COMPLETE | JSON Schema作成 | machine-readable schema |
| `GPT-O12B-PREP-005` | O-12b | COMPLETE | integration/overlap/block static review | O-12c refactor論点特定 |
| `GPT-O12B-PREP-006` | O-12b | COMPLETE | Codex schema syntax result review | JSON syntax PASS |
| `GPT-O12B-PREP-007` | O-12b | COMPLETE | `server-data: ABSENT` をmigration前提へ反映 | legacy-local sourceを条件付き扱いに変更 |
| `GPT-O12B-PREP-008` | O-12b | COMPLETE | N100 raw root観測をportable-path方針へ反映 | `L:` hardcode禁止、configured root利用 |

## 12. 外部実行キュー

| ID | Phase | 状態 | 内容 | ChatGPT review |
| --- | --- | --- | --- | --- |
| `CX-O12A-001` | O-12a | PARTIAL PASS | Git/runtime/schema + 広域監査試行 | 確定項目を再確認対象から除外 |
| `CX-O12A-002` | O-12a | PARTIAL PASS | N100 filesystem + Tailscale | Tailscale/server-data PASS |
| `CX-O12A-003` | O-12a | PARTIAL PASS / BLOCKED | DriveFS mount再監査 | DriveFS running PASS、mount列挙は権限制約。再実行しない |
| `OBS-O12A-DRIVE-001` | O-12a | **PASS** | N100上のDrive目視 | `L:\マイドライブ\Health Auto Export\Sleep` 確認済み |
| `GCP-O12A-001` | O-12a | READY | Cloud Shell read-only control-plane/Billing監査 | 未実行 |

## 13. 証拠台帳

| Evidence ID | Phase | Source | 内容 |
| --- | --- | --- | --- |
| `EV-BASELINE-001` | 全体 | GitHub | O-12基準文書 |
| `EV-PROGRESS-001` | 全体 | GitHub | 本進捗文書 |
| `EV-O12A-GH-001` | O-12a | GitHub | code/local/Cloud dependency audit |
| `EV-O12A-DRIVE-001` | O-12a | connected Drive | raw source経路と最新JSON |
| `EV-O12A-CX-001` | O-12a | Codex | Git/runtime/schema + blocker |
| `EV-O12A-CX-002` | O-12a | Codex | Tailscale Running/Automatic + server-data ABSENT |
| `EV-O12A-CX-003` | O-12a | Codex | DriveFS running + mount列挙権限制約 |
| `EV-O12A-DRIVE-OBS-001` | O-12a | N100 user observation | `L:\マイドライブ\Health Auto Export\Sleep` OS-visible確認 |
| `EV-O12A-GCP-001` | O-12a | Cloud Shell | 実行後にcontrol-plane/Billingを記録 |
| `EV-O12B-CONTRACT-001` | O-12b | GitHub | Processed Data Contract |
| `EV-O12B-SCHEMA-001` | O-12b | GitHub/Codex | JSON Schema + JSON syntax PASS |

## 14. 現在の次の作業

### Codex

**追加Codexなし。** O-12aのlocal/N100確認は完了。

### GCP

Cloud Shellで `docs/o12-gcp-readonly-audit.md` の `GCP-O12A-001` をread-only実行する。

### ChatGPT

GCP結果をreviewし:

1. O-12a Exit Gate判定
2. O-12a COMPLETEならO-12bへ最終結果反映
3. Processed Data Contract final review
4. 静的に十分なら追加CodexなしでO-12b Exit Gate判定
5. O-12b COMPLETE後にのみO-12cを開始
