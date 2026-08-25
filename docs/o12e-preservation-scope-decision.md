# O-12e データ保全スコープ決定

Status: **APPROVED**  
Phase: **O-12e — Existing-data preservation**  
Decision date: **2026-08-26**

## 1. 決定

O-12eの主目的を **既存Cloud / Firestoreデータのサルベージと外部保全** に限定する。

O-12eでは、Firestoreに存在するSleep Compassデータをprivate file archiveとして保存し、件数・byteLength・SHA-256・copy後のSHA-256一致を確認する。

O-12eでは、Health Auto Exportから再構築したProcessed DataとFirestoreのsemantic parityをExit Gateにしない。

## 2. 理由

データ保全と新ローカルシステムの正当性検証は別の問題である。

- **データ保全**: Cloudを後で撤去しても元データそのものを失わないこと
- **ローカル動作検証**: 新Processor / Sleep CompassがCloudと同等に機能すること

前者は完全バックアップで達成できる。後者はO-12hのparallel validation / recovery testで確認する。

O-12eへsemantic parityを入れると、データ保全の完了条件と新処理ロジックの差異が混ざり、Cloud撤去計画を不必要に複雑化するため分離する。

## 3. O-12eで保存するもの

Firestore既知6 categoryをすべてprivate archiveする。

- `sleep_records`
- `health_metric_records`
- `processed_drive_files`
- `drive_sync_runs`
- `ingest_batches`
- `metric_audit_summaries`

各categoryについて最低限次を記録する。

- document count
- archive relative path
- byte length
- SHA-256

archive本文にはhealth value等が含まれ得るためprivate扱いとし、Gitへcommitしない。terminal / ChatGPT返却にも本文を表示しない。

local legacy state (`health-store.json`, `processed-files.json`) は存在する場合のみprivate archiveし、不在の場合は不在を記録する。

Health Auto Export raw sourceは既にGoogle Drive上の原本として保持し、Processorから変更・削除しない。

## 4. 保存先

Firestore archive bundleは最低限:

1. N100 local storage
2. Google Drive上のraw watch rootとは別のbackup location

の2か所へ保存する。

copy後はbundle SHA-256一致を確認する。

## 5. O-12eで行わないこと

- Firestore documentの削除
- Firestore databaseの削除
- Cloud Run / Scheduler停止
- Billing disable
- project shutdown
- Firestoreと新Processed Dataのsemantic parityをExit Gateにすること
- presentation / API parityの検証
- clean-room recovery test

## 6. O-12hへ移す確認

次はO-12hで確認する。

- Cloud/local response parity
- Processed DataからのSleep Compass表示・API parity
- 新規Health Auto Exportの処理
- deduplication
- restart behavior
- clean-room recovery
- canonical rule変更による意図的差異の説明

## 7. Firestore削除ゲート

**O-12eのバックアップ完了は「削除してもデータを失わない」ことの条件であり、「今すぐ削除してもシステムが壊れない」ことの条件ではない。**

Firestoreは現行Cloud runtimeがまだ利用しているため、O-12e完了直後には削除しない。

削除検討は次を通過した後のO-12jで行う。

1. O-12f: Sleep CompassがCloud persistenceなしで動作
2. O-12g: local Web + Tailscale動作
3. O-12h: Cloud/local parity・recovery確認
4. O-12i: Cloud automatic processing停止 + local-only確認
5. O-12j: final audit後にFirestoreを含むCloud resourceを削除

削除直前にFirestore native backup等の追加ロールバック保険を採用する場合は、必要性と料金をその時点で確認する。これはO-12eの必須条件ではない。

## 8. O-12e Exit Gate

O-12eをCOMPLETEにできる条件:

- Firestore既知6 categoryをread-onlyで収集済み
- 6 categoryそれぞれのcountを記録済み
- present categoryのprivate archive artifactが存在
- archive artifactのbyteLength / SHA-256を記録済み
- archive bundleをN100 localへ保存済み
- archive bundleをGoogle Driveへcopy済み
- local / Drive bundle SHA-256一致
- local legacy stateのpresence / absenceを記録済み
- Cloud / Firestore write/delete = 0
- Cloud runtime停止・削除 = 0

semantic parity、rebuild parity、migration snapshotはO-12e Exit Gateに含めない。
