# O-12 Migration Source Map

Status: **PREPARATION — O-12a未説明resource分類後に確定**  
Primary phase: **O-12b / O-12e準備**  
Updated: **2026-08-23**

この文書はO-12aで確認したraw/local/Cloud資産を、O-12eの `Rebuild / Migrate / Archive` 判断へ引き継ぐためのsource mapです。

健康値そのもの、Secret payload、token、OAuth credential、Firestore document本文は記録しません。

## 1. 分類の意味

- **Rebuild**: canonical raw sourceから再生成可能で、Processed Dataへ再構築するもの
- **Migrate**: raw sourceだけでは十分に再現できず、現存data/stateから移行が必要なもの
- **Archive**: runtimeには不要だが、履歴・監査証拠として保存価値があるもの
- **Runtime-only**: user dataそのものではなく、最終的にCloud runtime撤去対象となるもの
- **Unclassified**: 用途が未確認で、削除/停止判断をしてはいけないもの

## 2. Raw / local sources

| Source | Current evidence | Candidate classification | Target / handling |
| --- | --- | --- | --- |
| Health Auto Export JSON | connected Drive + N100で存在確認 | **Rebuild** | Processor raw input。`sleep-records`, blocks, days, health metrics等を再生成 |
| `normalized-sleep-records.json` | connected検索では未確認 | Rebuild/Migrate candidate | 発見時のみlegacy reader input |
| Apple Health `export.xml` | connected検索では未確認 | Rebuild candidate | 発見時のみlegacy reader input |
| local `health-store.json` | repo直下`server-data`はABSENT | Conditional Migrate | 別pathで発見された場合のみ分類 |
| local `processed-files.json` | repo直下`server-data`はABSENT | Conditional Migrate/Archive | 発見時のみprocessor state/historyとして分類 |

N100 raw rootの現在観測値は `L:\マイドライブ\Health Auto Export` だが、これはenvironment boundaryでありpersistent identityへ含めない。

## 3. Firestore data categories

Firestore database metadata:

- database: `(default)`
- location: `asia-northeast1`
- type: `FIRESTORE_NATIVE`

現行codeから確認済みのcategory:

| Firestore category | Candidate classification | 理由 / target |
| --- | --- | --- |
| `sleep_records` | **Rebuild + parity check** | raw Health Auto Exportからcanonical `sleep-records`へ再生成可能性が高い。O-12eで件数/parity確認 |
| `health_metric_records` | **Rebuild + parity check** | Processorへhealth metric/sleep-window aggregationを回収して再生成 |
| `processed_drive_files` | **Migrate or Archive** | 処理履歴/metadata。canonical user dataではなくprocessor state/provenanceへ必要部分だけ継承 |
| `drive_sync_runs` | **Archive** | Cloud運用履歴。通常のProcessed Data canonicalには不要 |
| `ingest_batches` | **Archive** | ingest運用履歴。raw sourceからbyte-for-byte再生成不要 |
| `metric_audit_summaries` | **Migrate or Archive** | 客観audit情報のうち必要部分はdiagnosticsへ、履歴はarchive候補 |

これはschema/codeに基づく候補分類であり、Firestore document本文はまだ読んでいない。O-12eで必要最小限の件数/内容確認を行う場合は、費用・目的・無料停止点を事前確認する。

## 4. GCP runtime / operational resources

### Sleep Compass既知resource

| Resource | Current state | Classification candidate | O-12での扱い |
| --- | --- | --- | --- |
| Cloud Run `sleep-improvement-api` | exists, `asia-northeast1` | Runtime-only | O-12h parity後、O-12iで停止候補、O-12jで撤去 |
| Cloud Run `sleep-improvement-drive-sync-api` | exists, `asia-northeast1` | Runtime-only | O-12h後に停止、O-12j撤去 |
| Scheduler `sleep-drive-sync-daily` | ENABLED, `asia-northeast1` | Runtime-only / operational history | O-12iで最小可逆停止対象 |
| Artifact Registry `cloud-run-source-deploy` | DOCKER | Runtime-only / build artifact | image retention確認後O-12j撤去候補 |
| Storage `run-sources-sleep-improvement-cloud-asia-northeast1` | exists | Runtime-only / build source artifact | user health raw sourceではないことを確認しO-12jで撤去候補 |
| Secret `drive-sync-api-token` | exists, name only | Runtime-only | payloadは読まず、Cloud runtime不要化後にO-12j撤去候補 |
| Secret `health-export-api-token` | exists, name only | Runtime-only | 同上 |
| Firebase Hosting `sleep-improvement-cloud` | exists | Runtime-only | O-12g/hでlocal access検証後、O-12j撤去 |
| Firebase/Auth related APIs | enabled | Runtime-only capability | local Auth dependency除去後、O-12j final audit対象 |
| Service Accounts | count 5 | Runtime-only identities | account内容はO-12aで不要。O-12jで不要identityを最終確認 |

Billingは現在 `billingEnabled: true`。O-12jより前に無効化しない。

## 5. 未説明resource

### Cloud Run `maya-daily-observation-console`

- region: `asia-northeast1`
- Sleep Compass repository内にservice名の参照なし
- current classification: **Unclassified**

ルール:

- 用途が判明するまで停止・削除・変更しない。
- Sleep Compassとは別用途なら、O-12jの「projectをdedicated projectとしてshutdownできるか」の判断に直接影響する。
- 同一projectに別用途resourceが存在する場合、project shutdownをそのまま実行してはいけない。
- Sleep Compass関連resourceであれば、対応するdata/runtime分類へ追加する。

## 6. O-12b / O-12eへの引き継ぎ

Processed Data Contract側ではCloud固有resource IDをcanonical schemaへ含めない。

O-12eではこのsource mapを起点として:

1. 各重要datasetを `Rebuild / Migrate / Archive` の1つへ確定
2. source count / target count / rejected count / checksum等をmigration manifestへ記録
3. health valuesをmigration evidenceへ直接記録しない
4. reconstruction/parityが通るまでCloud dataを削除しない
5. `maya-daily-observation-console` を含む未説明resourceが残る場合はCloud完全撤去gateをblockする

## 7. 現在の未確定事項

- `maya-daily-observation-console` の用途/由来
- Artifact Registry repositoryのlocation表示が今回のtable出力では空欄だったこと。O-12jで必要ならfull resource nameから確認する。
- Firestore各categoryの実document count/history preservation要否。O-12eで判断する。

これらはProcessed Data schemaそのものを不安定にするものではないが、migration/Cloud exit判断には反映が必要。