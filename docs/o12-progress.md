# O-12 作業進捗管理

状態: **O-12a BLOCKED（残監査を縮小済み） / O-12b PREPARATION（静的設計ほぼ完了）**  
基準文書: [`o12-local-first-cloud-exit-plan.md`](./o12-local-first-cloud-exit-plan.md)  
O-12b契約ドラフト: [`o12-processed-data-contract.md`](./o12-processed-data-contract.md)  
O-12b JSON Schema: [`o12-processed-data-schema.json`](./o12-processed-data-schema.json)  
主フェーズ: **O-12a — 現状監査**  
並行準備: **O-12b — Processed Data Contract**  
次の担当: **ChatGPT（残監査経路の整理） / 必要時のみCodexまたはCloud Shell**  
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

Codexは次のような、ChatGPTから直接実行できない作業だけに使います。

- N100実機のlocal filesystem / local Git確認
- local runtime / credentialsを必要とする確認
- `gcloud` / Tailscale CLI実行
- local build / test / migration実行
- 複数fileの実装変更と実機検証
- 後半フェーズで明示承認された状態変更

Codexには、ChatGPTが済ませた調査・設計・公開仕様確認・repository全体レビューを繰り返させません。

### フェーズ先行着手ルール

前フェーズがCodex実機確認などの待ち状態でも、ChatGPTは次フェーズのうち**非破壊・read-only・前フェーズの未確定事実に依存しない作業**を先行できます。

**原則:** `Exit Gateは順番に通す。ただしChatGPTの安全な準備作業は1フェーズ先まで並行可能。`

先行可能:

- schema比較
- contract設計
- versioning / provenance設計
- test case設計
- compatibility policy
- 実装論点整理

先行不可:

- 未確認事実を確定値として扱う
- 次フェーズをCOMPLETEにする
- さらに次の実装フェーズへ進む
- Cloud / Firestore / Drive / productionを変更する

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
3. 対話的探索より小さなcommand bundleを優先する。
4. 既知のpath / file / commandは具体的に指定する。
5. 調べないこと・変更しないことを明記する。
6. 長文分析ではなく簡潔な事実だけ返してもらう。
7. 過去の出力を再利用し、同じ確認を繰り返さない。
8. 公開document調査はChatGPTが行う。
9. Codex結果はChatGPTがレビューして次を決める。
10. ChatGPTだけで安全に完了できる作業ではCodexを呼ばない。
11. 一度PASSしたGit/runtime/schema項目は、理由なく再確認しない。
12. GCP CLIがないN100へ監査だけのためにCLIを導入することは原則避け、既存の認証済み環境を優先する。

## 3. ステータス定義

- **NOT STARTED** — 未着手
- **PREPARATION** — 前フェーズ待ちの間にChatGPTが安全な先行準備を実施中
- **CHATGPT WORKING** — ChatGPT側の監査・分析・文書作業中
- **CODEX NEEDED** — ChatGPTで絞り込み済みで、残りがlocal確認のみ
- **CODEX RUNNING** — 限定Codex作業を依頼済み
- **REVIEW** — ChatGPTが結果・証拠を確認中
- **BLOCKED** — Exit Gateに必要な確認が実行環境不足などで未取得
- **COMPLETE** — Exit Gate通過、証拠記録済み

証拠なしでフェーズをCOMPLETEにしません。

## 4. Stage / Phase 作業分担

| Stage | Phase | ChatGPT主担当 | Codex最小担当 | 状態 |
| --- | --- | --- | --- | --- |
| **1 Inventory** | **O-12a 現状監査** | GitHub/code/Drive監査、dependency map、公開仕様、GCP/N100結果レビュー | ChatGPTから取得できないlocal/GCP control-plane確認のみ | **BLOCKED** |
| **2 Contract** | **O-12b Processed Data Contract** | schema/version/provenance/compatibility/snapshot/migration/test設計 | 必要な場合だけfixture/prototype test | **PREPARATION** |
| **3 Processor** | **O-12c Processor独立化** | coupling分析、boundary/interface設計、diff/testレビュー | bounded refactorとtargeted test | **NOT STARTED** |
| **3 Processor** | **O-12d Processor堅牢化** | persistence/fingerprint/path/backup/test仕様 | filesystem/watcher/snapshot/Drive copy実装・試験 | **NOT STARTED** |
| **4 Migration** | **O-12e 既存データ移行** | Rebuild/Migrate/Archive分類、adapter/manifest、結果レビュー | local migration/reconstructionと必要最小限Cloud read/export | **NOT STARTED** |
| **5 Local runtime** | **O-12f Sleep Compass独立化** | Cloud/API依存、local replacement、parity設計 | local code変更とbuild/test | **NOT STARTED** |
| **5 Local runtime** | **O-12g Local Web + Tailscale** | same-origin/localhost/access設計 | N100 local server/Tailscale Serve確認 | **NOT STARTED** |
| **5 Local runtime** | **O-12h 並行検証・復旧試験** | comparison matrix、evidence review、gate判定 | prescribed local/restart/reconstruction test | **NOT STARTED** |
| **6 Cloud exit** | **O-12i Cloud運用停止** | gate、最小可逆stop、post-stop review | 明示承認されたCloud stopのみ | **NOT STARTED** |
| **6 Cloud exit** | **O-12j Cloud完全撤去** | resource/Billing/data最終監査、撤去順序、完了確認 | 明示承認済みBilling/project/resource操作のみ | **NOT STARTED** |

## 5. フェーズ詳細

### O-12a — 現状監査

#### ChatGPT完了項目

- [x] GitHub `master`、現行code、docs、dependency、Cloud/Firebase参照を監査
- [x] 既存local server構成を監査
- [x] 接続済みGoogle Driveをread-only監査
- [x] Cloud dependency / resource確認表を作成
- [x] Google Cloud / Tailscale公開仕様を必要範囲で再確認
- [x] 未確認事項を `CX-O12A-001` へ集約
- [x] `CX-O12A-001` 結果をレビュー・分類
- [x] 再確認不要項目と残監査項目を分離

#### ChatGPT一次監査で確認済み

**Google Drive**

- `Health Auto Export` folderが存在する。
- その配下に `Sleep` folderが存在する。
- 2026-08-23までの日付付きHealth Auto Export JSONを確認した。
- 接続検索では `normalized-sleep-records.json`、`export.xml`、`Sleep Compass` folderは確認できなかった。
- raw source供給経路の存在と継続性はChatGPT側で確認済み。

**既存local経路**

- `server/server.ts` がlocal HTTP API + watcherを持つ。
- serverは現在 `0.0.0.0` bindで、起動時にwatcherを開始する。
- `server/importHealthExports.ts` が `mergeAndAnalyzeSleepRecords` を直接呼ぶためProcessorはまだ独立していない。
- `server/config.ts` に旧Windows drive-letter既定pathが残る。
- `health-store.json` / `processed-files.json` は直接上書きで、read失敗時に空stateへ落ちる。
- processed ledgerは500件上限、fingerprintはfile全文SHA-256。
- processed backup出力はraw watch rootから分離する必要がある。

**Cloud / Firebase**

- Firebase既定projectは `sleep-improvement-cloud`。
- Firebase Hosting設定が残る。
- Cloud APIはFirestore/Application Default Credentialsを利用する。
- repository/doc上の既知Cloud Run: `sleep-improvement-api`, `sleep-improvement-drive-sync-api`。
- repository/doc上の既知Scheduler: `sleep-drive-sync-daily`。
- Firestore監査対象は少なくとも `sleep_records`, `processed_drive_files`, `drive_sync_runs`, `health_metric_records`, `ingest_batches`, `metric_audit_summaries`。
- health metrics / sleep-window metrics / metric auditはProcessorへ回収対象。
- 実際の現在のGCP resource/Billing状態はまだcontrol-planeで未確認。

**Web**

- Firebase Auth / ID TokenをCloud API認証に使用。
- 主要Cloud read: `import-status`, `unified-timeline`, `drive-sync-status`, `sleep-health-context`。
- 月表示: `unified-timeline?month=...`。
- manual Drive sync: `POST /api/drive-sync`。

#### CX-O12A-001 結果レビュー

Codex実行結果をChatGPTがレビューした。

**確認できた項目**

- local Git: `master`。
- Codex監査開始時点でworking tree clean。
- `origin/master` と同期。
- Node.js: `v22.23.1`。
- npm: `10.9.8`。
- `docs/o12-processed-data-schema.json` のJSON構文検証PASS。
- Cloud / Firestore / Drive / Tailscale設定変更なし。

**BLOCKED / 未取得**

- Codex実行環境からHealth Auto Export watch pathを確認できなかった。
- Codex実行環境から `server-data` を確認できなかった。
- `gcloud` CLI未導入のためGCP control-plane metadata未取得。
- Firebase CLI未導入のためHosting実在確認未取得。
- Tailscale CLIが応答待ちとなりruntime state未取得。

**ChatGPT判定**

`CX-O12A-001` は **PARTIAL PASS / BLOCKED** とする。

再確認しない項目:

- Git branch / sync
- Node/npm version
- JSON Schema構文

残監査は次の3カテゴリだけとする。

1. **GCP control-plane / Billing**
   - project lifecycle
   - billingEnabled
   - Cloud Run
   - Cloud Scheduler
   - Artifact Registry
   - Firestore database metadata
   - Secret Manager
   - Cloud Storage
   - relevant enabled APIs
   - Firebase Hosting site
2. **N100 filesystem境界**
   - 実際のGoogle Drive mount / Health Auto Export path
   - local `server-data` の有無と実path
3. **Tailscale runtime**
   - service/backend online状態
   - Serve configured yes/no

同じ `CX-O12A-001` をそのまま再実行しない。

**Exit Gate:** Cloud / Billing / Firestore / Drive / local / host inventoryがO-12b確定に十分で、重要な未説明resource/data categoryがないこと。

**現在:** 上記3カテゴリの残監査待ち。

### O-12b — Processed Data Contract

**状態: PREPARATION。静的設計はほぼ完了。O-12a結果反映後に最終確定する。**

#### ChatGPT

- [x] canonical dataset / formatを設計
- [x] `schemaVersion` / `processorVersion` / `generatedAt` / provenanceを設計
- [x] processing config / sleep-day provenanceを設計
- [x] legacy reader compatibility policyを設計
- [x] snapshot publication / completion marker / retention ruleを設計
- [x] migration manifestを設計
- [x] existing raw/local/Cloud schemaとの対応表を作成
- [x] contract test caseを定義
- [x] JSON Schemaを作成
- [x] JSON Schema構文検証PASSをCodex結果で確認
- [x] source integration / overlap / block classificationを現行codeと静的比較
- [ ] O-12a残監査結果を反映し、暫定項目を確定
- [ ] final review後にPREPARATION表記を外す

#### O-12b成果物

- `docs/o12-processed-data-contract.md`
- `docs/o12-processed-data-schema.json`

#### canonical案

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

設計原則:

- canonicalはJSON / JSONL。
- `manifest.json` にschema、processor、processing config、dataset count/hashを持つ。
- `complete.json` を最後に発行し、未完成snapshotをconsumerが読まない。
- snapshotはimmutable。修正時は新snapshotを作る。
- Drive backupはraw watch rootと別場所に置く。
- O-12中はDrive完成snapshotをProcessorが自動削除しない。
- absolute host path / drive letterを永続IDへ含めない。
- `SleepRecord[]` は `sleep-records.jsonl` として継承・安定化。
- Cloud `health_metric_records` はCloud固有fieldを外して `health-metrics.jsonl` へ継承。
- fragmentation / circadian / ImprovementActionはSleep Compass側へ残す。

#### 静的レビューで確認したO-12c向け論点

1. source integrationが `SleepSourcePreferenceMap` に直接依存しているため、standalone policyへ分離する必要がある。
2. overlap thresholdは現行80% / 30%。processing provenanceで追跡可能にする。
3. Web block IDの `sleep-block-N` はcanonical IDに不適切。deterministic IDへ変更する。
4. WebとCloudでblock/main sleep分類に差がある。canonicalはsleep day単位で整合する必要がある。
5. fragmentation / circadian score / ImprovementActionはProcessorではなくSleep Compass側に残す。

#### Codex

O-12b用追加Codex依頼は現時点では不要。

**Exit Gate:** versioned contract、migration rule、schema、test caseが確定し、Data Processor/外部appから利用可能であること。O-12aがCOMPLETEであることも必要。

### O-12c — Processor独立化

**状態: NOT STARTED。O-12b Exit Gate通過前にcode変更へ進まない。**

ChatGPT:

- [ ] importer / `healthStore` / API / React / Cloud処理のcouplingを確定
- [ ] Processor Core boundary/interfaceを定義
- [ ] Cloudから回収するhealth metrics / sleep-window処理を確定
- [ ] file単位実装指示を作成
- [ ] Codex diff/testレビュー

Codex:

- [ ] reviewed refactorをlocal適用
- [ ] direct one-shot処理追加
- [ ] watcherを同じcoreのwrapperへ変更
- [ ] targeted test/build

**Exit Gate:** ProcessorがSleep Compass Web/API、Firebase、Cloud Run、Firestore、Tailscale、Google Drive APIなしで動く。

### O-12d — Processor堅牢化

状態: **NOT STARTED**

- atomic/versioned snapshotとcorruption recovery
- configurable portable path
- drive-letter/absolute-path identity除去
- efficient fingerprinting
- watcher/rescan
- raw/processed separation
- Drive completed snapshot backup

### O-12e — 既存データ移行

状態: **NOT STARTED**

- Rebuild / Migrate / Archive分類
- migration adapter / manifest
- Firestore-only保存対象
- count/reject/checksum/reconstruction evidence
- clean-room reconstruction

### O-12f — Sleep Compass独立化

状態: **NOT STARTED**

- Firestore/Cloud endpoint依存除去
- Processed Data-backed local API
- current Web UI minimum parity

### O-12g — Local Web + Tailscale

状態: **NOT STARTED**

- same-origin React + `/api/*`
- localhost-only bind
- Firebase Auth local依存除去
- Tailscale Serve
- Funnel不使用

### O-12h — 並行検証・復旧試験

状態: **NOT STARTED**

- Cloud/local parity
- new-file/reprocess/retry/restart
- clean-room recovery

### O-12i — Cloud運用停止

状態: **NOT STARTED**

O-12h完了後のみ開始する。最小・可逆なCloud自動処理停止から行う。Firestore等のCloud dataはこのフェーズで削除しない。

### O-12j — Cloud完全撤去

状態: **NOT STARTED**

最終resource/Billing/data監査後、明示承認を得てBilling無効化とdedicated project shutdownを行う。

## 6. ChatGPT進捗ログ

| 作業ID | 日付 | Phase | 状態 | 作業 | 結果 / 次の扱い |
| --- | --- | --- | --- | --- | --- |
| `GPT-O12A-001` | 2026-08-23 | O-12a | **COMPLETE** | GitHub `master`、local server、Cloud API、Firebase/Firestore依存監査 | 主要dependencyとlocal migration seamを特定 |
| `GPT-O12A-002` | 2026-08-23 | O-12a | **COMPLETE** | connected Drive read-only監査 | `Health Auto Export/Sleep` と最新JSON確認 |
| `GPT-O12A-003` | 2026-08-23 | O-12a | **COMPLETE** | Web Cloud API/Firebase Auth依存監査 | O-12f minimum parity対象を特定 |
| `GPT-O12A-004` | 2026-08-23 | O-12a | **COMPLETE** | Firestore category / Cloud運用履歴論点整理 | O-12e分類対象を確定 |
| `GPT-O12A-005` | 2026-08-23 | O-12a | **COMPLETE** | N100/GCP残未知をCodexへ集約 | `CX-O12A-001` 発行 |
| `GPT-O12A-006` | 2026-08-23 | O-12a | **COMPLETE** | `CX-O12A-001` 結果レビュー | Git/runtime/schemaは確定。残監査をGCP・filesystem境界・Tailscaleの3カテゴリへ縮小 |
| `GPT-O12A-007` | 2026-08-23 | O-12a | **COMPLETE** | GCP監査代替経路を確認 | N100へのCLI導入より既存認証済みCloud Shell等を優先する方針 |
| `GPT-O12B-PREP-001` | 2026-08-23 | O-12b | **COMPLETE** | existing `DATA_CONTRACT.md`、local/Cloud schema比較 | Processed Dataへの継承/分離方針を確定 |
| `GPT-O12B-PREP-002` | 2026-08-23 | O-12b | **COMPLETE** | Processed Data Contractドラフト作成 | `docs/o12-processed-data-contract.md` |
| `GPT-O12B-PREP-003` | 2026-08-23 | O-12b | **COMPLETE** | canonical snapshot/versioning/provenance/publication/retention/migration/test設計 | O-12b主要設計を静的に完了 |
| `GPT-O12B-PREP-004` | 2026-08-23 | O-12b | **COMPLETE** | machine-readable JSON Schema作成 | `docs/o12-processed-data-schema.json` |
| `GPT-O12B-PREP-005` | 2026-08-23 | O-12b | **COMPLETE** | source integration / overlap / block classification cross-check | O-12c向け差異を特定 |
| `GPT-O12B-PREP-006` | 2026-08-23 | O-12b | **COMPLETE** | CodexのSchema構文検証結果を反映 | JSON syntax PASS |

ChatGPT追加作業は `GPT-O12X-NNN` 形式で追記します。

## 7. ChatGPT ↔ Codex 引き継ぎルール

### 依頼形式

```text
依頼ID:
フェーズ:
目的:
対象コマンド / ファイル:
禁止事項:
返却内容:
```

### 返答形式

```text
依頼ID:
結果: PASS / FAIL / BLOCKED
確認事実または変更ファイル:
実行コマンド / テスト:
エラー / ブロッカー:
Commit SHA（ある場合）:
```

Codex出力は証拠であり最終判断ではありません。ChatGPTがreviewしtrackerを更新します。

## 8. Codex依頼キュー / やり取り履歴

| 依頼ID | Phase | 状態 | 目的 | 結果/証拠 | ChatGPTレビュー |
| --- | --- | --- | --- | --- | --- |
| `CX-O12A-001` | O-12a | **PARTIAL PASS / BLOCKED** | N100/GCP残監査 | Git/runtime/schema PASS。Drive local path/server-data/GCP/Tailscale未取得 | 再実行範囲を3カテゴリへ縮小。Git/runtime/schemaは再確認しない |
| `CX-O12A-002` | O-12a | **NOT ISSUED** | 必要になった場合のみN100 filesystem/Tailscaleを最小確認 | 未実行 | GCP監査とは分離する |

### CX-O12A-002 候補範囲

Codexを再利用する場合でも、次だけに限定する。

```text
目的: O-12aのN100側未確認2点だけをread-only確認する。

1. filesystem
- WindowsのFileSystem drive一覧を確認し、Google Drive mountが見えるか
- Health Auto Export folderの実pathだけ返す
- repository直下または設定先のserver-data有無と実pathだけ返す
- health data本文は読まない

2. Tailscale
- CLIがhangする場合は再試行を繰り返さない
- Windows serviceとしてTailscale serviceのRunning/Stoppedだけ確認
- Serve URL、IP、device/tailnet名は返さない

禁止:
- install/update
- service restart
- config変更
- file変更
- health data本文read
```

**GCP control-plane監査はこのCodex依頼に混ぜない。**

## 9. 証拠台帳

| Evidence ID | Phase | Source | 証明する内容 | Location / reference |
| --- | --- | --- | --- | --- |
| `EV-BASELINE-001` | O-12全体 | GitHub | 承認済みO-12基準文書 | `docs/o12-local-first-cloud-exit-plan.md` |
| `EV-PROGRESS-001` | O-12全体 | GitHub | ChatGPT/Codex分担・進捗ルール | この文書 |
| `EV-O12A-GH-001` | O-12a | GitHub | local server、Cloud API、Firebase、Firestore schema/dependency一次監査 | repository `master` |
| `EV-O12A-DRIVE-001` | O-12a | Google Drive | `Health Auto Export/Sleep` raw経路と最新JSON | connected Drive read-only audit |
| `EV-O12A-PUBLIC-001` | O-12a | official docs | Cloud inventory/shutdown、Tailscale Serve前提 | read-only audit |
| `EV-O12A-CX-001` | O-12a | Codex | Git/runtime/schema確認と残blocker特定 | user-provided `CX-O12A-001` result |
| `EV-O12B-CONTRACT-001` | O-12b | GitHub | Processed Data Contract静的設計 | `docs/o12-processed-data-contract.md` |
| `EV-O12B-SCHEMA-001` | O-12b | GitHub/Codex | machine-readable schema存在 + JSON構文PASS | `docs/o12-processed-data-schema.json` |
| `EV-O12B-STATIC-001` | O-12b | GitHub code | source integration / overlap / block classification差異 | `src/lib/analysis/*`, `cloud-api/src/lib/*` |

raw health data、secret、token、OAuth credential、tailnet-sensitive情報、不要なBilling/account識別情報はcommitしません。

## 10. 判断・ブロッカーログ

| 日付 | Phase | 種別 | 判断またはブロッカー | 担当 | 対応 |
| --- | --- | --- | --- | --- | --- |
| 2026-08-23 | O-12全体 | Decision | 監査・計画は原則ChatGPT、Codexはlocal実行だけに最小化 | ChatGPT | 有効 |
| 2026-08-23 | O-12全体 | Decision | ChatGPTとCodex双方の進捗をこの文書で管理 | ChatGPT | 有効 |
| 2026-08-23 | O-12全体 | Decision | ChatGPTは1フェーズ先の安全なPREPARATIONを並行可能 | ChatGPT | Exit Gateは順番維持 |
| 2026-08-23 | O-12a | Result | `CX-O12A-001` はGit/runtime/schemaを確認したがGCP/local path/Tailscaleは未取得 | ChatGPT | PARTIAL PASS / BLOCKED |
| 2026-08-23 | O-12a | Decision | 同じCodex監査を丸ごと再実行しない | ChatGPT | 再確認範囲を3カテゴリへ縮小 |
| 2026-08-23 | O-12a | Decision | GCP CLI未導入N100へ監査だけのためCLIを入れることを既定路線にしない | ChatGPT | 既存認証済みCloud Shell等を優先 |
| 2026-08-23 | O-12a | Blocker | GCP resource/Billingの現在実在状態が未確認 | ChatGPT | authenticated control-plane監査が必要 |
| 2026-08-23 | O-12a | Blocker | N100のDrive mount/server-data実pathが未確認 | Codex/local | 必要時 `CX-O12A-002` |
| 2026-08-23 | O-12a | Blocker | Tailscale runtime state未確認 | Codex/local | CLIに固執せずWindows service状態で確認可能 |
| 2026-08-23 | O-12b | Decision | Processed Dataはcompleted/versioned snapshot + JSON/JSONLで公開 | ChatGPT | contract draftへ反映 |
| 2026-08-23 | O-12b | Decision | `complete.json` を最終markerとし未完成snapshotをconsumerが読まない | ChatGPT | contract draftへ反映 |
| 2026-08-23 | O-12b | Decision | UI固有score/actionはProcessed Dataから分離 | ChatGPT | Sleep Compass側で計算 |
| 2026-08-23 | O-12b | Decision | source integrationはSleep Compass UI preferenceから独立させる | ChatGPT | O-12c refactor要件 |

## 11. 現在の次の作業

### ChatGPT

1. `CX-O12A-001` の確定済み結果は再確認しない。
2. GCP control-plane監査を、N100への追加installを避けたauthenticated環境で取得する方法を優先する。
3. local filesystem / Tailscale確認が本当にO-12a Exit Gateに必要な最小項目だけ `CX-O12A-002` として発行する。
4. 残監査が揃い次第O-12a Exit Gateを判定する。
5. O-12a COMPLETE後、O-12b契約をfinal reviewし、静的に十分なら追加CodexなしでO-12b Exit Gateを判定する。

### Codex

**現時点では追加依頼を発行しない。**

`CX-O12A-002` は必要性をChatGPTが確認した場合のみ発行する。

### GCP監査の推奨経路

N100に `gcloud` を監査目的だけでinstallする代わりに、既存のGoogle Cloudアカウントで利用できる **Cloud Shell** を優先候補とする。Cloud ShellはGoogle Cloud CLI等がプリインストールされ、認証済み環境として利用できるため、N100環境を変更せずread-only inventoryを取得できる。

O-12aがCOMPLETEになるまではO-12bをCOMPLETEにせず、O-12cのcode変更には進みません。
