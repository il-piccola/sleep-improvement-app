# O-12 作業進捗管理

状態: **O-12a CODEX NEEDED / O-12b PREPARATION（静的設計ほぼ完了）**  
基準文書: [`o12-local-first-cloud-exit-plan.md`](./o12-local-first-cloud-exit-plan.md)  
O-12b契約ドラフト: [`o12-processed-data-contract.md`](./o12-processed-data-contract.md)  
O-12b JSON Schema: [`o12-processed-data-schema.json`](./o12-processed-data-schema.json)  
主フェーズ: **O-12a — 現状監査**  
並行準備: **O-12b — Processed Data Contract**  
次の担当: **Codex（O-12a最小read-only確認） / ChatGPT（Codex結果受領後にO-12aレビュー → O-12b最終確定）**  
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

## 3. ステータス定義

- **NOT STARTED** — 未着手
- **PREPARATION** — 前フェーズ待ちの間にChatGPTが安全な先行準備を実施中
- **CHATGPT WORKING** — ChatGPT側の監査・分析・文書作業中
- **CODEX NEEDED** — ChatGPTで絞り込み済みで、残りがlocal確認のみ
- **CODEX RUNNING** — 限定Codex作業を依頼済み
- **REVIEW** — ChatGPTが結果・証拠を確認中
- **BLOCKED** — ブロッカー解消まで進められない
- **COMPLETE** — Exit Gate通過、証拠記録済み

証拠なしでフェーズをCOMPLETEにしません。

## 4. Stage / Phase 作業分担

| Stage | Phase | ChatGPT主担当 | Codex最小担当 | 状態 |
| --- | --- | --- | --- | --- |
| **1 Inventory** | **O-12a 現状監査** | GitHub/code/Drive監査、dependency map、公開仕様、GCP/N100結果レビュー | N100 local情報とread-only `gcloud`/Tailscale/runtime確認 | **CODEX NEEDED** |
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

#### ChatGPT

- [x] GitHub `master`、現行code、docs、dependency、Cloud/Firebase参照を監査
- [x] 既存local server構成を監査
- [x] 接続済みGoogle Driveをread-only監査
- [x] Cloud dependency / resource確認表を作成
- [x] Google Cloud / Tailscale公開仕様を必要範囲で再確認
- [x] 未確認事項を最小Codex read-only確認へ集約
- [ ] `CX-O12A-001` 結果をレビュー・分類
- [x] 一次監査結果を記録

#### ChatGPT一次監査で確認済み

**Google Drive**

- `Health Auto Export` folderが存在する。
- その配下に `Sleep` folderが存在する。
- 2026-08-23までの日付付きHealth Auto Export JSONを確認した。
- 接続検索では `normalized-sleep-records.json`、`export.xml`、`Sleep Compass` folderは確認できなかった。
- Drive connector制約により全履歴件数・最古fileはN100 local一覧へ限定委任する。

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
- 既知Cloud Run: `sleep-improvement-api`, `sleep-improvement-drive-sync-api`。
- 既知Scheduler: `sleep-drive-sync-daily`。
- Firestore監査対象は少なくとも `sleep_records`, `processed_drive_files`, `drive_sync_runs`, `health_metric_records`, `ingest_batches`, `metric_audit_summaries`。
- health metrics / sleep-window metrics / metric auditはProcessorへ回収対象。

**Web**

- Firebase Auth / ID TokenをCloud API認証に使用。
- 主要Cloud read: `import-status`, `unified-timeline`, `drive-sync-status`, `sleep-health-context`。
- 月表示: `unified-timeline?month=...`。
- manual Drive sync: `POST /api/drive-sync`。

**既存データ契約**

- `DATA_CONTRACT.md` は分析入力を `SleepRecord[]` に統一。
- Health Auto Export JSON / Apple Health XMLを互換inputとして扱う。

#### Codex

- [ ] `CX-O12A-001` を実行
- [ ] Cloud / Firestore data / Drive data / repo / Tailscale設定を変更しない
- [ ] APIを有効化しない
- [ ] Firestore document本文を読まない
- [ ] Billingを変更しない

**Exit Gate:** Cloud / Billing / Firestore / Drive / local / host inventoryがO-12b確定に十分で、重要な未説明resource/data categoryがないこと。

**現在:** Codex read-only実機確認待ち。

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
- [x] source integration / overlap / block classificationを現行codeと静的比較
- [ ] O-12a Codex結果を反映し、暫定項目を確定
- [ ] final review後にPREPARATION表記を外す

#### O-12b成果物

- `docs/o12-processed-data-contract.md`
- `docs/o12-processed-data-schema.json`

#### 現在のcanonical案

snapshotは次のcompleted/versioned directoryを単位とする。

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

主な設計:

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

#### 静的レビューで確認した実装差異

1. **source integrationがUI設定へ依存**
   - 現行 `buildUnifiedSleepTimeline` は `SleepSourcePreferenceMap` を直接使用する。
   - O-12ではData ProcessorがSleep Compass UIなしで動く必要がある。
   - canonical Processorではsource integration policyをstandalone config/policyへ分離する。
   - Sleep Compassの一時的なUI設定をcanonical Processed Dataへ暗黙反映しない。

2. **overlap threshold**
   - 現行 `FULL_DUPLICATE_OVERLAP_RATIO = 0.8`。
   - 現行 `PARTIAL_OVERLAP_RATIO = 0.3`。
   - 最終contractではこれらをprocessing provenanceへ含めるか、policy versionから一意に追跡できることを必須とする。

3. **block ID**
   - 現行Web block IDはarray index由来の `sleep-block-N`。
   - O-12 canonical IDには不適切。
   - source record IDs / sleep day / time等からdeterministic IDへ変更する。

4. **WebとCloudのblock分類差**
   - Webはconfigurable `mergeGapMinutes`, `napCandidateMaxMinutes`, evening window等を使用。
   - Cloud sleep-window aggregatorは固定値を含む。
   - Cloud側の現行main判定は処理対象全体の最長blockを選ぶため、multi-day canonical ruleにはそのまま採用しない。
   - canonical案は **sleep dayごとの最長blockをmain** とし、sleep blockとsleep-window metricが同じprocessing configを共有する。

5. **客観データとアプリ解釈の分離**
   - `SleepDaySummary` のobjective fieldsはProcessed Dataへ移す。
   - fragmentation / circadian score / improvement action / UI messageはSleep Compass側へ残す。

#### Codex

現時点では **O-12b用Codex依頼なし**。

JSON Schemaと契約設計はChatGPT側で作成済み。O-12a結果反映後、静的検証で不足がある場合のみ小規模fixture/prototype testをCodexへ依頼する。

**Exit Gate:** versioned contract、migration rule、schema、test caseが確定し、Data Processor/外部appから利用可能であること。O-12aがCOMPLETEであることも必要。

### O-12c — Processor独立化

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

ChatGPT:

- [ ] atomic snapshot / corruption behavior
- [ ] portable path/fingerprint semantics
- [ ] raw input / processed output separation
- [ ] Drive snapshot publication
- [ ] retention/recovery test
- [ ] implementation evidence review

Codex:

- [ ] configurable path
- [ ] drive-letter identity除去
- [ ] atomic/versioned snapshot + recovery
- [ ] ledger 500件上限撤廃
- [ ] unchanged-file hash最適化
- [ ] processed outputをraw scanから除外
- [ ] watcher + rescan + Drive snapshot copy test

**Exit Gate:** persistence、portability、dedupe、watcher/rescan、recovery、Drive backupがtestを通る。

### O-12e — 既存データ移行

ChatGPT:

- [ ] Rebuild / Migrate / Archive分類
- [ ] migration adapter / manifest確定
- [ ] Firestore-only保存対象特定
- [ ] count/reject/checksum/reconstruction review
- [ ] unexplained重要dataがあればCloud削除block

Codex:

- [ ] approved sourceへmigration/rebuild実行
- [ ] 必要最小限Firestore read/export
- [ ] clean-room reconstruction
- [ ] concise count/error/checksum返却

**Exit Gate:** 全重要履歴がRebuild/Migrate/Archiveで保全され、clean-room再構築成功。

### O-12f — Sleep Compass独立化

ChatGPT:

- [ ] Web/APIのFirestore/Cloud endpoint依存確定
- [ ] Processed Data-backed API contract
- [ ] current Web UI minimum parity
- [ ] bounded implementation instruction
- [ ] diff/response parity review

Codex:

- [ ] local API/storage変更
- [ ] Firestore dependency除去
- [ ] targeted API/build/test

**Exit Gate:** Sleep CompassがProcessed Dataから動作しlocal app pathにCloud persistence依存がない。

### O-12g — Local Web + Tailscale

ChatGPT:

- [ ] same-origin設計
- [ ] localhost-only bind
- [ ] Firebase Auth除去点
- [ ] Tailscale Serve仕様確認
- [ ] runtime evidence review

Codex:

- [ ] React + `/api/*` local配信
- [ ] localhost-only確認
- [ ] Tailscale Serve設定・試験
- [ ] tailnet device access確認
- [ ] Funnel不使用

**Exit Gate:** same-origin、localhost-only、Firebase AuthなしでTailscale利用可能。

### O-12h — 並行検証・復旧試験

ChatGPT:

- [ ] Cloud/local comparison matrix
- [ ] current/latest/month/blocks/stages/sources/metrics/diagnostics/status review
- [ ] duplicate/retry/restart/recovery review
- [ ] parity判定

Codex:

- [ ] prescribed comparison/testのみ
- [ ] new-file/reprocess/failure retry/restart/clean-room reconstruction
- [ ] concise evidence

**Exit Gate:** required parity/recovery test成功、差異が理解・承認済み。

### O-12i — Cloud運用停止

ChatGPT:

- [ ] O-12h complete確認
- [ ] smallest reversible Cloud stop
- [ ] exact action / rollback
- [ ] user明示承認
- [ ] post-stop local-only review

Codex:

- [ ] 承認済みstopのみ
- [ ] verification
- [ ] Firestore等を削除しない

**Exit Gate:** Cloud自動処理停止後もlocal pipelineのみで新規raw dataを処理できる。

### O-12j — Cloud完全撤去

ChatGPT:

- [ ] resource/Billing/migration再監査
- [ ] required data保全確認
- [ ] dedicated project確認
- [ ] final disable/shutdown順序・rollback限界
- [ ] destructive action明示承認
- [ ] completion review

Codex:

- [ ] local credentialが必要な承認済みcommandのみ
- [ ] approved sequenceでresource/Billing停止
- [ ] gate承認後だけproject shutdown
- [ ] final evidence

**Exit Gate:** Cloud runtime依存なし、必要data保全済み、Billing無効化、適切なproject shutdown完了。

## 6. ChatGPT進捗ログ

| 作業ID | 日付 | Phase | 状態 | 作業 | 結果 / 次の扱い |
| --- | --- | --- | --- | --- | --- |
| `GPT-O12A-001` | 2026-08-23 | O-12a | **COMPLETE** | GitHub `master`、local server、Cloud API、Firebase/Firestore依存監査 | 主要dependencyとlocal migration seamを特定 |
| `GPT-O12A-002` | 2026-08-23 | O-12a | **COMPLETE** | connected Drive read-only監査 | `Health Auto Export/Sleep` と最新JSON確認。全履歴はCodexへ限定委任 |
| `GPT-O12A-003` | 2026-08-23 | O-12a | **COMPLETE** | Web Cloud API/Firebase Auth依存監査 | O-12f minimum parity対象を特定 |
| `GPT-O12A-004` | 2026-08-23 | O-12a | **COMPLETE** | Firestore category / Cloud運用履歴論点整理 | O-12e分類対象を確定 |
| `GPT-O12A-005` | 2026-08-23 | O-12a | **COMPLETE** | N100/GCP残未知をCodex 1回へ集約 | `CX-O12A-001` READY |
| `GPT-O12B-PREP-001` | 2026-08-23 | O-12b | **COMPLETE** | existing `DATA_CONTRACT.md`、local/Cloud schema比較 | Processed Dataへの継承/分離方針を確定 |
| `GPT-O12B-PREP-002` | 2026-08-23 | O-12b | **COMPLETE** | Processed Data Contractドラフト作成 | `docs/o12-processed-data-contract.md` を作成 |
| `GPT-O12B-PREP-003` | 2026-08-23 | O-12b | **COMPLETE** | canonical snapshot、versioning、provenance、publication、retention、migration manifest、test case設計 | O-12b主要設計を静的に完了 |
| `GPT-O12B-PREP-004` | 2026-08-23 | O-12b | **COMPLETE** | machine-readable JSON Schema作成 | `docs/o12-processed-data-schema.json` を作成 |
| `GPT-O12B-PREP-005` | 2026-08-23 | O-12b | **COMPLETE** | source integration / overlap / block classificationを現行codeとcross-check | UI preference依存、80%/30% overlap、block ID、Cloud/Web分類差を特定 |

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

| 依頼ID | Phase | 状態 | 目的 | Codex範囲 | 結果/証拠 | ChatGPTレビュー |
| --- | --- | --- | --- | --- | --- | --- |
| `CX-O12A-001` | O-12a | **READY** | N100/GCPでしか確認できない残項目を1回でread-only取得 | local Git/runtime/path/Tailscale + GCP control-plane metadata | 未実行 | 未レビュー |

### CX-O12A-001 — Codex正式依頼

```text
依頼ID: CX-O12A-001
フェーズ: O-12a 現状監査
目的: ChatGPTから直接確認できないN100ローカル状態とGoogle Cloud control-plane metadataだけを、1回のread-only確認で取得する。

前提:
- repository: sleep-improvement-app
- Google Cloud project: sleep-improvement-cloud
- 監査・設計・公開仕様確認はChatGPT側で完了済み
- architecture分析や長い説明は不要

対象:
1. local Git
   - git status --short --branch
   - git log -5 --oneline --decorate
   - git remote -v
   - git branch -vv

2. N100 runtime
   - node --version
   - npm --version
   - OS/versionを1行

3. local path/data
   - `.env.local` があれば全文を表示せず `HEALTH_EXPORT_WATCH_DIR` の解決後pathだけ確認
   - `server-data` 実path
   - raw watch directory配下 `*.json` のcontentを読まず、件数 / 最古file名 / 最新file名
   - `server-data/health-store.json` があればhealth value/source valueを表示せず records件数 / importHistory件数
   - `server-data/processed-files.json` があれば内容値を表示せず files件数 / status別件数

4. Tailscale
   - tailscale version
   - IP/device/tailnet名を返さず BackendState / Self online true-false
   - ServeはURL/hostnameを返さず configured / not configured

5. Google Cloud control-plane metadata (`sleep-improvement-cloud`)
   - active gcloud authの有無。account文字列は返さない
   - configured project ID
   - project lifecycleState
   - billingEnabled true/false
   - Cloud Run service name + region
   - Cloud Scheduler job name + region/state
   - Artifact Registry repository name + format + region
   - Firestore database ID + location + type。documentは読まない
   - Secret Manager secret名一覧
   - Cloud Storage bucket名一覧
   - service account件数のみ
   - relevant enabled API要約
   - Cloud Asset Inventory APIが既に有効かつ権限ありの場合のみ assetType別件数。無効なら有効化せず未実行
   - firebase CLIが既に導入/認証済みならHosting site名。install/loginしない

禁止事項:
- git pull / reset / checkout / clean / commit / push
- repo file変更
- Cloud resource作成・変更・停止・削除
- API enable/disable
- Billing変更
- Firestore document read/query/export
- Google Drive file内容の読み取り・変更・削除
- Tailscale設定変更、Serve/Funnel変更
- package install / npm install / npx download
- secret/token/OAuth credential/.env全文表示
- IP/tailnet名/device名表示
- raw health data、health metric value、sleep time/value、source名表示

失敗時は設定を変更せず、その項目だけBLOCKEDとして報告する。

返却形式:
依頼ID: CX-O12A-001
結果: PASS / FAIL / BLOCKED
ローカルGit: branch / clean-or-dirty / ahead-behind / remote概要
Runtime: OS / node / npm
Paths: watch path / server-data path
Raw files: count / earliest filename / latest filename
Local state: health-store records count / importHistory count / processed-files count / status counts
Tailscale: version / BackendState / Self online / Serve configured yes-no
GCP: project state / billingEnabled / Run services / Scheduler jobs / Artifact repos / Firestore DB metadata / Secrets / Buckets / service-account count / relevant enabled APIs / AssetType counts or CAI未実行理由 / Firebase Hosting site名または未確認理由
変更: なし
エラー/ブロッカー: ある場合だけ簡潔に
Commit SHA: なし
```

## 9. 証拠台帳

| Evidence ID | Phase | Source | 証明する内容 | Location / reference |
| --- | --- | --- | --- | --- |
| `EV-BASELINE-001` | O-12全体 | GitHub | 承認済みO-12基準文書 | `docs/o12-local-first-cloud-exit-plan.md` |
| `EV-PROGRESS-001` | O-12全体 | GitHub | ChatGPT/Codex分担・進捗ルール | この文書 |
| `EV-O12A-GH-001` | O-12a | GitHub | local server、Cloud API、Firebase、Firestore schema/dependency一次監査 | repository `master` |
| `EV-O12A-DRIVE-001` | O-12a | Google Drive | `Health Auto Export/Sleep` raw経路と最新JSON | connected Drive read-only audit |
| `EV-O12A-PUBLIC-001` | O-12a | official docs | Cloud inventory/shutdown、Tailscale Serve前提 | read-only audit |
| `EV-O12A-CX-001` | O-12a | Codex | N100/GCP残監査 | `CX-O12A-001` 実行後 |
| `EV-O12B-CONTRACT-001` | O-12b | GitHub | Processed Data Contractの静的設計 | `docs/o12-processed-data-contract.md` |
| `EV-O12B-SCHEMA-001` | O-12b | GitHub | machine-readable contract schema | `docs/o12-processed-data-schema.json` |
| `EV-O12B-STATIC-001` | O-12b | GitHub code | source integration / overlap / block classificationの現行差異を確認 | `src/lib/analysis/*`, `cloud-api/src/lib/*` |

raw health data、secret、token、OAuth credential、tailnet-sensitive情報、不要なBilling/account識別情報はcommitしません。

## 10. 判断・ブロッカーログ

| 日付 | Phase | 種別 | 判断またはブロッカー | 担当 | 対応 |
| --- | --- | --- | --- | --- | --- |
| 2026-08-23 | O-12全体 | Decision | 監査・計画は原則ChatGPT、Codexはlocal実行だけに最小化 | ChatGPT | 有効 |
| 2026-08-23 | O-12全体 | Decision | ChatGPTとCodex双方の進捗をこの文書で管理 | ChatGPT | 有効 |
| 2026-08-23 | O-12全体 | Decision | ChatGPTは1フェーズ先の安全なPREPARATIONを並行可能 | ChatGPT | Exit Gateは順番維持 |
| 2026-08-23 | O-12a | Decision | 残りを `CX-O12A-001` 1回read-only確認へ集約 | ChatGPT | Codex実行待ち |
| 2026-08-23 | O-12a | Safety | Firestore document read / Billing変更を監査に含めない | ChatGPT | 課金・data変更回避 |
| 2026-08-23 | O-12b | Decision | Processed Dataはcompleted/versioned snapshot + JSON/JSONLで公開 | ChatGPT | contract draftへ反映 |
| 2026-08-23 | O-12b | Decision | `complete.json` を最終markerとし、未完成snapshotはconsumerが読まない | ChatGPT | contract draftへ反映 |
| 2026-08-23 | O-12b | Decision | UI固有score/actionはProcessed Dataから分離 | ChatGPT | Sleep Compass側で計算 |
| 2026-08-23 | O-12b | Decision | source integrationはSleep Compass UI preferenceから独立させる | ChatGPT | O-12c refactor要件 |
| 2026-08-23 | O-12b | Decision | canonical main sleepはsleep dayごとの最長blockを基本案とする | ChatGPT | final reviewで確定 |
| 2026-08-23 | O-12b | Safety | O-12中はDrive完成snapshotをProcessorが自動削除しない | ChatGPT | data preservation優先 |

## 11. 現在の次の作業

### Codex

**`CX-O12A-001` のみ実行する。**

### ChatGPT

O-12bの静的設計はほぼ完了しているため、次は `CX-O12A-001` の結果受領後に:

1. O-12a結果をreviewする。
2. O-12a Exit Gateを判定する。
3. local/GCP実在状態をO-12b legacy/migration対象へ反映する。
4. Processed Data ContractとJSON Schemaをfinal reviewする。
5. 必要ならO-12bだけの小さなschema/fixture testをCodexへ依頼する。静的に十分ならCodexを使わない。
6. O-12b Exit Gateを判定する。

**O-12aがCOMPLETEになるまではO-12bをCOMPLETEにせず、O-12cのcode変更へは進みません。**
