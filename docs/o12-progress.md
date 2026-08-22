# O-12 作業進捗管理

状態: **CODEX NEEDED**  
基準文書: [`o12-local-first-cloud-exit-plan.md`](./o12-local-first-cloud-exit-plan.md)  
現在のフェーズ: **O-12a — 現状監査**  
次の担当: **Codex（最小read-only確認）**  
最終更新日: **2026-08-23**

この文書は、O-12の実作業を管理する中心文書です。各フェーズの進捗、ChatGPTとCodexの分担、証拠、ブロッカー、ChatGPT ↔ Codex間の依頼と結果を管理します。

O-12の目的・アーキテクチャ・フェーズゲート・完了条件は基準文書で定義します。この文書と基準文書が矛盾した場合は、**基準文書を優先します。**

今後の進捗記録、Codex依頼、Codex返答、ChatGPTレビュー、証拠記録は**日本語を標準**とします。コマンド名、API名、ファイル名、エラー原文などは正確性のため英語のまま記録して構いません。

## 1. 作業モデル

O-12は **ChatGPT優先・Codex最小化** で進めます。

### ChatGPTを主担当とする

接続済みサービス、GitHub、Google Drive、公開ドキュメント、既存レポート、Codex出力から実施できる作業は原則ChatGPTが担当します。

ChatGPTの担当:

- プロジェクト計画とフェーズ管理
- GitHub・コード・文書監査
- 接続済みGoogle Driveから確認可能なデータ監査
- 公開サービスの仕様・料金・ポリシー確認
- Cloud依存分析
- Firestoreデータ分類設計
- Processed Data Contract設計・レビュー
- 移行戦略・検証基準・テスト計画
- Codex変更・コマンド出力のレビュー
- 進捗・証拠の記録
- フェーズ完了判定

**監査はChatGPT担当を原則とします。**

### Codexは実行担当に限定する

Codexは、N100実機、ローカルファイルシステム、ローカルランタイム、ローカル認証情報、`gcloud`、Tailscale CLI、ビルド・テスト、ローカルでの複数ファイル変更など、ChatGPTから直接実行できない作業だけに使います。

CodexにはChatGPTが済ませた調査、設計、公開仕様確認、リポジトリ全体レビューを繰り返させません。

### ユーザー承認が必要な境界

read-only確認は必要に応じてCodexへ委任できます。

以下は、該当フェーズのゲート通過とユーザーの明示承認後にだけ実行します。

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
2. 1回の依頼は1つの限定目的にする。
3. 対話的探索より小さなコマンド一式を優先する。
4. 既知のパス・ファイル・コマンドは具体的に指定する。
5. 調べないこと・変更しないことを明記する。
6. 長文分析ではなく簡潔な事実だけ返してもらう。
7. 過去の出力を再利用し、同じ確認を繰り返さない。
8. 公開ドキュメント調査はChatGPTが行う。
9. Codex結果はChatGPTがレビューして次の作業を決める。
10. ChatGPTだけで安全に完了できる作業ではCodexを呼ばない。

## 3. ステータス定義

- **NOT STARTED** — 未着手
- **CHATGPT WORKING** — ChatGPT側の監査・分析・文書作業中
- **CODEX NEEDED** — ChatGPT側で絞り込み済みで、残りがローカル確認のみ
- **CODEX RUNNING** — 限定されたCodex作業を依頼済み
- **REVIEW** — ChatGPTが結果・証拠を確認中
- **BLOCKED** — ブロッカー解消まで進められない
- **COMPLETE** — Exit Gateを通過し、証拠が記録済み

証拠なしでフェーズをCOMPLETEにしません。

## 4. ステージ / フェーズ作業分担表

| Stage | Phase | ChatGPTの主担当 | Codexの最小担当 | 状態 |
| --- | --- | --- | --- | --- |
| **1 Inventory** | **O-12a 現状監査** | GitHub/コード/Drive監査、依存関係整理、公開情報確認、GCP/N100結果分析 | N100ローカル情報とread-only `gcloud`/Tailscale/ランタイム確認のみ | **CODEX NEEDED** |
| **2 Contract** | **O-12b Processed Data Contract** | 契約、version、互換性、provenance、移行ルール設計・レビュー | 必要な場合だけ小規模ローカル試験 | **NOT STARTED** |
| **3 Processor** | **O-12c Processor独立化** | 結合箇所分析、リファクタ設計、diff/testレビュー | 限定リファクタと対象テスト | **NOT STARTED** |
| **3 Processor** | **O-12d Processor堅牢化** | 保存/fingerprint/path/backup仕様、テスト設計、レビュー | filesystem/watcher/snapshot/Drive copy実装・試験 | **NOT STARTED** |
| **4 Migration** | **O-12e 既存データ移行** | データ分類、adapter/manifest設計、移行証拠レビュー | ローカルmigration/reconstructionと必要最小限のCloud read/export | **NOT STARTED** |
| **5 Local runtime** | **O-12f Sleep Compass独立化** | Cloud/API依存分析、ローカル置換設計、parityレビュー | ローカルコード変更とbuild/test | **NOT STARTED** |
| **5 Local runtime** | **O-12g Local Web + Tailscale** | same-origin/localhost/access設計、設定レビュー | N100上でlocal server/Tailscale Serve確認 | **NOT STARTED** |
| **5 Local runtime** | **O-12h 並行検証・復旧試験** | 比較項目定義、証拠比較、gate判定 | 指定されたlocal/restart/reconstruction試験 | **NOT STARTED** |
| **6 Cloud exit** | **O-12i Cloud運用停止** | gate確認、最小可逆停止計画、停止後レビュー | 明示承認されたCloud停止操作のみ | **NOT STARTED** |
| **6 Cloud exit** | **O-12j Cloud完全撤去** | 最終resource/Billing/data監査、撤去順序、完了確認 | 明示承認済みBilling/project/resource操作のみ | **NOT STARTED** |

## 5. フェーズ詳細

### O-12a — 現状監査

#### ChatGPT作業

- [x] GitHub `master`、現行コード、文書、依存関係、Cloud/Firebase参照を監査
- [x] リポジトリコードから既存ローカルserver構成を監査
- [x] 接続済みGoogle Driveから原本供給経路と既存資産を可能な範囲で監査
- [x] コード・既存文書からCloud依存 / resource確認表を作成
- [x] Google Cloud / Tailscaleの公開仕様を必要範囲で再確認
- [x] 未確認事項を最小のN100/Codex read-only確認へ絞り込み
- [ ] Codex結果をレビュー・分類
- [x] 一次監査結果をこの文書へ記録

#### 一次監査で確認した事実

**Google Drive**

- 接続済みDriveに `Health Auto Export` フォルダが存在する。
- その直下に `Sleep` フォルダが存在する。
- `Sleep` フォルダでは2026-08-23までの日付付きHealth Auto Export JSONが確認でき、原本供給経路は継続している。
- 接続検索では正確な名前 `normalized-sleep-records.json` は確認できなかった。
- 接続検索では正確な名前 `export.xml` は確認できなかった。
- 接続検索では `Sleep Compass` という名前のDriveフォルダは確認できなかった。
- Driveコネクタの一覧/検索制約により、Sleepフォルダの全履歴件数と最古ファイルはN100ローカル一覧で確認する。

**既存ローカル経路**

- `server/server.ts` が既にローカルHTTP APIとHealth Auto Export watcherを提供している。
- 現在のローカルserverは起動時にwatcherを開始し、`0.0.0.0`へbindしている。
- `server/importHealthExports.ts` はparse/audit/normalize後に `mergeAndAnalyzeSleepRecords` を直接呼ぶため、Data ProcessorとSleep Compass分析はまだ完全分離されていない。
- `server/config.ts` には旧Windowsドライブレターを含む既定watch pathが残り、`dataDir`も環境変数化されていない。
- `health-store.json` と `processed-files.json` は直接上書きで、読み込み失敗時は空状態へ落ちる。
- processed-file台帳は500件で切られ、現在のfingerprintはファイル全体を読みSHA-256を計算する。
- watcherはJSONを再帰走査するため、将来のprocessed backup出力はraw watch rootから分離・除外する必要がある。

**Cloud / Firebase経路**

- Firebase既定project設定は `sleep-improvement-cloud`。
- Firebase Hostingは `dist` を配信する設定が残る。
- Cloud APIはNode HTTP serverとして実装され、FirestoreはApplication Default Credentialsを使う。
- 既知のCloud Run service名として `sleep-improvement-api` と `sleep-improvement-drive-sync-api` が文書に記録されている。
- 既知のCloud Scheduler jobとして `sleep-drive-sync-daily` が文書に記録されている。
- コード上のFirestore監査対象には少なくとも次がある。
  - `sleep_records`
  - `processed_drive_files`
  - `drive_sync_runs`
  - `health_metric_records`
  - `ingest_batches`
  - `metric_audit_summaries`
- `sleep_records` の本体データと、server timestamp / sync run / ingest batchなどCloud運用履歴は分けて移行分類する必要がある。
- Cloud側には睡眠レコードだけでなくhealth metrics、sleep-window metrics、metric audit処理があり、O-12cでProcessor側へ回収対象となる。

**Web依存**

- WebはFirebase Auth / Firebase ID TokenをCloud API認証に使っている。
- 現行Webの主要Cloud read依存は `import-status`、`unified-timeline`、`drive-sync-status`、`sleep-health-context`。
- 月表示は `unified-timeline?month=...` を使う。
- 手動Drive同期は認証付き `POST /api/drive-sync`。
- O-12fはまず現行Webが必要なresponse shapeをローカルAPIへ提供することを優先できる。

**既存データ契約**

- 現行 `DATA_CONTRACT.md` は分析入力を `SleepRecord[]` に統一している。
- Health Auto Export JSONとApple Health XMLは互換入力として扱える。
- O-12bでは既存契約を捨てず、Data Processorが外部へ公開するversioned Processed Data Contractへ拡張する方針が妥当。

**公開仕様の再確認**

- Cloud Asset Inventoryのresource searchだけでは全resource typeを保証できないため、Billingと既知service個別一覧を併用する。
- Google Cloud project shutdownには復元可能期間があるが、O-12jまで実行しない。
- Tailscale Serveはlocal serviceをtailnet内へ公開する設計に適合し、最終backendはlocalhost bindを前提とする。

#### Codex作業

- [ ] `CX-O12A-001` を実行し、N100/GCPの未確認事項だけを報告
- [ ] Cloud、Firestore data、Drive data、repo file、Tailscale設定を変更しない
- [ ] APIを有効化しない
- [ ] Firestore document本文を読み取らない
- [ ] Billingを変更しない

**Exit Gate:** Cloud / Billing / Firestore / Drive / local / host inventoryがO-12b設計に十分で、重要な未説明resource/data categoryが残っていないこと。

**現在の判定:** Codexのread-only実機確認待ち。

### O-12b — Processed Data Contract

ChatGPT:

- [ ] canonical datasetとformatを定義
- [ ] `schemaVersion` / `processorVersion` / `generatedAt` / provenanceを定義
- [ ] sleep-day設定provenanceを定義
- [ ] legacy reader互換policyを定義
- [ ] snapshot公開・保持ruleを定義
- [ ] migration manifestを定義
- [ ] existing raw/local/Cloud schemaと比較
- [ ] contract test caseを作成

Codex:

- [ ] 静的検証で不足する場合のみ小規模fixture/prototype test

**Exit Gate:** versioned contractとmigration ruleが文書化・test可能で、Data Processorと外部appから利用できる。

### O-12c — Processor独立化

ChatGPT:

- [ ] importer / `healthStore` / API / React / Cloud処理の結合点を確定
- [ ] Processor Core boundary/interfaceを定義
- [ ] Cloudから回収するhealth metrics / sleep-window処理を確定
- [ ] file単位の実装指示を作成
- [ ] Codex diff/testをレビュー

Codex:

- [ ] reviewed refactorをlocal適用
- [ ] direct one-shot処理を追加・確認
- [ ] watcherを同じcoreのwrapperにする
- [ ] targeted test/buildのみ実行

**Exit Gate:** ProcessorがSleep Compass Web/API、Firebase、Cloud Run、Firestore、Tailscale、Google Drive APIなしで動く。

### O-12d — Processor堅牢化

ChatGPT:

- [ ] atomic snapshot / corruption behaviorを定義
- [ ] portable path/fingerprint semanticsを定義
- [ ] raw input / processed output separationを定義
- [ ] Drive processed snapshot publication ruleを定義
- [ ] retention/recovery testを定義
- [ ] 実装証拠をレビュー

Codex:

- [ ] configurable path実装
- [ ] absolute path / drive-letter identity除去
- [ ] atomic/versioned snapshotとrecovery実装
- [ ] processed ledger 500件上限撤廃
- [ ] unchanged file hash最適化
- [ ] processed outputをraw scanから除外
- [ ] watcher + rescan + Drive snapshot copyをlocal検証

**Exit Gate:** persistence、portability、dedupe、watcher/rescan、recovery、Drive backupが定義試験を通る。

### O-12e — 既存データ移行

ChatGPT:

- [ ] dataをRebuild / Migrate / Archiveへ分類
- [ ] migration adapter / manifestを定義
- [ ] Firestore-only保存対象を特定
- [ ] count/reject/checksum/reconstruction evidenceをレビュー
- [ ] unexplained重要dataがあればCloud削除をblock

Codex:

- [ ] approved sourceへmigration/rebuild tool実行
- [ ] 他手段で取得できないFirestore dataだけ必要最小限read/export
- [ ] clean-room reconstruction実行
- [ ] count/error/checksumだけ簡潔に返す

**Exit Gate:** 全重要履歴がRebuild / Migrate / Archiveのいずれかで保全され、clean-room再構築が成功する。

### O-12f — Sleep Compass独立化

ChatGPT:

- [ ] Web/APIのFirestore/Cloud endpoint依存を確定
- [ ] Processed Data-backed API contractを定義
- [ ] current Web UIが必要なminimum parityを確定
- [ ] bounded implementation instructionを作成
- [ ] diff/response parityをレビュー

Codex:

- [ ] local API/storage変更
- [ ] local pathからFirestore依存除去
- [ ] targeted API/build/test

**Exit Gate:** Sleep CompassがProcessed Dataから動作し、local app pathにCloud persistence依存がない。

### O-12g — Local Web + Tailscale

ChatGPT:

- [ ] same-origin frontend/API設計レビュー
- [ ] localhost-only bindレビュー
- [ ] Firebase Auth除去点を定義
- [ ] Tailscale Serve公式仕様確認
- [ ] runtime evidenceレビュー

Codex:

- [ ] React + `/api/*` local配信
- [ ] localhost-only bind確認
- [ ] N100でTailscale Serve設定・試験
- [ ] approved tailnet端末からaccess確認
- [ ] Funnelを使わない

**Exit Gate:** same-origin、localhost-onlyで動作し、Firebase AuthなしでTailscaleから利用できる。

### O-12h — 並行検証・復旧試験

ChatGPT:

- [ ] Cloud/local比較matrixを定義
- [ ] current/latest/month/blocks/stages/sources/metrics/diagnostics/statusを比較
- [ ] duplicate/retry/restart/recovery evidenceをレビュー
- [ ] parity差分を判定

Codex:

- [ ] prescribed comparison/test commandだけ実行
- [ ] new-file/reprocess/failure retry/restart/clean-room reconstruction確認
- [ ] concise evidenceを返す

**Exit Gate:** required parity/recovery testが通り、差異が理解・承認される。

### O-12i — Cloud運用停止

ChatGPT:

- [ ] O-12h完了確認
- [ ] smallest reversible Cloud stopを設計
- [ ] exact action/rollbackを提示
- [ ] user明示承認取得
- [ ] stop後local-only evidenceレビュー

Codex:

- [ ] 承認済みstop操作だけ実行
- [ ] prescribed verification実行
- [ ] Firestore等のCloud dataを削除しない

**Exit Gate:** Cloud自動処理停止後も新規raw dataがlocal pipelineのみで正常処理される。

### O-12j — Cloud完全撤去

ChatGPT:

- [ ] resource/Billing/migration再監査
- [ ] required data保全確認
- [ ] dedicated project確認
- [ ] final disable/shutdown順序とrollback limitを設計
- [ ] destructive actionのuser明示承認取得
- [ ] completion evidenceレビュー

Codex:

- [ ] local credentialが必要な明示承認済みcommandのみ実行
- [ ] approved sequenceでresource/Billing停止
- [ ] gate承認後だけdedicated project shutdown
- [ ] concise final evidenceを返す

**Exit Gate:** Google Cloud runtime依存がなく、必要dataが保全され、Billing無効化と適切なproject shutdownが完了する。

## 6. ChatGPT ↔ Codex 引き継ぎルール

Codex作業は発行前または直後にこの文書へ登録します。

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

Codex出力は証拠であり最終判断ではありません。ChatGPTがレビューし、trackerを更新して追加Codex作業の必要性を判断します。

## 7. Codex依頼キュー / やり取り履歴

| 依頼ID | Phase | 状態 | 目的 | Codex範囲 | 結果/証拠 | ChatGPTレビュー |
| --- | --- | --- | --- | --- | --- | --- |
| `CX-O12A-001` | O-12a | **READY** | N100/GCPでしか確認できない残項目を1回でread-only取得 | local Git/runtime/path/TailscaleとGCP control-plane metadataのみ | 未実行 | 未レビュー |

### CX-O12A-001 — Codexへ渡す正式依頼

```text
依頼ID: CX-O12A-001
フェーズ: O-12a 現状監査
目的: ChatGPTから直接確認できないN100ローカル状態とGoogle Cloud control-plane metadataだけを、1回のread-only確認で取得する。

前提:
- リポジトリは sleep-improvement-app。
- Google Cloud projectは sleep-improvement-cloud。
- 監査・設計・公開仕様確認はChatGPT側で完了済み。
- アーキテクチャ分析や長い説明は不要。

対象:
1. ローカルGit
   - git status --short --branch
   - git log -5 --oneline --decorate
   - git remote -v
   - git branch -vv

2. N100 runtime
   - node --version
   - npm --version
   - OS/versionを1行で確認

3. ローカルpath/data
   - .env.localが存在する場合、値全体は表示せず HEALTH_EXPORT_WATCH_DIR の解決後pathだけ確認
   - server-data の実pathを確認
   - raw watch directory配下の *.json を再帰的に数え、ファイル内容は読まずに以下だけ返す
     - JSON file count
     - 最古のfile name
     - 最新のfile name
   - server-data/health-store.json があれば、health value/source valueを表示せず records件数とimportHistory件数だけ返す
   - server-data/processed-files.json があれば、内容値を表示せず files件数とstatus別件数だけ返す

4. Tailscale
   - tailscale version
   - statusはIP、device name、tailnet nameを返さず、BackendStateとSelf onlineのtrue/falseだけ返す
   - Serve設定はURL/hostnameを返さず configured / not configuredだけ返す

5. Google Cloud control-plane metadata
   project=sleep-improvement-cloud としてread-onlyで確認する。
   - active gcloud authがあるか（account文字列は返さない）
   - configured project ID
   - project lifecycleState
   - billingEnabled のtrue/falseだけ
   - Cloud Run serviceの name + region
   - Cloud Scheduler jobの name + region/state（取得できる範囲）
   - Artifact Registry repositoryの name + format + region
   - Firestore databaseの database ID + location + type。documentは読まない
   - Secret Manager secret名一覧
   - Cloud Storage bucket名一覧
   - service accountは件数だけ
   - enabled APIはSleep Compass関連と思われるものだけ要約
   - Cloud Asset Inventory APIが既に有効で権限がある場合だけ search-all-resources を実行し、resource名ではなく assetType別件数を返す
   - Cloud Asset Inventory APIが無効なら有効化せず「未実行」と返す
   - firebase CLIが既に入っていて認証済みなら Hosting site名だけ確認。install/loginはしない

禁止事項:
- git pull / reset / checkout / clean / commit / push
- repo file変更
- Cloud resource作成・変更・停止・削除
- APIの有効化/無効化
- Billing変更
- Firestore document read/query/export
- Google Drive file内容の読み取り・変更・削除
- Tailscale設定変更、Serve/Funnel設定変更
- package install / npm install / npxによるdownload
- secret/token/OAuth credential/.env全文の表示
- IP、tailnet名、device名の表示
- raw health data、health metric value、sleep time/value、source名の表示

コマンドが権限不足・未導入・API無効で失敗した場合は、設定を変更せずBLOCKEDとしてその項目だけ報告する。

返却内容は次の形式だけにする:
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

## 8. 証拠台帳

| Evidence ID | Phase | Source | 証明する内容 | Location / reference |
| --- | --- | --- | --- | --- |
| `EV-BASELINE-001` | O-12全体 | GitHub | 承認済みO-12基準文書が存在 | `docs/o12-local-first-cloud-exit-plan.md` |
| `EV-PROGRESS-001` | O-12全体 | GitHub | ChatGPT/Codex分担・進捗管理ルールが存在 | この文書 |
| `EV-O12A-GH-001` | O-12a | GitHub | local server、Cloud API、Firebase、Firestore schema/依存の一次監査 | repository `master` |
| `EV-O12A-DRIVE-001` | O-12a | Google Drive | `Health Auto Export` / `Sleep` 原本経路と最新JSONの存在を確認 | connected Drive read-only audit |
| `EV-O12A-PUBLIC-001` | O-12a | Google/Tailscale公式docs | Cloud inventory/shutdownとTailscale Serve前提を再確認 | official docs read-only audit |
| `EV-O12A-CX-001` | O-12a | Codex | N100/GCPの残監査 | `CX-O12A-001` 実行後に記録 |

Codex証拠はこの台帳へ要約します。raw health data、secret、token、OAuth credential、tailnet-sensitive情報、不要なBilling/account識別情報はcommitしません。

## 9. 判断・ブロッカーログ

| 日付 | Phase | 種別 | 判断またはブロッカー | 担当 | 対応 |
| --- | --- | --- | --- | --- | --- |
| 2026-08-23 | O-12全体 | Decision | 監査・計画は原則ChatGPT、Codexはlocal実行だけに最小化 | ChatGPT | 有効 |
| 2026-08-23 | O-12全体 | Decision | Codexとのやり取りをこの進捗文書で管理 | ChatGPT | 有効 |
| 2026-08-23 | O-12a | Decision | ChatGPT一次監査完了後、残りを `CX-O12A-001` の1回read-only確認へ集約 | ChatGPT | Codex実行待ち |
| 2026-08-23 | O-12a | Safety | Firestore document readやBilling変更は今回のCodex監査に含めない | ChatGPT | 課金・データ変更を避ける |

## 10. 現在の次の作業

**担当: Codex（`CX-O12A-001` のみ）**

Codex結果を受け取ったらChatGPTが以下を行います。

1. 結果をレビューする。
2. GCP resource / local data / path / runtimeの事実を一次監査と統合する。
3. 不要な追加Codex調査を避ける。
4. O-12a Exit Gateを判定する。
5. 通過できればO-12b Processed Data Contractへ移る。

O-12aが完了するまでコード変更、Cloud停止、Firestore移行、Billing変更は行いません。
