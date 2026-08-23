# O-12 Migration Source Map

Status: **ACTIVE — O-12e分類確定済み / 実evidence取得待ち**  
Primary phase: **O-12e — Existing-data migration**  
Updated: **2026-08-24**

この文書はO-12a inventoryからO-12eの `Rebuild / Migrate / Archive` を確定し、O-12jまで削除禁止境界を維持するsource mapです。

健康値そのもの、Secret payload、token、OAuth credential、Firestore document本文はこの文書へ記録しません。

## 1. 分類の意味

- **Rebuild**: canonical raw sourceまたは同等semantic evidenceからProcessed Dataへ再生成できるもの
- **Migrate**: raw sourceだけでは再現できず、現存data/stateから変換が必要なもの
- **Archive**: runtimeには不要だが、履歴・監査証拠としてprivate保存するもの
- **Runtime-only**: user dataではなく、後続phaseでCloud runtime撤去対象となるもの
- **Unclassified**: 用途未確認。停止・削除してはいけないもの

## 2. Raw / local sources

| Source | Evidence | O-12e classification | Handling |
| --- | --- | --- | --- |
| Health Auto Export JSON | N100 + Driveで存在確認 | **Rebuild** | canonical sleep/health datasetsを再生成 |
| `normalized-sleep-records.json` | 未確認 | Conditional Rebuild | 発見時のみlegacy reader input。未発見ならevidenceへ含めない |
| Apple Health `export.xml` | 未確認 | Conditional Rebuild | 発見時のみlegacy reader input |
| local `health-store.json` | repo default `server-data`はABSENT | **Rebuild if reproducible / otherwise block** | 存在時はprivate archiveを保存し、record semantic hashがcanonical `sleep-records`と一致するか確認。再現不能ならO-12eをblock |
| local `processed-files.json` | repo default `server-data`はABSENT | **Archive** | 存在時はprivate archive。canonical runtime ledgerへそのまま移植しない |

N100 raw rootの現在観測値は `L:\マイドライブ\Health Auto Export\Sleep`。これはhost boundaryであり、persistent identityやimplementation defaultへhardcodeしない。

## 3. Firestore data categories

Firestore database:

- database: `(default)`
- location: `asia-northeast1`
- type: `FIRESTORE_NATIVE`

O-12e確定分類:

| Firestore category | Classification | Evidence / handling |
| --- | --- | --- |
| `sleep_records` | **Rebuild + semantic parity** | count + common semantic projection SHA-256をlocal canonical `sleep-records`と比較。health value本文はterminalへ出さない |
| `health_metric_records` | **Rebuild + core semantic parity** | metric/value/window/sourceのcore projectionをcount + SHA-256で比較。旧Cloudとcanonicalで意図的に違うmain-sleep分類はO-12hへ分離 |
| `processed_drive_files` | **Archive** | raw Firestore document JSONLをprivate archiveしbyteLength/SHA-256をmigration evidenceへ記録 |
| `drive_sync_runs` | **Archive** | private JSONL archive |
| `ingest_batches` | **Archive** | private JSONL archive |
| `metric_audit_summaries` | **Archive** | private JSONL archive |

Firestore evidence取得は `scripts/o12e-firestore-evidence.py` でsix collection groupsをread-only scanする。

実行時:

- Firestore write/delete = 0
- document本文 / health values / user IDをterminalへ表示しない
- archive collection本文はprivate bundle内だけに保存
- rebuild collection本文はarchiveせずcount + semantic SHA-256だけをevidenceへ残す

## 4. O-12e migration artifacts

Canonical migration snapshot:

```text
snapshots/<snapshotId>/
  ... canonical datasets ...
  migration-manifest.json
  complete.json
```

Private evidence archive:

```text
migration evidence ZIP
  o12e-firestore-evidence.json
  o12e-migration-evidence.json
  firestore-archive/*.jsonl
  legacy-local/*                  # local stateが存在する場合
```

private evidence ZIPはlocalとGoogle Driveの両方へ保存し、SHA-256一致を確認する。

archive本文はGitへcommitしない。

## 5. GCP runtime / operational resources

### Sleep Compass既知resource

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

O-12a metadata:

- region `asia-northeast1`
- creationTimestamp `2026-05-26T01:32:37.322920Z`
- latest revision `maya-daily-observation-console-00009-vpx`
- same-name Artifact Registry image
- Sleep Compass repository内にservice名参照なし

classification: **Unclassified / non-Sleep-Compass candidate**

ルール:

- O-12e data migration対象ではない
- 停止・削除・変更しない
- O-12j dedicated-project判定前に用途再確認
- 別用途ならproject shutdown禁止

## 7. O-12e Exit Gateへの対応

O-12eでは:

1. real rawからcompleted canonical snapshotを生成
2. local + Google Drive snapshotをvalidate
3. local legacy state presence/absenceを確定
4. Firestore six category evidenceを取得
5. rebuild categoryのcount + semantic parityを確認
6. archive categoryのpresent dataをprivate artifactとして保存
7. evidence ZIPをGoogle Driveへ保存しSHA一致
8. `migration-manifest.json`の`unresolved=[]`を確認
9. Cloud dataは削除しない

## 8. 未確定事項

- Firestore各categoryの実document count。O-12e evidence runで確定する。
- semantic parityの実結果。O-12e N100 final runで確定する。
- `maya-daily-observation-console` の実用途。O-12jで再確認する。
- Artifact Registry repositoryのfull location表示。O-12jで必要なら確認する。

上記のうちFirestore count/parityはO-12e Exit Gate対象。`maya`/Artifact Registry locationはO-12jへ明示的に引き継ぐ。
