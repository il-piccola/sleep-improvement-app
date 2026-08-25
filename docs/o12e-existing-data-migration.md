# O-12e 既存データ保全

Status: **ACTIVE — preservation scope確定 / Firestore backup実行待ち**  
Phase: **O-12e — Existing-data preservation**  
Updated: **2026-08-26**  
Decision: [`o12e-preservation-scope-decision.md`](./o12e-preservation-scope-decision.md)

## 1. 目的

O-12eの主目的は、Cloud撤去前に **Firestoreと既存local stateを失わない形でサルベージし、GCP project外へ保存すること** とする。

このPhaseでは新ProcessorとFirestoreのsemantic parityを証明しない。新ローカルシステムの正当性・Cloud/local parity・clean-room recoveryはO-12hで確認する。

このPhaseでは **Cloud dataを削除しない**。Cloud Run / Scheduler / Billingも停止・変更しない。

## 2. 前提

- O-12a COMPLETE
- O-12b Processed Data Contract v1.0.0 COMPLETE
- O-12c Processor independence COMPLETE
- O-12d Processor hardening COMPLETE
- `CX-O12D-001`: `PASS_WITH_ENVIRONMENT_EXCEPTION`
  - synthetic hardening PASS
  - build PASS
  - static safety checks PASS
  - snapshot CLI PASS
  - application errorなし
  - full regressionのみ既知 `uv_os_get_passwd ENOMEM`

## 3. O-12e確定分類

### Firestore

既知6 categoryはすべて **Archive** としてprivate fileへ保存する。

| Firestore source | O-12e handling |
| --- | --- |
| `sleep_records` | raw Firestore document JSONLをprivate archive |
| `health_metric_records` | raw Firestore document JSONLをprivate archive |
| `processed_drive_files` | raw Firestore document JSONLをprivate archive |
| `drive_sync_runs` | raw Firestore document JSONLをprivate archive |
| `ingest_batches` | raw Firestore document JSONLをprivate archive |
| `metric_audit_summaries` | raw Firestore document JSONLをprivate archive |

各categoryについて、document count・artifact path・byteLength・SHA-256をevidenceへ記録する。

### Local / raw

| Source | O-12e handling |
| --- | --- |
| Health Auto Export JSON | 既存Google Drive原本を保持。Processorから変更・削除しない |
| local `health-store.json` | 存在時のみprivate archive。不在ならABSENTを記録 |
| local `processed-files.json` | 存在時のみprivate archive。不在ならABSENTを記録 |
| `normalized-sleep-records.json` / Apple Health XML | 発見時は既存sourceとして保持。O-12eの必須探索対象にはしない |

`maya-daily-observation-console` はO-12e対象外。停止・削除せずO-12jへ引き継ぐ。

## 4. 保存形式

Firestore archive bundle例:

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
  legacy-local/                 # local stateが存在する場合
```

archive JSONLには健康値等が含まれ得るためprivate扱いとする。

禁止:

- Gitへのcommit
- terminalへのarchive本文表示
- ChatGPT返却へのhealth value / user ID / token等の記載

## 5. 保存先と完全性確認

bundleは最低限2か所へ保存する。

1. N100 local storage
2. Google Driveのraw watch rootとは別のbackup location

確認するもの:

- collectionごとのdocument count
- artifact byteLength
- artifact SHA-256
- bundle SHA-256
- N100 local bundleとGoogle Drive copyのSHA-256一致

ここで必要なのは **backup integrity test** だけであり、application parity testではない。

## 6. Firestore evidence / archive

正式手順:

[`o12e-firestore-evidence-runbook.md`](./o12e-firestore-evidence-runbook.md)

Cloud Shellで1回だけread-only collectorを実行する。

collectorは既知6 collection groupを読み、6 categoryすべてをprivate JSONLへ保存する。

Firestore operation:

- read: あり
- write/update/delete: **0**

## 7. N100 preservation copy

Cloud Shellで作成したZIPをN100へdownload後、[`o12e-n100-final-migration-runbook.md`](./o12e-n100-final-migration-runbook.md) に従う。

N100側で行うのは主に:

1. Cloud Shell ZIP SHA-256確認
2. ZIPをlocal private preservation directoryへ保持
3. local legacy stateのpresence / absence確認と、存在時のprivate archive
4. Cloud archive + local legacy archiveを最終evidence bundleへまとめる
5. Google Drive backup locationへcopy
6. copy後SHA-256一致確認
7. archive JSONLが読めることとcollection count metadataが揃っていることを確認

O-12eのためにreal raw rebuild、semantic parity、migration snapshotを必須実行しない。

## 8. O-12e Exit Gate

O-12eをCOMPLETEにできる条件:

- [ ] Firestore既知6 categoryをread-only収集済み
- [ ] 6 categoryすべてのdocument count記録済み
- [ ] present categoryすべてにprivate JSONL artifactあり
- [ ] artifactごとのbyteLength / SHA-256記録済み
- [ ] archive bundleをN100 localへ保存済み
- [ ] archive bundleをGoogle Driveへ保存済み
- [ ] local / Drive bundle SHA-256一致
- [ ] local `health-store.json` / `processed-files.json` のpresence / absence記録済み
- [ ] present local legacy stateはprivate archive済み
- [ ] Firestore write/update/delete = 0
- [ ] Cloud Run / Scheduler / Billing変更 = 0

次はO-12e Exit Gateに含めない。

- Firestoreとnew Processed Dataのsemantic parity
- API / presentation parity
- clean-room recovery
- Firestore削除

これらは後続phaseへ移す。

## 9. Firestore削除の扱い

O-12e COMPLETEは **「削除してもデータを失わない」ための保存条件**を満たすだけであり、Firestoreを直ちに削除する許可ではない。

現行Cloud runtimeはまだFirestoreを利用しているため、Firestore削除はO-12jまで行わない。

必須順序:

`O-12e backup → O-12f local persistence移行 → O-12g local access → O-12h parity/recovery → O-12i Cloud automatic processing停止 + local-only確認 → O-12j Firestore/Cloud削除`

削除直前にFirestore native backup等の追加ロールバック保険を採用する場合は、その時点で必要性・料金・保存先を確認する。O-12eの必須条件にはしない。
