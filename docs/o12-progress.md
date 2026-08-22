# O-12 作業進捗管理

状態: **実装未着手**  
基準文書: [`o12-local-first-cloud-exit-plan.md`](./o12-local-first-cloud-exit-plan.md)  
現在のフェーズ: **O-12a — 現状監査**  
次の担当: **ChatGPT**  
最終更新日: **2026-08-23**

この文書は、O-12の実作業を管理するための中心文書です。

以下を管理します。

- 各フェーズの進捗状況
- ChatGPTとCodexの作業分担
- 証拠・確認結果
- ブロッカー
- ChatGPT ↔ Codex間のすべての作業依頼と結果

O-12の目的・アーキテクチャ・フェーズゲート・完了条件は基準文書で定義します。

この進捗管理文書と基準文書の内容が矛盾した場合は、**基準文書を優先します。**

## 1. 作業モデル

O-12は **ChatGPT優先・Codex最小化** の方針で進めます。

### ChatGPTを主担当とする

接続済みサービス、GitHub、Google Drive、公開ドキュメント、既存レポート、またはユーザーから渡されたCodexの実行結果を使って実施できる作業は、原則としてChatGPTが担当します。

ChatGPTの担当範囲:

- プロジェクト計画とフェーズ管理
- GitHub・コード・文書監査
- 接続済みGoogle Driveから確認可能なデータの監査
- 公開サービスの仕様・料金・ポリシー確認
- リポジトリコードおよびCodexのread-only出力を使ったCloud依存分析
- 入手可能な証拠を使ったFirestoreデータ分類
- Processed Data Contractの設計・レビュー
- 移行戦略と検証基準の設計
- テスト計画の設計
- Codexによる変更内容・コマンド出力のレビュー
- 進捗・証拠の文書化
- 各フェーズの完了判定

したがって、**監査作業は原則としてChatGPTが担当します。**

### Codexは実行担当であり、プロジェクト設計担当ではない

Codexは、N100実機、ローカルファイルシステム、ローカルランタイム、ローカル認証情報、`gcloud`、Tailscale CLI、ビルド・テスト実行、複数ファイルにまたがるコード変更など、**ChatGPTから直接実行できない作業に限定して使用します。**

Codexが担当する代表的な作業:

- ローカルGitの未commit状態の確認
- 実際のローカル/マウント済みファイルパス確認
- Node/npm等のローカルランタイムバージョン確認
- N100上のTailscale実行状態確認
- ChatGPTからGCPプロジェクトへ直接アクセスできない場合のread-only `gcloud`監査
- 事前レビュー済みコード変更のローカル適用
- ビルド・テスト・移行スクリプト実行
- ローカルサービス、再起動、自動起動等の実機検証
- 後半フェーズで明示承認されたCloud/Tailscale状態変更

Codexには、ChatGPTがすでに実施した調査・アーキテクチャ分析・リポジトリ全体レビューを繰り返させません。

### ユーザー承認が必要な境界

必要な場合、read-only確認はCodexへ委任できます。

ただし、以下の操作は、該当フェーズのゲートを通過し、かつ**ユーザーの明示承認を得た後にのみ実行します。**

- 停止
- 削除
- 無効化
- 移行
- 上書き
- 本番・Cloudデータやサービスを実質的に変更する操作

## 2. Codexトークン最小化ルール

Codexへ作業を依頼する前に、ChatGPT側で実行可能な作業を先に完了します。

すべてのCodex依頼は以下のルールに従います。

1. **1回の依頼につき、目的は1つに限定する**
2. 対話的な探索より、**小さなコマンド一式**を優先する
3. 既知の場合は、対象パス・ファイル・コマンドを具体的に指定する
4. **調べないこと・変更しないこと**も明記する
5. 長い分析ではなく、簡潔な事実だけ返すよう依頼する
6. 過去の実行結果を再利用し、同じ事実を再調査させない
7. ChatGPTが直接確認できる公開ドキュメントをCodexに調査させない
8. 長いレポートを書かせず、証拠は機械的・事実中心にする
9. Codex結果はChatGPTがレビューし、次の作業を決定する
10. ChatGPTだけで安全に完了できる作業ではCodexを呼ばない

## 3. ステータス定義

- **未着手** — まだ作業を開始していない
- **ChatGPT作業中** — ChatGPT側の監査・分析・文書作業中
- **Codex必要** — ChatGPT側の作業が終わり、残りがローカル実行のみ
- **Codex実行中** — 限定されたCodex作業を依頼済み
- **レビュー中** — ChatGPTが結果・証拠を確認中
- **ブロック中** — ブロッカーが解決するまで安全に進められない
- **完了** — Exit Gateを通過し、証拠が記録済み

証拠なしでフェーズを**完了**にしてはいけません。

## 4. ステージ / フェーズ作業分担表

| ステージ | フェーズ | ChatGPTの主担当 | Codexの最小担当 | 状態 |
| --- | --- | --- | --- | --- |
| **Stage 1 Inventory** | **O-12a 現状監査** | GitHub/コード監査、Drive監査、依存関係整理、公開情報確認、GCP/N100結果の分析 | ChatGPTでは取得できないN100ローカル情報、read-only `gcloud`、Tailscale、ランタイム情報のみ | **未着手** |
| **Stage 2 Contract** | **O-12b Processed Data Contract** | データ契約、バージョン、互換性、provenance、移行ルールの設計・レビュー | 必要な場合のみ小規模なローカル試験 | **未着手** |
| **Stage 3 Processor** | **O-12c Processor独立化** | 結合箇所分析、リファクタ設計、diff・テストレビュー | 限定的なローカルリファクタとテスト | **未着手** |
| **Stage 3 Processor** | **O-12d Processor堅牢化** | 保存・fingerprint・パス・バックアップ仕様設計とレビュー | ファイルシステム、watcher、snapshot、Driveコピー実装・テスト | **未着手** |
| **Stage 4 Migration** | **O-12e 既存データ移行** | データ棚卸し・分類、adapter/manifest設計、移行結果レビュー | ローカル移行・復旧テストと必要最小限のCloud read/export | **未着手** |
| **Stage 5 Local runtime** | **O-12f Sleep Compass独立化** | Cloud依存/API契約分析、ローカル置換設計、parityレビュー | ローカルコード変更とbuild/test | **未着手** |
| **Stage 5 Local runtime** | **O-12g Local Web + Tailscale** | same-origin、localhost、アクセス設計、設定レビュー | N100上でローカルサーバー/Tailscale Serve実行・確認 | **未着手** |
| **Stage 5 Local runtime** | **O-12h 並行検証・復旧試験** | 比較項目定義、証拠比較、parity判定 | 指定されたローカル試験・再起動・再構築のみ | **未着手** |
| **Stage 6 Cloud exit** | **O-12i Cloud運用停止** | ゲート確認、最小の可逆停止計画、停止後の結果レビュー | 明示承認されたCloud停止操作のみ | **未着手** |
| **Stage 6 Cloud exit** | **O-12j Cloud完全撤去** | 最終監査、Billing/データ確認、削除順序設計、完了確認 | ローカル認証が必要な明示承認済みBilling/project停止操作のみ | **未着手** |

## 5. フェーズ詳細

### O-12a — 現状監査

**最初の監査はChatGPTが担当します。**

ChatGPT作業:

- [ ] GitHub `master`、現行コード、文書、依存関係、Cloud/Firebase参照を監査
- [ ] リポジトリコードから既存ローカルサーバー構成を監査
- [ ] 接続済みGoogle Driveから、原本データ範囲と既存加工済みデータを可能な範囲で監査
- [ ] コード・文書からCloud依存 / リソース確認表を作る
- [ ] 必要なGoogle Cloud / Tailscale公開仕様を確認
- [ ] 未確認事項を最小のN100/Codex read-only確認項目まで絞る
- [ ] Codex結果をレビュー・分類
- [ ] O-12aの結果とブロッカーをこの文書へ記録

ChatGPT側の監査完了後にのみ行うCodex作業:

- [ ] ローカル未公開状態が不明な場合のみGit status / branch / remoteを報告
- [ ] N100上の実際の原本パス・マウント先・関連ローカルデータパスを報告
- [ ] 実装に必要なNode/npm等のランタイムバージョンを報告
- [ ] 設計に必要なTailscaleローカル状態を報告
- [ ] GCP/Billingの未確認事項だけを解決する最小限のread-only `gcloud`監査を実行
- [ ] Cloud、Firestore、Drive、リポジトリ、本番状態を変更しない

**Exit Gate:** Cloud / Billing / Firestore / Drive / ローカル / ホスト環境の情報がO-12b設計に十分であり、重要な未説明データ・リソースカテゴリが残っていない。

**証拠:** _未記録_

### O-12b — Processed Data Contract

ChatGPT作業:

- [ ] 正式なデータセットとテキスト形式を定義
- [ ] `schemaVersion`、`processorVersion`、`generatedAt`、provenance、処理設定項目を定義
- [ ] sleep-day設定のprovenanceを定義
- [ ] Legacy Reader互換ポリシーを定義
- [ ] snapshot公開・保持ルールを定義
- [ ] migration manifestを定義
- [ ] 既存raw/local/Cloud schemaと契約を比較
- [ ] 契約テストケースを作成

Codex作業:

- [ ] 静的検証だけでは不十分な場合のみ、小規模parser/fixture/prototypeテストを実施
- [ ] 大規模な再設計やリポジトリ探索は行わない

**Exit Gate:** バージョン管理されたデータ契約と移行ルールが文書化・テスト可能で、Data Processorおよび外部アプリから利用できる。

**証拠:** _未記録_

### O-12c — Processor独立化

ChatGPT作業:

- [ ] importer、`healthStore`、API server、React、Cloudロジック間の現在の結合箇所を特定
- [ ] Processor Coreの境界と安定したinterfaceを決定
- [ ] Cloudコードから回収すべきhealth metrics / sleep-window等の客観処理を特定
- [ ] ファイル単位の限定的な実装指示を作成
- [ ] Codexのdiff・テスト結果をレビュー

Codex作業:

- [ ] レビュー済みProcessor Coreリファクタをローカル適用
- [ ] 単発実行可能な処理経路を追加・確認
- [ ] watcher / 常時実行は同一Coreを呼ぶwrapperとして維持
- [ ] 対象テスト・buildだけ実行

**Exit Gate:** ProcessorがSleep Compass Web/API、Firebase、Cloud Run、Firestore、Tailscale、Google Drive APIなしで動作する。

**証拠:** _未記録_

### O-12d — Processor堅牢化

ChatGPT作業:

- [ ] snapshot / atomic write / データ破損時動作を定義
- [ ] OS非依存path / fingerprint仕様を定義
- [ ] raw入力とprocessed出力の分離を定義
- [ ] Google Driveへのprocessed snapshot公開ルールを定義
- [ ] snapshot保持・復旧テストを定義
- [ ] 実装と証拠をレビュー

Codex作業:

- [ ] raw / working / backup / app-stateパスを設定可能にする
- [ ] 絶対パス・ドライブレター依存の永続identityを除去
- [ ] atomic/versioned snapshotと正常snapshot復旧を実装
- [ ] processed ledgerの任意件数上限を撤廃
- [ ] 未変更ファイルへの不要な全文hashを削減
- [ ] processed出力をraw scan対象から除外
- [ ] watcher + 定期rescan + Drive snapshot copyをローカル検証

**Exit Gate:** ローカル保存、OS移植性、重複防止、watcher/rescan、復旧、Driveへの加工済みデータバックアップが定義済みテストを通過する。

**証拠:** _未記録_

### O-12e — 既存データ移行

ChatGPT作業:

- [ ] GitHub / Drive / O-12a結果から取得可能な全データを棚卸し
- [ ] 各データをRebuild / Migrate / Archiveに分類
- [ ] migration adapterとmanifest仕様を定義
- [ ] Firestoreにしか存在しない保存必要データを特定
- [ ] 移行件数、reject、checksum、再構築結果をレビュー
- [ ] 重要データに未説明事項がある場合Cloud削除をブロック

Codex作業:

- [ ] 承認済みデータに対してローカルmigration/rebuild toolを実行
- [ ] 他の方法で取得できないFirestoreデータに限り必要最小限のread/exportを実行
- [ ] clean-room再構築試験を実行
- [ ] 長文説明ではなく件数・error・checksumを返す

**Exit Gate:** 重要な全履歴データがRebuild / Migrate / Archiveのいずれかで明確に保全され、clean-room再構築試験が成功する。

**証拠:** _未記録_

### O-12f — Sleep Compass独立化

ChatGPT作業:

- [ ] Web/APIのFirestore / Cloud endpoint依存をすべて整理
- [ ] Processed DataベースAPIの動作と互換条件を定義
- [ ] 現行Web UIが必要とする最小ローカルAPI互換性を特定
- [ ] 限定的な実装指示を作成
- [ ] コードdiffとresponse形の互換性をレビュー

Codex作業:

- [ ] ローカルAPI / storage変更を適用
- [ ] Local pathからFirestore依存を除去
- [ ] 対象API / build / testのみ実行

**Exit Gate:** Sleep CompassがProcessed Dataから動作し、ローカルアプリ経路にCloud persistence依存がない。

**証拠:** _未記録_

### O-12g — Local Web + Tailscale

ChatGPT作業:

- [ ] frontend/APIのsame-origin設定をレビュー
- [ ] localhost-only server変更をレビュー
- [ ] Firebase Authを外すタイミングとアクセス前提を定義
- [ ] 必要に応じてTailscale Serve公式仕様を確認
- [ ] Codexの実行証拠をレビュー

Codex作業:

- [ ] React + `/api/*` をローカル配信
- [ ] localhost-only bindを確認
- [ ] N100上でTailscale Serveを設定・確認
- [ ] 許可されたtailnet端末からアクセスできることを確認
- [ ] Funnelは使用しない

**Exit Gate:** Web/APIがsame-origin、localhost-onlyで動作し、ローカルFirebase Auth依存なしでTailscale経由アクセスできる。

**証拠:** _未記録_

### O-12h — 並行検証・復旧試験

ChatGPT作業:

- [ ] Cloud版とローカル版の比較項目を定義
- [ ] current/latest/month、blocks、stages、sources、metrics、diagnostics、statusを比較
- [ ] 重複、retry、restart、recoveryの証拠をレビュー
- [ ] 差異が許容可能か、説明可能か判定
- [ ] フェーズ合否を決定

Codex作業:

- [ ] 指定されたローカル比較・テストコマンドだけを実行
- [ ] 新規ファイル処理、再処理、失敗retry、server restart、clean-room再構築を確認
- [ ] 簡潔な構造化証拠を取得

**Exit Gate:** 必要なparity・復旧テストが成功し、残る差異が明示的に理解・承認されている。

**証拠:** _未記録_

### O-12i — Cloud運用停止

ChatGPT作業:

- [ ] O-12hのExit Gate完了を確認
- [ ] 最小で可逆的なCloud自動処理停止方法を特定
- [ ] 正確な操作とrollback方法を作成
- [ ] 状態変更前にユーザーの明示承認を取得
- [ ] 停止後のローカル単独処理結果をレビュー

Codex作業:

- [ ] 明示承認された停止操作だけを実行
- [ ] 指定された確認コマンドを実行
- [ ] Firestoreその他Cloudデータを削除しない

**Exit Gate:** Cloud自動処理が停止し、新規原本データがローカルパイプラインだけで正常処理される。

**証拠:** _未記録_

### O-12j — Cloud完全撤去

ChatGPT作業:

- [ ] 既知リソース、Billing、移行状況を再監査
- [ ] 必要な全データが保全済みであることを確認
- [ ] Project shutdown前にSleep Compass専用プロジェクトであることを確認
- [ ] 最終無効化・shutdown順序とrollback限界を設計
- [ ] 破壊的/最終操作前にユーザーの明示承認を取得
- [ ] 完了証拠をレビューし、基準文書・進捗を更新

Codex作業:

- [ ] ローカル認証情報が必要な明示承認済みコマンドだけ実行
- [ ] 承認された順序でのみresource/Billingを停止・無効化
- [ ] ChatGPT/ユーザーのゲート承認後にのみ専用projectをshutdown
- [ ] 簡潔な最終状態の証拠を返す

**Exit Gate:** Sleep Compassの通常運用にGoogle Cloud runtime依存がなく、必要データが保全され、Billingが無効化され、適切な場合は専用プロジェクトがshutdown済み。

**証拠:** _未記録_

## 6. ChatGPT ↔ Codex 引き継ぎルール

すべてのCodex作業は、発行前または直後にこの文書へ登録します。

今後のCodex依頼・返答・レビュー・証拠記録は**日本語を標準**とします。コマンド名、ファイル名、API名、エラー原文など、技術的に英語のまま保持すべきものは翻訳しません。

### Codex依頼フォーマット

各Codex依頼には `CX-O12A-001` のようなIDを付与します。

依頼内容は以下に絞ります。

```text
依頼ID:
フェーズ:
目的:
対象コマンド / 対象ファイル:
禁止事項:
返答してほしい内容:
```

`返答してほしい内容` では、以下のような簡潔な証拠のみを要求します。

- バージョン
- パス
- コマンド出力
- 変更ファイル
- テスト結果
- commit SHA

### Codex返答フォーマット

Codexには以下の形式で返答させます。

```text
依頼ID:
結果: PASS / FAIL / BLOCKED
確認事実または変更ファイル:
実行したコマンド / テスト:
エラー / ブロッカー:
commit SHA（該当する場合）:
```

ブロッカー分析が必要な場合を除き、長いアーキテクチャ説明は不要です。

### レビュールール

Codexの結果は**証拠**であり、最終判断ではありません。

ChatGPTが結果をレビューし、進捗管理を更新し、追加のCodex作業が本当に必要か判断します。

## 7. Codex依頼キュー / やり取り履歴

| 依頼ID | フェーズ | 状態 | 目的 | Codex対象範囲 | 結果 / 証拠 | ChatGPTレビュー |
| --- | --- | --- | --- | --- | --- | --- |
| _なし_ | O-12a | — | まずChatGPT監査を実施 | — | — | — |

新しいCodex依頼はチャット履歴だけに残さず、この表へ追加します。

## 8. 証拠台帳

| 証拠ID | フェーズ | 情報源 | 証明する内容 | 保存先 / 参照先 |
| --- | --- | --- | --- | --- |
| `EV-BASELINE-001` | O-12全体 | GitHub | 承認済みO-12基準文書が存在する | `docs/o12-local-first-cloud-exit-plan.md` |
| `EV-PROGRESS-001` | O-12全体 | GitHub | ChatGPT/Codex分担と進捗管理ルールが存在する | この文書 |

Codexが生成した証拠もここへ要約して記録します。

以下はcommitしません。

- 生の健康データ
- secrets
- tokens
- OAuth認証情報
- tailnetの機微情報
- 不要なBilling/account識別情報

## 9. 判断・ブロッカーログ

| 日付 | フェーズ | 種別 | 判断またはブロッカー | 担当 | 対応状況 |
| --- | --- | --- | --- | --- | --- |
| 2026-08-23 | O-12全体 | 判断 | 監査・計画は原則ChatGPTが担当し、Codexはここで実行できないローカル作業だけに最小化する | ChatGPT | 有効 |
| 2026-08-23 | O-12全体 | 判断 | Codexとのやり取りはこの進捗管理文書で管理する | ChatGPT | 有効 |
| 2026-08-23 | O-12全体 | 判断 | O-12の進捗管理、Codex依頼、Codex結果レビューは日本語を標準とする | ChatGPT | 有効 |

## 10. 現在の次の作業

**担当: ChatGPT**

Codexをまだ使わず、O-12aを開始します。

1. GitHubコード・文書・Cloud/Firebase依存を監査
2. 接続済みGoogle Driveから安全に確認可能なデータを監査
3. N100 / ローカル認証情報なしでは確認できない事実だけを特定
4. 残った項目だけを1回の最小限のCodex read-only依頼へまとめる

ChatGPT側の監査によって作業範囲を十分に絞るまでは、Codex依頼を発行しません。
