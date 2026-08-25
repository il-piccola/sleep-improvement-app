# O-12 Migration Source Map

Status: **ACTIVE — O-12e preservation分類確定 / backup実行待ち**  
Primary phase: **O-12e — Existing-data preservation**  
Updated: **2026-08-26**

Decision: [`o12e-preservation-scope-decision.md`](./o12e-preservation-scope-decision.md)

この文書はO-12a inventoryからO-12eの保全対象を確定し、O-12jまで削除禁止境界を維持するsource mapです。

健康値そのもの、Secret payload、token、OAuth credential、Firestore document本文はこの文書へ記録しません。

## 1. 分類の意味

- **Retain source**: 既存原本をそのまま保持し、O-12処理で変更・削除しない
- **Archive**: Cloud/local現存データをprivate fileとしてGCP runtime外へ保存する
- **Runtime-only**: user dataではなく、後続phaseでCloud runtime撤去対象となるもの
- **Unclassified**: 用途未確認。停止・削除してはいけないもの

`Rebuild / Migrate`はProcessed Data Contract上の一般的なmigration分類として残るが、O-12e Exit GateではFirestoreと新Processorのrebuild parityを要求しない。

## 2. Raw / local sources

| Source | Evidence | O-12e handling |
| --- | --- | --- |
| Health Auto Export JSON | N100 + Driveで存在確認 | **Retain source**。Google Drive原本を保持し変更・削除しない |
| `normalized-sleep-records.json` | 未確認 | 発見時のみRetain source |
| Apple Health `export.xml` | 未確認 | 発見時のみRetain source |
| local `health-store.json` | repo default `server-data`はABSENT | 存在時は**Archive**、不在ならABSENT記録 |
| local `processed-files.json` | repo default `server-data`はABSENT | 存在時は**Archive**、不在ならABSENT記録 |

N100 raw rootの現在観測値は `L:\マイドライブ\Health Auto Export\Sleep`。これはhost boundaryであり、persistent identityやimplementation defaultへhardcodeしない。

## 3. Firestore data categories

Firestore database:

- database: `(default)`
- location: `asia-northeast1`
- type: `FIRESTORE_NATIVE`

O-12e確定handling:

| Firestore category | O-12e handling | Preservation evidence |
| --- | --- | --- |
| `sleep_records` | **Archive** | raw Firestore document JSONL + count + byteLength + SHA-256 |
| `health_metric_records` | **Archive** | raw Firestore document JSONL + count + byteLength + SHA-256 |
| `processed_drive_files` | **Archive** | raw Firestore document JSONL + count + byteLength + SHA-256 |
| `drive_sync_runs` | **Archive** | raw Firestore document JSONL + count + byteLength + SHA-256 |
| `ingest_batches` | **Archive** | raw Firestore document JSONL + count + byteLength + SHA-256 |
| `metric_audit_summaries` | **Archive** | raw Firestore document JSONL + count + byteLength + SHA-256 |

Firestore evidence取得は `scripts/o12e-firestore-evidence.py` でsix collection groupsをread-only scanする。

実行時:

- Firestore write/update/delete = 0
- 6 categoryすべてのpresent documentsをprivate bundleへ保存
- document本文 / health values / user IDをterminalへ表示しない
- archive本文をGitへcommitしない

## 4. O-12e preservation artifacts

Private evidence archive:

```text
O-12e evidence bundle/
  o12e-firestore-evidence.json
  firestore-archive/
    sleep_records.jsonl
    health_metric_records.jsonl
    processed_drive_files.jsonl
    drive_sync_runs.jsonl
    ingest_batches.jsonl
    metric_audit_summaries.jsonl
  legacy-local/                  # local stateが存在する場合
```

bundleはlocalとGoogle Driveの両方へ保存し、bundle SHA-256一致を確認する。

O-12eではcanonical migration snapshotやFirestore semantic parityを必須artifactにしない。

## 5. GCP runtime / operational resources

| Resource | Current state | Classification | O-12 handling |
| --- | --- | --- | --- |
| Cloud Run `sleep-improvement-api` | exists | Runtime-only | O-12h後、O-12i停止候補、O-12j撤去 |
| Cloud Run `sleep-improvement-drive-sync-api` | exists | Runtime-only | 同上 |
| Scheduler `sleep-drive-sync-daily` | ENABLED | Runtime-only / history | O-12iで可逆停止 |
| Artifact Registry `cloud-run-source-deploy` | exists | Runtime-only | O-12j撤去候補 |
| Storage `run-sources-sleep-improvement-cloud-asia-northeast1` | exists | Runtime-only/build source | O-12j撤去候補 |
| Secret `drive-sync-api-token` | exists, name only | Runtime-only | payloadは読まずO-12j撤去候補 |
| Secret `health-export-api-token` | exists, name only | Runtime-only | 同上 |
| Firebase Hosting `sleep-improvement-cloud` | exists | Runtime-only | O-12g/h後にO-12j撤去 |
| Firebase/Auth related APIs | enabled | Runtime-only capability | local dependency除去後O-12j確認 |
| Service Accounts | count 5 | Runtime-only identities | O-12j final audit |

Billingは現在enabled。O-12jより前に無効化しない。

## 6. Unclassified resource

### Cloud Run `maya-daily-observation-console`

classification: **Unclassified / non-Sleep-Compass candidate**

ルール:

- O-12e data preservation対象ではない
- 停止・削除・変更しない
- O-12j dedicated-project判定前に用途再確認
- 別用途ならproject shutdown禁止

## 7. O-12e Exit Gateへの対応

O-12eでは:

1. Firestore six categoryをread-onlyで取得
2. collectionごとのcountを記録
3. present categoryをprivate JSONL archive
4. artifact byteLength / SHA-256を記録
5. local legacy stateのpresence / absenceを記録し、presentならprivate archive
6. evidence bundleをN100 localへ保存
7. evidence bundleをGoogle Driveへcopy
8. local / Drive bundle SHA-256一致を確認
9. Cloud data/runtimeは削除・停止しない

Firestoreとnew Processed Dataのsemantic parity、API parity、clean-room recoveryはO-12hへ移す。

## 8. Firestore削除ゲート

O-12e完了後もFirestoreを削除しない。

削除検討は `O-12f → O-12g → O-12h → O-12i` を通過した後、O-12j final auditで行う。

O-12eは「データ保全済み」のgate、O-12iは「Cloudなしで運用可能」のgate、O-12jは「削除可能」のgateとして分離する。

## 9. 未確定事項

- Firestore各categoryの実document count。O-12e backup runで確定する。
- `maya-daily-observation-console` の実用途。O-12jで再確認する。
- Artifact Registry repositoryのfull location表示。O-12jで必要なら確認する。
- 削除直前にFirestore native backup等の追加ロールバック保険を採用するか。O-12jで料金を含め再評価する。
