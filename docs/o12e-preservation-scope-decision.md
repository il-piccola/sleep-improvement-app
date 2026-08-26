# O-12e データ保全スコープ決定

Status: **APPROVED — final backup timing clarified**  
Phase: **O-12e — Preservation readiness**  
Decision date: **2026-08-26**

## 1. 決定

O-12eでは **既存Cloud / Firestoreデータを安全にサルベージする手順を確立する**。

ただし、現行Cloud取り込みが動いている間に取得したFirestore archiveは、その後の取り込みで直ちに古くなる可能性がある。

したがって **本番Firestoreの最終バックアップはO-12eでは実行しない**。

最終サルベージはO-12hのCloud/local並行検証が完了した後、O-12i cutoverでCloud側の新規書き込みを凍結し、in-flight処理がないことを確認した直後に実行する。

この最終バックアップが完全性確認をPASSするまでFirestore削除へ進まない。

## 2. 理由

バックアップは取得時点のsnapshotである。

現行のCloud同期・取り込みが継続している状態で早期にバックアップすると、その後の `sleep_records`、`health_metric_records`、sync / ingest履歴等の更新を含まない古い保存物になる。

そのため責務を次のように分離する。

- **O-12e**: 何を、どの形式で、どこへ、どう検証して保存するかを確立する
- **O-12h**: Cloud/local parity、新規data、dedupe、restart、clean-room recoveryを確認する
- **O-12i**: Cloud書き込みを可逆的に凍結し、最終Firestore backupを取得・検証してlocal-onlyへ切り替える
- **O-12j**: 最終backupが有効な状態でFirestore/Cloud resource削除を判断する

## 3. O-12eで確立する保存対象

Firestore既知6 categoryをすべてprivate archive対象とする。

- `sleep_records`
- `health_metric_records`
- `processed_drive_files`
- `drive_sync_runs`
- `ingest_batches`
- `metric_audit_summaries`

各categoryについて最終backup時に最低限次を記録する。

- document count
- archive relative path
- byte length
- SHA-256

archive本文にはhealth value等が含まれ得るためprivate扱いとし、Gitへcommitしない。terminal / ChatGPT返却にも本文を表示しない。

local legacy state (`health-store.json`, `processed-files.json`) は最終cutover時点で存在する場合のみprivate archiveし、不在の場合は不在を記録する。

Health Auto Export raw sourceはGoogle Drive上の原本として保持し、Processorから変更・削除しない。

## 4. 最終保存先

最終Firestore archive bundleは最低限:

1. N100 local storage
2. Google Drive上のraw watch rootとは別のbackup location

の2か所へ保存する。

copy後はbundle SHA-256一致を確認する。

## 5. O-12eで行うこと

- Firestore既知6 categoryをすべてarchiveできるcollectorを用意する
- evidenceにcount / byteLength / SHA-256を記録する形式を確定する
- N100側のintegrity check手順を確定する
- Google Drive copyとSHA一致確認手順を確定する
- local legacy stateのpresence / absence / private archive手順を確定する
- Firestore write/update/deleteを行わない安全境界を明記する

**本番Firestore archiveの取得自体はO-12iまで保留する。**

## 6. O-12eで行わないこと

- 本番Firestore final backupの早期取得
- Firestore documentの削除
- Firestore databaseの削除
- Cloud Run / Scheduler停止
- Billing disable
- project shutdown
- Firestoreと新Processed Dataのsemantic parityをExit Gateにすること
- presentation / API parityの検証
- clean-room recovery test

## 7. O-12hへ移す確認

O-12hで確認する。

- Cloud/local response parity
- Processed DataからのSleep Compass表示・API parity
- 新規Health Auto Exportの処理
- deduplication
- restart behavior
- clean-room recovery
- canonical rule変更による意図的差異の説明

## 8. O-12i final-backup gate

O-12h PASS後、O-12iで次の順序を守る。

1. Cloud自動取り込みを可逆的に停止する
2. manual sync / ingestを行わないmaintenance windowへ入る
3. in-flight Cloud writeがないことを確認する
4. Firestore既知6 categoryをread-onlyで最終収集する
5. 6 categoryのcount / JSONL / byteLength / SHA-256を検証する
6. original preservation ZIPをN100 localへ保持する
7. 同一ZIPをGoogle DriveへcopyしSHA-256一致を確認する
8. local legacy stateのpresence / absenceを確定し、presentならprivate archiveする
9. この状態を維持したままlocal-only operationを確認する

最終backup後にCloud writeを再開した場合、そのbackupは削除用final backupではなくなる。Cloud writeを再開した場合は、次のcutover時に最終backupを取り直す。

## 9. Firestore削除ゲート

**O-12e COMPLETEは「保全手順が確立した」ことを意味し、実データの最終保存完了を意味しない。**

Firestore削除には次がすべて必要。

1. O-12f: Sleep CompassがCloud persistenceなしで動作
2. O-12g: local Web + Tailscale動作
3. O-12h: Cloud/local parity・recovery確認
4. O-12i: Cloud write freeze後の最終Firestore backupがPASS
5. O-12i: local-only operation確認
6. O-12j: final audit後にFirestoreを含むCloud resourceを削除

削除直前にFirestore native backup等の追加ロールバック保険を採用する場合は、必要性と料金をその時点で確認する。これはO-12e必須条件ではない。

## 10. O-12e Exit Gate

O-12eをCOMPLETEにできる条件:

- Firestore既知6 categoryすべてがcollector対象になっている
- present categoryをprivate JSONLへ保存する仕様が確定している
- count / archive path / byteLength / SHA-256を記録するevidence形式が確定している
- N100 local保存先が定義されている
- Google Drive backup locationがraw watch root外に定義されている
- local / Drive bundle SHA-256一致確認手順が確定している
- local legacy stateのpresence / absence / archive手順が確定している
- Firestore write/update/delete = 0 の安全境界が手順に明記されている
- final backupはO-12i write freeze直後に実行することが明記されている

semantic parity、rebuild parity、migration snapshot、実Firestore final archive取得はO-12e Exit Gateに含めない。
