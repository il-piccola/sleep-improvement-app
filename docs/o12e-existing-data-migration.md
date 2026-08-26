# O-12e 既存データ保全準備

Status: **COMPLETE — preservation procedure established / final backup deferred to O-12i**  
Phase: **O-12e — Preservation readiness**  
Updated: **2026-08-26**  
Decision: [`o12e-preservation-scope-decision.md`](./o12e-preservation-scope-decision.md)

## 1. 目的

O-12eの目的は、Cloud撤去前に **Firestoreと既存local stateを失わずサルベージする手順を確立すること** とする。

現行Cloud取り込みが動いている間に本番backupを取得すると、その後の取り込みでbackupが古くなる。そのためO-12eでは本番Firestore final backupを実行しない。

最終backupはO-12hの並行検証が完了した後、O-12iでCloud writeを凍結し、in-flight処理がないことを確認した直後に取得する。

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

## 3. Firestore保存対象

既知6 categoryはすべて **Archive** としてprivate fileへ保存する。

| Firestore source | final backup handling |
| --- | --- |
| `sleep_records` | raw Firestore document JSONLをprivate archive |
| `health_metric_records` | raw Firestore document JSONLをprivate archive |
| `processed_drive_files` | raw Firestore document JSONLをprivate archive |
| `drive_sync_runs` | raw Firestore document JSONLをprivate archive |
| `ingest_batches` | raw Firestore document JSONLをprivate archive |
| `metric_audit_summaries` | raw Firestore document JSONLをprivate archive |

各categoryについて、document count・artifact path・byteLength・SHA-256をevidenceへ記録する。

### Local / raw

| Source | final backup handling |
| --- | --- |
| Health Auto Export JSON | 既存Google Drive原本を保持。Processorから変更・削除しない |
| local `health-store.json` | cutover時に存在すればprivate archive。不在ならABSENTを記録 |
| local `processed-files.json` | cutover時に存在すればprivate archive。不在ならABSENTを記録 |
| `normalized-sleep-records.json` / Apple Health XML | 発見時は既存sourceとして保持。必須探索対象にはしない |

`maya-daily-observation-console` はO-12e対象外。停止・削除せずO-12jへ引き継ぐ。

## 4. 保存形式

Firestore archive bundle例:

```text
preservation bundle/
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

final bundleは最低限2か所へ保存する。

1. N100 local storage
2. Google Driveのraw watch rootとは別のbackup location

確認するもの:

- collectionごとのdocument count
- artifact byteLength
- artifact SHA-256
- bundle SHA-256
- N100 local bundleとGoogle Drive copyのSHA-256一致

必要なのは **backup integrity check** でありapplication parity testではない。

## 6. O-12eで確立済みの手順

正式collector/runbook:

- [`o12e-firestore-evidence-runbook.md`](./o12e-firestore-evidence-runbook.md)
- [`o12e-n100-final-migration-runbook.md`](./o12e-n100-final-migration-runbook.md)
- `scripts/o12e-firestore-evidence.py`

collectorは既知6 collection groupをread-onlyで収集し、6 categoryすべてをprivate JSONLへ保存する。

Firestore operation:

- read: あり
- write/update/delete: **0**

N100側runbookは:

- six JSONL archive integrity
- count / byteLength / SHA
- original ZIP local preservation
- Google Drive copy + SHA一致
- local legacy state presence / absence + present時archive

を確認する。

## 7. 実行タイミング

**上記runbookは今は実行しない。**

final backupを取得する正式タイミングはO-12i。

順序:

1. O-12fでSleep CompassをProcessed Data-backed local APIへ移行
2. O-12gでlocal Web + Tailscaleを完成
3. O-12hでCloud/local parity・新規data・dedupe・restart・clean-room recoveryを確認
4. O-12i開始時にCloud自動取り込みを可逆停止
5. manual sync / ingestを行わないmaintenance windowへ入る
6. in-flight Cloud writeがないことを確認
7. Firestore final backupを取得
8. N100 + Google Driveへ保存しintegrity PASSを確認
9. write freezeを維持したままlocal-only operationを確認
10. O-12jで削除判断

final backup後にCloud writeを再開した場合、そのbackupはfinal扱いを失う。次回cutover時に再取得する。

## 8. O-12e Exit Gate

O-12eは次をもってCOMPLETEとする。

- [x] Firestore既知6 categoryがすべてcollector対象
- [x] 6 categoryすべてprivate JSONLへ保存する仕様を確定
- [x] document count / artifact path / byteLength / SHA-256 evidence形式を確定
- [x] N100 local保存手順を確定
- [x] Google Drive backup locationとcopy手順を確定
- [x] local / Drive SHA-256一致確認手順を確定
- [x] local legacy state presence / absence / archive手順を確定
- [x] Firestore write/update/delete = 0 の安全境界を明記
- [x] final backupをO-12i write freeze直後に遅延する方針を確定

O-12eのために次は実行しない。

- 本番Firestore final archive
- real raw rebuild
- semantic parity
- migration snapshot
- application test

## 9. Firestore削除の扱い

O-12e COMPLETEは **「最終保全を安全に実行できる準備が整った」** ことを意味する。

実データのfinal preservationはO-12iで実行し、そのPASSがO-12j削除の必須前提となる。

必須順序:

`O-12e preservation readiness → O-12f local persistence移行 → O-12g local access → O-12h parity/recovery → O-12i write freeze → final backup + integrity → local-only確認 → O-12j Firestore/Cloud削除`

削除直前にFirestore native backup等の追加ロールバック保険を使う場合は、その時点で必要性と料金を確認する。
