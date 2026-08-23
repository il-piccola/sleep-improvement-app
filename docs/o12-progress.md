# O-12 作業進捗管理

状態: **O-12a BLOCKED（残監査2本に限定） / O-12b PREPARATION（静的設計ほぼ完了）**  
基準文書: [`o12-local-first-cloud-exit-plan.md`](./o12-local-first-cloud-exit-plan.md)  
O-12b契約ドラフト: [`o12-processed-data-contract.md`](./o12-processed-data-contract.md)  
O-12b JSON Schema: [`o12-processed-data-schema.json`](./o12-processed-data-schema.json)  
GCP read-only監査: [`o12-gcp-readonly-audit.md`](./o12-gcp-readonly-audit.md)  
N100 read-only監査: [`o12-n100-readonly-audit.md`](./o12-n100-readonly-audit.md)  
主フェーズ: **O-12a — 現状監査**  
並行準備: **O-12b — Processed Data Contract**  
次の担当: **GCP Cloud Shell監査 / Codex `CX-O12A-002` / 結果レビューはChatGPT**  
最終更新日: **2026-08-23**

この文書はO-12の実作業を管理する中心文書です。各フェーズの進捗、ChatGPTとCodexの作業分担、証拠、判断、ブロッカー、ChatGPT ↔ Codexの依頼と結果を管理します。

O-12の目的・アーキテクチャ・フェーズゲート・完了条件は基準文書で定義します。この文書と基準文書が矛盾した場合は、**基準文書を優先します。**

進捗記録、Codex依頼、Codex返答、ChatGPTレビュー、証拠記録は**日本語を標準**とします。コマンド名、API名、file名、error原文などは正確性のため英語のまま記録して構いません。

## 1. 作業モデル

O-12は **ChatGPT優先・Codex最小化** で進めます。

### ChatGPTを主担当とする

ChatGPTで実施できる作業は原則ChatGPTが担当します。

- プロジェクト計画とフェーズ管理
- GitHub・コード・文書監査
- 接続済みGoogle Driveから確認可能な監査
- 公開仕様・料金・ポリシー確認
- Cloud依存分析
- Firestoreデータ分類設計
- Processed Data Contract設計・レビュー
- migration戦略・検証基準・test計画
- Codex変更・command出力レビュー
- 進捗・証拠の記録
- Exit Gate判定

**監査はChatGPT担当を原則とします。**

### Codexは実行担当に限定する

CodexはChatGPTから直接実行できないN100/local作業だけに使います。すでに確認済みのGit/runtime/schema、公開仕様、repository監査を再度Codexに調査させません。

### フェーズ先行着手ルール

**原則:** `Exit Gateは順番に通す。ただしChatGPTの安全な準備作業は1フェーズ先まで並行可能。`

前フェーズ待ちでも、schema比較、contract設計、versioning/provenance、test case、compatibility policyなどの非破壊・非確定作業は先行できます。

一方、前フェーズ未完了のまま次フェーズをCOMPLETEにしたり、さらに先のcode変更へ進んだりしません。

### ユーザー承認が必要な境界

以下は該当フェーズのゲート通過とユーザーの明示承認後にだけ実行します。

- 停止
- 削除
- 無効化
- 移行
- 上書き
- Billing変更
- Project shutdown
- 本番・Cloudデータやサービスを実質的に変更する操作

## 2. Codexトークン最小化ルール

1. Codexを呼ぶ前にChatGPT側で可能な作業を完了する。
2. 1回の依頼は限定された目的にする。
3. 既知のpath / file / commandを具体的に指定する。
4. 調べないこと・変更しないことを明記する。
5. 長文分析ではなく簡潔な事実だけ返してもらう。
6. 一度PASSした項目を理由なく再確認しない。
7. 公開document調査はChatGPTが行う。
8. Codex結果は証拠としてChatGPTがレビューする。
9. N100へ監査目的だけのCLI/packageを追加しない。
10. Cloud監査は既存の認証済みCloud Shell等を優先する。

## 3. ステータス定義

- **NOT STARTED** — 未着手
- **PREPARATION** — 前フェーズ待ちの間にChatGPTが安全な先行準備を実施中
- **CHATGPT WORKING** — ChatGPT側の監査・分析・文書作業中
- **CODEX NEEDED** — ChatGPTで絞り込み済みで、残りがlocal確認のみ
- **CODEX RUNNING** — 限定Codex作業を依頼済み
- **REVIEW** — ChatGPTが結果・証拠を確認中
- **BLOCKED** — Exit Gateに必要な確認が未取得
- **COMPLETE** — Exit Gate通過、証拠記録済み

証拠なしでフェーズをCOMPLETEにしません。

## 4. Stage / Phase 作業分担

| Stage | Phase | ChatGPT主担当 | Codex最小担当 | 状態 |
| --- | --- | --- | --- | --- |
| **1 Inventory** | **O-12a 現状監査** | GitHub/code/Drive監査、dependency map、公開仕様、結果レビュー | N100 filesystem/Tailscaleの最小確認のみ | **BLOCKED** |
| **2 Contract** | **O-12b Processed Data Contract** | schema/version/provenance/compatibility/snapshot/migration/test設計 | 必要な場合のみfixture/prototype test | **PREPARATION** |
| **3 Processor** | **O-12c Processor独立化** | coupling、boundary/interface、実装指示、diff/testレビュー | bounded refactor + targeted test | **NOT STARTED** |
| **3 Processor** | **O-12d Processor堅牢化** | persistence/fingerprint/path/backup/test仕様 | filesystem/watcher/snapshot/Drive copy実装・試験 | **NOT STARTED** |
| **4 Migration** | **O-12e 既存データ移行** | Rebuild/Migrate/Archive分類、adapter/manifest、結果レビュー | local migration/reconstruction + 必要最小限Cloud read/export | **NOT STARTED** |
| **5 Local runtime** | **O-12f Sleep Compass独立化** | Cloud/API依存、local replacement、parity設計 | local code変更 + build/test | **NOT STARTED** |
| **5 Local runtime** | **O-12g Local Web + Tailscale** | same-origin/localhost/access設計 | N100 local server/Tailscale Serve試験 | **NOT STARTED** |
| **5 Local runtime** | **O-12h 並行検証・復旧試験** | comparison matrix、evidence review、gate判定 | prescribed local/restart/reconstruction test | **NOT STARTED** |
| **6 Cloud exit** | **O-12i Cloud運用停止** | gate、最小可逆stop、post-stop review | 明示承認されたCloud stopのみ | **NOT STARTED** |
| **6 Cloud exit** | **O-12j Cloud完全撤去** | resource/Billing/data最終監査、撤去順序、完了確認 | 明示承認済みBilling/project/resource操作のみ | **NOT STARTED** |

## 5. O-12a — 現状監査

### ChatGPT完了項目

- [x] GitHub `master` / docs / dependency / Cloud/Firebase参照監査
- [x] 既存local server構成監査
- [x] 接続済みGoogle Drive read-only監査
- [x] Cloud dependency / resource確認表作成
- [x] Google Cloud / Tailscale公開仕様確認
- [x] `CX-O12A-001` 発行・結果レビュー
- [x] 再確認不要項目と残監査を分離
- [x] GCP残監査をCloud Shell用read-only手順へ固定
- [x] N100残監査を `CX-O12A-002` の2カテゴリへ縮小

### ChatGPT監査で確認済み

**Google Drive**

- `Health Auto Export` folderが存在する。
- その配下に `Sleep` folderが存在する。
- 2026-08-23までの日付付きHealth Auto Export JSONを確認した。
- raw source供給経路の存在と継続性は確認済み。
- 接続検索では `normalized-sleep-records.json`、`export.xml`、`Sleep Compass` folderは確認できなかった。

**local code**

- `server/server.ts` はlocal HTTP API + watcherを持つ。
- 現在は `0.0.0.0` bind、起動時watcher開始。
- `server/importHealthExports.ts` は `mergeAndAnalyzeSleepRecords` を直接呼び、Processorは未独立。
- `server/config.ts` に旧Windows drive-letter既定pathが残る。
- `health-store.json` / `processed-files.json` は直接上書き、read失敗時に空stateへ落ちる。
- processed ledgerは500件上限、fingerprintはfile全文SHA-256。

**Cloud / Firebase code/docs**

- Firebase既定project: `sleep-improvement-cloud`。
- 既知Cloud Run: `sleep-improvement-api`, `sleep-improvement-drive-sync-api`。
- 既知Scheduler: `sleep-drive-sync-daily`。
- Firestore監査対象: `sleep_records`, `processed_drive_files`, `drive_sync_runs`, `health_metric_records`, `ingest_batches`, `metric_audit_summaries`。
- health metrics / sleep-window metrics / metric auditはProcessorへ回収対象。
- WebはFirebase Auth / ID TokenでCloud APIを利用。

### `CX-O12A-001` 結果

判定: **PARTIAL PASS / BLOCKED**

確認済みで再確認しない:

- Git: `master`, clean, `origin/master`同期
- Node.js: `v22.23.1`
- npm: `10.9.8`
- O-12b JSON Schema JSON構文PASS
- Cloud / Firestore / Drive / Tailscale設定変更なし

未取得だった項目:

- N100のHealth Auto Export実path
- `server-data` current state
- GCP current control-plane / Billing
- Tailscale runtime state

### 残監査A — GCP `GCP-O12A-001`

手順: [`o12-gcp-readonly-audit.md`](./o12-gcp-readonly-audit.md)

確認対象:

- project lifecycle
- `billingEnabled`
- Cloud Run
- Cloud Scheduler
- Artifact Registry
- Firestore database metadata
- Secret Manager secret names
- Cloud Storage bucket names
- service-account count
- Cloud Build triggers
- relevant enabled APIs
- Cloud Asset Inventory assetType counts（既にAPI有効な場合のみ）
- Firebase Hosting site IDs（Hosting APIが既に有効な場合のみ）

**料金境界:** Cloud Shell自体はGoogle Cloudアカウント利用者は無料。新しい有料サービスを追加しない。API有効化・Billing変更・resource変更はしない。

状態: **READY / 未実行**

### 残監査B — N100 `CX-O12A-002`

手順: [`o12-n100-readonly-audit.md`](./o12-n100-readonly-audit.md)

確認対象は2カテゴリだけ:

1. Google Drive for DesktopのOS-visible `Health Auto Export` 実path + `Sleep` directory存在
2. Tailscale Windows serviceのName / Status / StartType

加えてrepository直下の `server-data` はEXISTS/ABSENTだけ確認する。`ABSENT` はcurrent-stateとして受理し、作成しない。

Tailscale CLIは再実行しない。現在のServe configured状態はO-12gで新構成を検証するため、O-12aの必須証拠から外す。

状態: **READY / 未実行**

### O-12a Exit Gate

次の2結果が揃ったらChatGPTが判定する。

- `GCP-O12A-001`
- `CX-O12A-002`

Firestore document本文やhistorical dataの具体的なRebuild/Migrate/Archive作業はO-12eで行う。O-12aでは既知collection categoryとcontrol-planeを突き合わせ、重要な未説明resource/data categoryがないことを確認する。

## 6. O-12b — Processed Data Contract

状態: **PREPARATION。静的設計ほぼ完了。O-12a結果反映後に最終確定。**

### ChatGPT

- [x] canonical dataset / format
- [x] `schemaVersion` / `processorVersion` / `generatedAt` / provenance
- [x] processing config / sleep-day provenance
- [x] legacy reader compatibility
- [x] snapshot publication / completion marker / retention
- [x] migration manifest
- [x] existing raw/local/Cloud schema対応表
- [x] contract test cases
- [x] machine-readable JSON Schema
- [x] JSON Schema JSON構文PASS
- [x] source integration / overlap / block classification static cross-check
- [ ] O-12a結果をmigration/legacy対象へ反映
- [ ] final review後PREPARATIONを外す

成果物:

- `docs/o12-processed-data-contract.md`
- `docs/o12-processed-data-schema.json`

canonical snapshot案:

```text
snapshots/<snapshotId>/
  manifest.json
  input-files.jsonl
  sleep-records.jsonl
  sleep-blocks.jsonl
  sleep-days.jsonl
  source-summaries.jsonl
  overlaps.jsonl
  health-metrics.jsonl
  diagnostics.json
  migration-manifest.json   # migration時のみ
  complete.json
```

O-12c向けに確認済みの差異:

1. source integrationが `SleepSourcePreferenceMap` に直接依存している。
2. overlap thresholdは現行80% / 30%。provenanceで追跡が必要。
3. `sleep-block-N` はdeterministic canonical IDに変更が必要。
4. WebとCloudでblock/main sleep分類に差がある。
5. fragmentation / circadian / ImprovementActionはSleep Compass側へ残す。

O-12b用の追加Codex依頼は現時点では不要。

**Exit Gate:** O-12a COMPLETE後、versioned contract、migration rule、schema、test caseをfinal reviewし、外部consumerから利用可能と判断できること。

## 7. O-12c〜j

| Phase | 状態 | 次に行うこと |
| --- | --- | --- |
| O-12c Processor独立化 | **NOT STARTED** | O-12b完了後、ChatGPTがcoupling/boundary/file単位実装指示を確定してからCodex実装 |
| O-12d Processor堅牢化 | **NOT STARTED** | atomic snapshot、portable path、fingerprint、watcher/rescan、Drive backup |
| O-12e 既存データ移行 | **NOT STARTED** | Rebuild/Migrate/Archive、manifest、clean-room reconstruction |
| O-12f Sleep Compass独立化 | **NOT STARTED** | Processed Data-backed local API、Cloud persistence除去 |
| O-12g Local Web + Tailscale | **NOT STARTED** | same-origin、localhost-only、Firebase Auth除去、Tailscale Serve |
| O-12h 並行検証・復旧 | **NOT STARTED** | Cloud/local parity、reprocess/retry/restart/recovery |
| O-12i Cloud運用停止 | **NOT STARTED** | O-12h後、最小・可逆な自動処理停止 |
| O-12j Cloud完全撤去 | **NOT STARTED** | final audit、data preservation、Billing disable、dedicated project shutdown |

## 8. ChatGPT進捗ログ

| 作業ID | 日付 | Phase | 状態 | 作業 | 結果 |
| --- | --- | --- | --- | --- | --- |
| `GPT-O12A-001` | 2026-08-23 | O-12a | COMPLETE | GitHub / Cloud/Firebase dependency監査 | 主要dependencyとlocal seam特定 |
| `GPT-O12A-002` | 2026-08-23 | O-12a | COMPLETE | connected Drive read-only監査 | raw経路と最新JSON確認 |
| `GPT-O12A-003` | 2026-08-23 | O-12a | COMPLETE | Web Cloud API/Firebase Auth監査 | O-12f parity対象特定 |
| `GPT-O12A-004` | 2026-08-23 | O-12a | COMPLETE | Firestore category整理 | O-12e分類対象特定 |
| `GPT-O12A-005` | 2026-08-23 | O-12a | COMPLETE | `CX-O12A-001`設計 | N100/GCP未知を1回へ集約 |
| `GPT-O12A-006` | 2026-08-23 | O-12a | COMPLETE | `CX-O12A-001`レビュー | Git/runtime/schema確定、残監査縮小 |
| `GPT-O12A-007` | 2026-08-23 | O-12a | COMPLETE | GCP監査経路レビュー | N100へのCLI導入を避けCloud Shell採用 |
| `GPT-O12A-008` | 2026-08-23 | O-12a | COMPLETE | GCP Cloud Shell read-only手順作成 | `o12-gcp-readonly-audit.md` |
| `GPT-O12A-009` | 2026-08-23 | O-12a | COMPLETE | N100監査を最小化 | `CX-O12A-002`をfilesystem/Tailscaleだけに限定 |
| `GPT-O12B-PREP-001` | 2026-08-23 | O-12b | COMPLETE | existing contract/schema比較 | 継承/分離方針確定 |
| `GPT-O12B-PREP-002` | 2026-08-23 | O-12b | COMPLETE | Processed Data Contract作成 | contract draft完成 |
| `GPT-O12B-PREP-003` | 2026-08-23 | O-12b | COMPLETE | snapshot/versioning/provenance/migration/test設計 | 主要静的設計完了 |
| `GPT-O12B-PREP-004` | 2026-08-23 | O-12b | COMPLETE | JSON Schema作成 | machine-readable contract完成 |
| `GPT-O12B-PREP-005` | 2026-08-23 | O-12b | COMPLETE | current code cross-check | O-12c向け差異特定 |
| `GPT-O12B-PREP-006` | 2026-08-23 | O-12b | COMPLETE | Codex schema構文結果反映 | JSON syntax PASS |

## 9. Codex / 実行キュー

| ID | 実行者 | Phase | 状態 | 目的 | ChatGPTレビュー |
| --- | --- | --- | --- | --- | --- |
| `CX-O12A-001` | Codex | O-12a | **PARTIAL PASS / BLOCKED** | 初回N100/GCP read-only監査 | 完了。再実行しない |
| `CX-O12A-002` | Codex | O-12a | **READY** | N100 Health Auto Export path + Tailscale Windows service | 未レビュー |
| `GCP-O12A-001` | Cloud Shell | O-12a | **READY** | GCP control-plane / Billing read-only監査 | 未レビュー |

### Codex返答形式

```text
依頼ID:
結果: PASS / FAIL / BLOCKED
確認事実または変更ファイル:
実行コマンド / テスト:
エラー / ブロッカー:
Commit SHA（ある場合）:
```

Codex出力は証拠であり最終判断ではありません。ChatGPTがレビューしてtrackerを更新します。

## 10. 証拠台帳

| Evidence ID | Phase | Source | 証明する内容 | Location / reference |
| --- | --- | --- | --- | --- |
| `EV-BASELINE-001` | O-12全体 | GitHub | 承認済みbaseline | `docs/o12-local-first-cloud-exit-plan.md` |
| `EV-PROGRESS-001` | O-12全体 | GitHub | ChatGPT/Codex進捗管理 | この文書 |
| `EV-O12A-GH-001` | O-12a | GitHub | local server / Cloud API / Firebase / Firestore dependency | repository `master` |
| `EV-O12A-DRIVE-001` | O-12a | Google Drive | `Health Auto Export/Sleep` raw経路 + latest JSON | connected Drive audit |
| `EV-O12A-CX-001` | O-12a | Codex | Git/runtime/schema + blocker特定 | `CX-O12A-001` |
| `EV-O12A-GCP-PLAN-001` | O-12a | GitHub + Google公式仕様 | GCP監査をCloud Shell read-onlyへ固定 | `docs/o12-gcp-readonly-audit.md` |
| `EV-O12A-N100-PLAN-001` | O-12a | GitHub | N100残監査を最小化 | `docs/o12-n100-readonly-audit.md` |
| `EV-O12B-CONTRACT-001` | O-12b | GitHub | Processed Data Contract | `docs/o12-processed-data-contract.md` |
| `EV-O12B-SCHEMA-001` | O-12b | GitHub/Codex | machine-readable schema + JSON構文PASS | `docs/o12-processed-data-schema.json` |

raw health data、secret、token、OAuth credential、tailnet-sensitive情報、不要なBilling/account識別情報はcommitしません。

## 11. 判断 / ブロッカーログ

| 日付 | Phase | 種別 | 判断 / ブロッカー | 対応 |
| --- | --- | --- | --- | --- |
| 2026-08-23 | O-12全体 | Decision | 監査・設計はChatGPT、Codexはlocal実行に最小化 | 継続 |
| 2026-08-23 | O-12全体 | Decision | ChatGPTは1フェーズ先の安全なPREPARATIONを可能とする | Exit Gate順序は維持 |
| 2026-08-23 | O-12a | Result | `CX-O12A-001` PARTIAL PASS / BLOCKED | 再確認範囲を分離 |
| 2026-08-23 | O-12a | Decision | GCP CLI未導入N100へ監査目的だけでCLIを入れない | Cloud Shellへ分離 |
| 2026-08-23 | O-12a | Decision | Tailscale CLI hangを再試行しない | Windows service inventoryへ縮小 |
| 2026-08-23 | O-12a | Decision | current Serve設定はO-12gで新構成を検証 | O-12a必須条件から除外 |
| 2026-08-23 | O-12a | Blocker | GCP current control-plane / Billing未取得 | `GCP-O12A-001` |
| 2026-08-23 | O-12a | Blocker | N100 Health Auto Export OS-visible path未取得 | `CX-O12A-002` |
| 2026-08-23 | O-12b | Decision | completed/versioned JSON/JSONL snapshotをcanonicalとする | draft反映済み |
| 2026-08-23 | O-12b | Decision | UI score/actionはProcessed Dataから分離 | Sleep Compass側 |

## 12. 現在の次の作業

### 実行待ち

1. `GCP-O12A-001` をCloud Shellでread-only実行する。
2. `CX-O12A-002` をN100上のCodexでread-only実行する。

### 結果受領後のChatGPT

1. 2つの結果をレビューし、repository/Drive一次監査と統合する。
2. O-12a Exit Gateを判定する。
3. O-12a COMPLETEならO-12b contractへ実在environment情報を反映する。
4. O-12b final reviewを実施する。
5. 追加Codexが不要ならO-12bをCOMPLETEとし、初めてO-12cへ進む。

O-12aがCOMPLETEになるまでO-12bをCOMPLETEにせず、O-12cのcode変更には進みません。
