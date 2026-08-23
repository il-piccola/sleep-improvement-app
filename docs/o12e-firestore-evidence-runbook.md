# O-12e Firestore evidence / archive runbook

Status: **READY — Cloud Shell 1回**  
Updated: **2026-08-24**

## 1. 安全境界

このrunbookはFirestoreのread-only evidence取得専用。

禁止:

- Firestore write / update / delete
- Cloud Run / Scheduler / Billing変更
- Secret payload読取
- IAM変更
- API enable/disable
- document本文をterminalへ表示

`scripts/o12e-firestore-evidence.py` は既知six collection groupsをcollection-group queryで各1回読み、Cloud Shell homeへprivate evidence bundleを作る。

## 2. 費用境界

Firestore document readは既存Google Cloud projectのFirestore usageとして扱われる。

実行直前に公式Firestore pricingを確認する。

このscriptが行うCloud側operation:

- six read queries
- matching Firestore document reads
- Firestore write/delete: **0**

新しい有料service・subscription・定期課金は追加しない。

無料停止点はこのrunbook実行前。O-12dまでは完了しており、Cloud dataは変更されていない。

## 3. Cloud Shell command

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

成功時に次だけ表示される:

- project
- user roots count
- six collection document counts
- evidence file path
- bundle ZIP path
- bundle SHA-256
- `Firestore writes/deletes: 0`

health values / Firestore document本文 / user IDは表示しない。

## 4. Multiple user roots

collection group内で複数の `users/{userId}` rootを検出した場合、scriptは具体的user IDを表示せず `BLOCKED` で終了する。

この場合、勝手に最大件数user等を選ばない。

## 5. Download

成功後、表示されたZIP pathをdownloadする。

例:

```bash
cloudshell download "$OUT.zip"
```

Google Cloud公式Cloud Shellの `cloudshell download` を使用する。

downloadしたZIPはN100のrepository配下:

```text
migration-input/o12e-firestore-evidence.zip
```

へ置く。

`migration-input/` は `.gitignore` 対象。ZIPやFirestore archiveをGitへcommitしない。

## 6. 返却してよい情報

ChatGPTへ返す場合はterminal summaryのみ。

返却可:

```text
O-12e Firestore evidence: PASS
user roots: <count>
sleep_records: <count>
health_metric_records: <count>
processed_drive_files: <count>
drive_sync_runs: <count>
ingest_batches: <count>
metric_audit_summaries: <count>
bundle sha256: <sha256>
Firestore writes/deletes: 0
```

返却しない:

- archive JSONL本文
- health values
- Firestore user ID
- access token
- Secret/OAuth credential

## 7. 次段階

ZIPを `migration-input/` へ置いた後、O-12e N100 final taskを1回だけ実行する。

その1回でsynthetic validation、real raw rebuild、Drive backup、local evidence、Cloud evidence merge、migration snapshot、semantic parity、final O-12e gate判定まで行う。
