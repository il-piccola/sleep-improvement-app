# O-12 Migration Source Map

Status: **O-12e classification/procedure COMPLETE / final archive execution deferred to O-12i**  
Primary phases: **O-12e preservation readiness / O-12i final preservation**  
Updated: **2026-08-26**

Decision: [`o12e-preservation-scope-decision.md`](./o12e-preservation-scope-decision.md)

この文書はO-12a inventoryから保全対象を確定し、O-12jまで削除禁止境界を維持するsource mapです。

健康値そのもの、Secret payload、token、OAuth credential、Firestore document本文はこの文書へ記録しません。

## 1. 分類の意味

- **Retain source**: 既存原本をそのまま保持し、O-12処理で変更・削除しない
- **Archive**: Cloud/local現存データをprivate fileとしてGCP runtime外へ保存する
- **Runtime-only**: user dataではなく、後続phaseでCloud runtime撤去対象となるもの
- **Unclassified**: 用途未確認。停止・削除してはいけないもの

`Rebuild / Migrate`はProcessed Data Contract上の一般的なmigration分類として残るが、O-12e Exit GateではFirestoreと新Processorのrebuild parityを要求しない。

## 2. Raw / local sources

| Source | Evidence | Handling |
| --- | --- | --- |
| Health Auto Export JSON | N100 + Driveで存在確認 | **Retain source**。Google Drive原本を保持し変更・削除しない |
| `normalized-sleep-records.json` | 未確認 | 発見時のみRetain source |
| Apple Health `export.xml` | 未確認 | 発見時のみRetain source |
| local `health-store.json` | repo default `server-data`はABSENT | O-12i cutover時に存在すれば**Archive**、不在ならABSENT記録 |
| local `processed-files.json` | repo default `server-data`はABSENT | O-12i cutover時に存在すれば**Archive**、不在ならABSENT記録 |

N100 raw rootの現在観測値は `L:\マイドライブ\Health Auto Export\Sleep`。これはhost boundaryであり、persistent identityやimplementation defaultへhardcodeしない。

## 3. Firestore data categories

Firestore database:

- database: `(default)`
- location: `asia-northeast1`
- type: `FIRESTORE_NATIVE`

確定handling:

| Firestore category | Handling | Final preservation evidence |
| --- | --- | --- |
| `sleep_records` | **Archive** | raw Firestore document JSONL + count + byteLength + SHA-256 |
| `health_metric_records` | **Archive** | raw Firestore document JSONL + count + byteLength + SHA-256 |
| `processed_drive_files` | **Archive** | raw Firestore document JSONL + count + byteLength + SHA-256 |
| `drive_sync_runs` | **Archive** | raw Firestore document JSONL + count + byteLength + SHA-256 |
| `ingest_batches` | **Archive** | raw Firestore document JSONL + count + byteLength + SHA-256 |
| `metric_audit_summaries` | **Archive** | raw Firestore document JSONL + count + byteLength + SHA-256 |

Firestore archive取得は `scripts/o12e-firestore-evidence.py` でsix collection groupsをread-only scanする。

実行時:

- Firestore write/update/delete = 0
- 6 categoryすべてのpresent documentsをprivate bundleへ保存
- document本文 / health values / user IDをterminalへ表示しない
- archive本文をGitへcommitしない

### 実行タイミング

collectorの仕様はO-12eで確定済みだが、**本番final archiveはO-12iまで実行しない**。

現行Cloud取り込み継続中に早期backupを取ると、その後のingestで古くなるため。

O-12iでCloud writeを凍結し、in-flight writeがないことを確認した直後にfinal archiveを取得する。

## 4. Final preservation artifacts

Private evidence archive:

```text
final preservation bundle/
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

bundleはN100 localとGoogle Driveの両方へ保存し、bundle SHA-256一致を確認する。

canonical migration snapshotやFirestore semantic parityはfinal preservationの必須artifactにしない。

## 5. GCP runtime / operational resources

| Resource | Current state | Classification | O-12 handling |
| --- | --- | --- | --- |
| Cloud Run `sleep-improvement-api` | exists | Runtime-only | O-12h後、O-12i write freeze/stop対象、O-12j撤去 |
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

- Sleep Compass data preservation対象ではない
- 停止・削除・変更しない
- O-12j dedicated-project判定前に用途再確認
- 別用途ならproject shutdown禁止

## 7. O-12e Exit Gateへの対応

O-12eでは実データarchiveを取得せず、次を確立した。

1. Firestore six categoryを全件archiveするcollector
2. collectionごとのcount記録仕様
3. present categoryのprivate JSONL artifact仕様
4. artifact byteLength / SHA-256仕様
5. local legacy state presence / absence / archive手順
6. N100 local preservation手順
7. Google Drive copy + SHA一致手順
8. Firestore write/update/delete = 0 の安全境界
9. final backupをO-12i write freeze直後へ遅延するタイミング規則

Firestoreとnew Processed Dataのsemantic parity、API parity、clean-room recoveryはO-12hへ移す。

**O-12e: COMPLETE**

## 8. O-12i Final Preservation Gate

O-12iでは:

1. O-12h PASSを確認
2. Cloud automatic ingest/syncを可逆停止
3. manual sync / ingestを行わないmaintenance windowへ入る
4. in-flight writeなし確認
5. Firestore six category final archive取得
6. count / byteLength / SHA-256 integrity確認
7. original ZIPをN100 local保存
8. original ZIPをGoogle Driveへcopy
9. local / Drive ZIP SHA-256一致
10. local legacy stateのpresence / absenceを確定しpresentならarchive
11. Cloud write freezeを維持してlocal-only operation確認

final backup後にCloud writeを再開した場合は、次回cutoverでfinal archiveを取り直す。

## 9. Firestore削除ゲート

O-12e完了だけではFirestoreを削除しない。

削除検討は `O-12f → O-12g → O-12h → O-12i` を通過した後、O-12j final auditで行う。

O-12eは「保全手順準備済み」、O-12iは「最新データ保全済み + Cloudなしで運用可能」、O-12jは「削除可能」のgateとして分離する。

## 10. 未確定事項

- Firestore各categoryの最終document count。O-12i final backupで確定する。
- `maya-daily-observation-console` の実用途。O-12jで再確認する。
- Artifact Registry repositoryのfull location表示。O-12jで必要なら確認する。
- 削除直前にFirestore native backup等の追加ロールバック保険を採用するか。O-12jで料金を含め再評価する。
