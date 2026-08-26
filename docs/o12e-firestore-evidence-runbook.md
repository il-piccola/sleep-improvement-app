# Firestore final preservation runbook

Status: **READY — DO NOT RUN NOW / execute in O-12i after Cloud write freeze**  
Prepared in: **O-12e**  
Execution phase: **O-12i**  
Updated: **2026-08-26**  
Decision: [`o12e-preservation-scope-decision.md`](./o12e-preservation-scope-decision.md)

## 1. 目的

Firestore既知6 collection groupをread-onlyで取得し、**6 categoryすべてをprivate JSONL fileとして最終サルベージする**。

このrunbookはapplication parityを確認しない。目的はCloud撤去直前のデータ保全だけである。

## 2. 実行タイミング

**現行Cloud取り込みが動いている間は実行しない。**

backup取得後にCloud ingest / syncが走るとFirestoreが更新され、そのbackupはfinalではなくなる。

正式実行条件:

1. O-12f COMPLETE
2. O-12g COMPLETE
3. O-12h COMPLETE
4. O-12iでCloud自動取り込みを可逆停止済み
5. manual sync / ingestを行わないmaintenance window中
6. in-flight Cloud writeがないことを確認済み

この状態で初めて本runbookを実行する。

final backup後にCloud writeを再開した場合、そのbackupはfinal扱いを失う。次回cutoverで取り直す。

## 3. 安全境界

禁止:

- Firestore write / update / delete
- Secret payload読取
- IAM変更
- API enable/disable
- document本文をterminalへ表示

Cloud write freezeそのものはO-12iの別手順で実施する。本runbookはfreeze済みFirestoreをread-onlyで保存するだけ。

`scripts/o12e-firestore-evidence.py` は既知six collection groupsをcollection-group queryで各1回読み、Cloud Shell homeへprivate evidence bundleを作る。

## 4. 保存対象

- `sleep_records`
- `health_metric_records`
- `processed_drive_files`
- `drive_sync_runs`
- `ingest_batches`
- `metric_audit_summaries`

present categoryはすべて:

```text
firestore-archive/<collection>.jsonl
```

として保存する。

`o12e-firestore-evidence.json`には各categoryの:

- presence
- sourceCount
- archive relativePath
- byteLength
- SHA-256

を記録する。

## 5. 費用境界

Firestore document readは既存Google Cloud projectのFirestore usageとして扱われる。

**実行するO-12i当日に**公式Firestore pricingを確認する。

このscriptが行うCloud側operation:

- six read queries
- matching Firestore document reads
- Firestore write/update/delete: **0**

新しい有料service・subscription・定期課金は追加しない。

料金を発生させたくない場合の停止点はscript実行前。

## 6. Cloud Shell command

既存outputと衝突しないtimestamp directoryを使う。

```bash
PROJECT="sleep-improvement-cloud"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$HOME/o12e-firestore-evidence-$STAMP"
SCRIPT="$HOME/o12e-firestore-evidence.py"

curl -fsSL \
  "https://raw.githubusercontent.com/il-piccola/sleep-improvement-app/master/scripts/o12e-firestore-evidence.py" \
  -o "$SCRIPT"

python3 "$SCRIPT" \
  --project "$PROJECT" \
  --output-dir "$OUT"
```

成功時にterminalへ出すのは次だけ:

- project
- user roots count
- six collection document counts
- evidence file path
- bundle ZIP path
- bundle SHA-256
- `Firestore writes/updates/deletes: 0`

health values / Firestore document本文 / user IDは表示しない。

## 7. Multiple user roots

collection group内で複数の `users/{userId}` rootを検出した場合、scriptは具体的user IDを表示せず `BLOCKED` で終了する。

この場合、勝手に最大件数user等を選ばない。

## 8. Download

成功後、表示されたZIP pathをdownloadする。

```bash
cloudshell download "$OUT.zip"
```

downloadしたZIPはN100のrepository配下:

```text
migration-input/o12e-firestore-evidence-<timestamp>.zip
```

へ置く。

`migration-input/` は `.gitignore` 対象。ZIPやFirestore archiveをGitへcommitしない。

## 9. 返却してよい情報

ChatGPTへ返す場合はterminal summaryのみ。

返却可:

```text
Firestore final preservation: PASS
user roots: <count>
sleep_records: <count>
health_metric_records: <count>
processed_drive_files: <count>
drive_sync_runs: <count>
ingest_batches: <count>
metric_audit_summaries: <count>
bundle sha256: <sha256>
Firestore writes/updates/deletes: 0
```

返却しない:

- archive JSONL本文
- health values
- Firestore user ID
- access token
- Secret/OAuth credential

## 10. 完了後

ZIPをN100へ置いた後は [`o12e-n100-final-migration-runbook.md`](./o12e-n100-final-migration-runbook.md) で:

- ZIP/artifact integrity確認
- local private保存
- local legacy stateのpresence/absenceとarchive
- Google Drive copy
- local / Drive SHA-256一致

だけを確認する。

すべてPASSしたらO-12iのfinal-preservation gateを通過できる。

Firestore削除はまだ行わず、write freezeを維持したままlocal-only operationを確認し、その後O-12jへ進む。
