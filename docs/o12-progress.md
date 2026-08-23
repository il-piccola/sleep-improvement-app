# O-12 作業進捗管理

状態: **O-12a BLOCKED（残り: GCP + Drive mount） / O-12b PREPARATION（静的設計ほぼ完了）**  
基準文書: [`o12-local-first-cloud-exit-plan.md`](./o12-local-first-cloud-exit-plan.md)  
O-12b契約ドラフト: [`o12-processed-data-contract.md`](./o12-processed-data-contract.md)  
O-12b JSON Schema: [`o12-processed-data-schema.json`](./o12-processed-data-schema.json)  
GCP監査: [`o12-gcp-readonly-audit.md`](./o12-gcp-readonly-audit.md)  
N100一次監査: [`o12-n100-readonly-audit.md`](./o12-n100-readonly-audit.md)  
Drive mount再監査: [`o12-drive-mount-readonly-audit.md`](./o12-drive-mount-readonly-audit.md)  
主フェーズ: **O-12a — 現状監査**  
並行準備: **O-12b — Processed Data Contract**  
次の担当: **GCP Cloud Shell `GCP-O12A-001` / Codex `CX-O12A-003` / ChatGPTレビュー**  
最終更新日: **2026-08-23**

この文書はO-12の実作業を管理する中心文書です。各フェーズの状態、ChatGPT/Codexの分担、証拠、判断、ブロッカー、引き継ぎを日本語で管理します。

基準文書と矛盾した場合は基準文書を優先します。

## 1. 運用原則

O-12は **ChatGPT優先・Codex最小化** で進めます。

- ChatGPTがGitHub/code/docs/connected Drive/公開仕様/設計/review/gate判定を担当する。
- CodexはN100 local filesystem/runtime/CLI/build/testなど、ChatGPTから直接実行できない作業だけ担当する。
- 一度PASSした項目を理由なくCodexへ再確認させない。
- 前フェーズ待ちでも、ChatGPTは1フェーズ先の非破壊・非確定作業をPREPARATIONとして進められる。
- Exit Gateは `O-12a → b → c → d → e → f → g → h → i → j` の順番を崩さない。
- 停止、削除、無効化、移行、上書き、Billing変更、Project shutdownは該当gateとユーザー明示承認後のみ実行する。
- raw health data、secret、token、OAuth credential、不要なaccount/tailnet識別情報をrepositoryへ記録しない。

## 2. ステータス

- **NOT STARTED** — 未着手
- **PREPARATION** — 前フェーズ待ちの安全な先行準備
- **CHATGPT WORKING** — ChatGPT作業中
- **CODEX NEEDED** — local実行だけが残る
- **CODEX RUNNING** — Codex実行中
- **REVIEW** — 結果レビュー中
- **BLOCKED** — Exit Gateに必要な証拠が未取得
- **COMPLETE** — Exit Gate通過、証拠記録済み

## 3. Phase一覧

| Phase | 内容 | 状態 |
| --- | --- | --- |
| O-12a | 現状監査 | **BLOCKED — GCP + Drive mountのみ残り** |
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

## 4. ChatGPT監査済み

### GitHub / local architecture

- [x] `master` code/docs/dependency/Cloud/Firebase参照を監査
- [x] `server/server.ts` local HTTP API + watcherを確認
- [x] 現行serverが `0.0.0.0` bind、起動時watcher開始であることを確認
- [x] `server/importHealthExports.ts` が `mergeAndAnalyzeSleepRecords` を直接呼びProcessor未独立であることを確認
- [x] `server/config.ts` に旧Windows drive-letter既定pathが残ることを確認
- [x] `health-store.json` / `processed-files.json` の直接上書き・read失敗時empty state問題を確認
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

## 5. `CX-O12A-001` 結果

判定: **PARTIAL PASS / BLOCKED**

確定済み、再確認しない:

- Git: `master`, clean, `origin/master`同期
- Node.js `v22.23.1`
- npm `10.9.8`
- O-12b JSON Schema JSON構文PASS
- Cloud / Firestore / Drive / Tailscale設定変更なし

未取得だったため後続へ分離:

- GCP current control-plane / Billing
- N100 Google Drive mount path
- `server-data` state
- Tailscale runtime state

## 6. `CX-O12A-002` 結果レビュー

Codex結果:

- `Health Auto Export path`: `NOT FOUND`
- `server-data`: `ABSENT`
- Tailscale service: `Tailscale / Running / Automatic`
- health data本文/file名一覧/CLI/Git/GCP/設定変更: なし

ChatGPT判定:

### PASSとして確定

- [x] `server-data: ABSENT` はcurrent-state inventoryとして有効。作成しない。
- [x] Tailscale Windows serviceが存在する。
- [x] Tailscale serviceは `Running`。
- [x] StartTypeは `Automatic`。
- [x] O-12aではServe URL/configured状態は必須にしない。O-12gでlocalhost-only Serveを新規検証する。

### Drive mountだけ再確認

`Health Auto Export: NOT FOUND` はN100上のraw data不存在を意味しない。

理由:

- connected Google Driveでは `Health Auto Export/Sleep` raw sourceを確認済み。
- 前回 `CX-O12A-002` はC:を検索対象から除外した。
- Google Drive for desktopの現行Windows仕様ではstreaming locationはdrive letterだけでなくfolder pathにも設定可能。
- DriveFSがCodex execution contextで非稼働/非表示の場合にもvirtual mountを取得できない可能性がある。

したがって `CX-O12A-002` は **PARTIAL PASS** とし、Drive mountだけを `CX-O12A-003` へ分離する。

## 7. 残監査A — `GCP-O12A-001`

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

料金・安全境界:

- Cloud Shell自体はGoogle Cloudアカウント利用者は無料。
- API enable/disableなし。
- Billing変更なし。
- resource変更/停止/削除なし。
- Firestore document本文read/query/exportなし。
- Secret payload readなし。

## 8. 残監査B — `CX-O12A-003`

手順: [`o12-drive-mount-readonly-audit.md`](./o12-drive-mount-readonly-audit.md)

状態: **READY**

確認するのはDrive mountだけ:

- GoogleDriveFS process running true/false
- DriveFS registryの `DefaultMountPoint` / `mount_point_path` だけ抽出
- Windows logical drive補助確認
- mount候補配下の `Health Auto Export` path存在

再確認しない:

- Git
- Node/npm
- JSON Schema
- `server-data`
- Tailscale
- GCP

Drive設定/registry/fileは変更しない。

## 9. O-12a Exit Gate

次が揃った時点でChatGPTが判定する。

- [ ] `GCP-O12A-001`
- [ ] `CX-O12A-003`

すでに満たしたもの:

- [x] Git/repository architecture
- [x] connected Drive raw source existence
- [x] local runtime Node/npm
- [x] `server-data` current state
- [x] Tailscale Windows service current state
- [x] Cloud/Firestore category map from code/docs

Firestore document本文やhistorical migration実行はO-12eで扱う。

# O-12b — Processed Data Contract

## 10. 状態

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

残り:

- [ ] O-12a結果をlegacy/migration対象へ反映
- [ ] final review
- [ ] Exit Gate判定

成果物:

- `docs/o12-processed-data-contract.md`
- `docs/o12-processed-data-schema.json`

主な確定候補:

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

## 11. O-12c — Processor独立化

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

## 12. O-12d — Processor堅牢化

状態: **NOT STARTED**

- atomic/versioned snapshot + corruption recovery
- configurable portable paths
- drive-letter/absolute-path persistent identity除去
- efficient fingerprint
- watcher/rescan
- raw/processed separation
- Drive completed snapshot backup

## 13. O-12e — 既存データ移行

状態: **NOT STARTED**

- Rebuild / Migrate / Archive
- migration adapter / manifest
- Firestore-only保存対象
- count/reject/checksum/reconstruction evidence
- clean-room reconstruction

**O-12e完了前にCloud dataを削除しない。**

## 14. O-12f — Sleep Compass独立化

状態: **NOT STARTED**

- Firestore/Cloud endpoint依存除去
- Processed Data-backed local API
- current Web minimum parity

## 15. O-12g — Local Web + Tailscale

状態: **NOT STARTED**

- same-origin React + `/api/*`
- `127.0.0.1` bind
- local Firebase Auth dependency除去
- Tailscale Serve
- Funnel不使用

## 16. O-12h — 並行検証・復旧試験

状態: **NOT STARTED**

- Cloud/local parity
- new-file / reprocess / retry / restart
- clean-room recovery

**O-12h完了前にCloud operationを停止しない。**

## 17. O-12i — Cloud運用停止

状態: **NOT STARTED**

- 最小・可逆のCloud automatic processing停止
- local-only new-data processing確認
- Firestore等のCloud dataは削除しない

## 18. O-12j — Cloud完全撤去

状態: **NOT STARTED**

- final resource/Billing/data audit
- data preservation確認
- dedicated project確認
- Billing disable
- dedicated project shutdown（安全確認・明示承認後のみ）

# 進捗・証拠管理

## 19. ChatGPT進捗ログ

| ID | Phase | 状態 | 作業 | 結果 |
| --- | --- | --- | --- | --- |
| `GPT-O12A-001` | O-12a | COMPLETE | GitHub/Cloud/Firebase/local architecture監査 | dependencyとmigration seam特定 |
| `GPT-O12A-002` | O-12a | COMPLETE | connected Drive監査 | raw `Health Auto Export/Sleep`確認 |
| `GPT-O12A-003` | O-12a | COMPLETE | Web Cloud API/Auth依存監査 | O-12f minimum parity特定 |
| `GPT-O12A-004` | O-12a | COMPLETE | Firestore category整理 | O-12e分類対象特定 |
| `GPT-O12A-005` | O-12a | COMPLETE | `CX-O12A-001`設計/review | Git/runtime/schema確定 |
| `GPT-O12A-006` | O-12a | COMPLETE | 残監査をGCP/N100へ分離 | 重複Codex作業削減 |
| `GPT-O12A-007` | O-12a | COMPLETE | Cloud Shell GCP監査手順作成 | `GCP-O12A-001` READY |
| `GPT-O12A-008` | O-12a | COMPLETE | `CX-O12A-002` review | Tailscale + server-data確定、Driveだけ未解決 |
| `GPT-O12A-009` | O-12a | COMPLETE | Google Drive for desktop現行mount仕様再確認 | folder mount可能と確認、前回監査のC:除外を修正 |
| `GPT-O12A-010` | O-12a | COMPLETE | Drive mount再監査設計 | `CX-O12A-003` READY |
| `GPT-O12B-PREP-001` | O-12b | COMPLETE | existing contract/schema比較 | 継承/分離方針確定 |
| `GPT-O12B-PREP-002` | O-12b | COMPLETE | Processed Data Contract作成 | contract draft作成 |
| `GPT-O12B-PREP-003` | O-12b | COMPLETE | snapshot/version/provenance/migration/test設計 | 静的主要設計完了 |
| `GPT-O12B-PREP-004` | O-12b | COMPLETE | JSON Schema作成 | machine-readable schema |
| `GPT-O12B-PREP-005` | O-12b | COMPLETE | integration/overlap/block static review | O-12c refactor論点特定 |
| `GPT-O12B-PREP-006` | O-12b | COMPLETE | Codex schema syntax result review | JSON syntax PASS |

## 20. Codex / 外部実行キュー

| ID | Phase | 状態 | 内容 | ChatGPT review |
| --- | --- | --- | --- | --- |
| `CX-O12A-001` | O-12a | PARTIAL PASS | Git/runtime/schema + 広域監査試行 | 確定項目を再確認対象から除外 |
| `CX-O12A-002` | O-12a | PARTIAL PASS | N100 filesystem + Tailscale | Tailscale/server-data PASS。Drive検索手順不足 |
| `CX-O12A-003` | O-12a | READY | DriveFS mount pointだけread-only再確認 | 未実行 |
| `GCP-O12A-001` | O-12a | READY | Cloud Shell read-only control-plane/Billing監査 | 未実行 |

## 21. 証拠台帳

| Evidence ID | Phase | Source | 内容 |
| --- | --- | --- | --- |
| `EV-BASELINE-001` | 全体 | GitHub | O-12基準文書 |
| `EV-PROGRESS-001` | 全体 | GitHub | 本進捗文書 |
| `EV-O12A-GH-001` | O-12a | GitHub | code/local/Cloud dependency audit |
| `EV-O12A-DRIVE-001` | O-12a | connected Drive | raw source経路と最新JSON |
| `EV-O12A-CX-001` | O-12a | Codex | Git/runtime/schema + blocker |
| `EV-O12A-CX-002` | O-12a | Codex | Tailscale Running/Automatic + server-data ABSENT + Drive NOT FOUND |
| `EV-O12A-GCP-001` | O-12a | Cloud Shell | 実行後記録 |
| `EV-O12A-CX-003` | O-12a | Codex | Drive mount再監査後記録 |
| `EV-O12B-CONTRACT-001` | O-12b | GitHub | Processed Data Contract |
| `EV-O12B-SCHEMA-001` | O-12b | GitHub/Codex | JSON Schema + JSON syntax PASS |

## 22. 現在の次の作業

### Codex

`CX-O12A-003` のみ実行する。

### GCP

Cloud Shellで `docs/o12-gcp-readonly-audit.md` の `GCP-O12A-001` をread-only実行する。

### ChatGPT

両結果をreviewし:

1. O-12a Exit Gate判定
2. O-12a COMPLETEならO-12bへ結果反映
3. Processed Data Contract final review
4. 静的に十分なら追加CodexなしでO-12b Exit Gate判定
5. O-12b COMPLETE後にのみO-12cを開始
