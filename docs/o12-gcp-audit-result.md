# O-12a GCP read-only監査結果

Status: **PARTIAL PASS — 未説明Cloud Run service 1件の分類待ち**  
Phase: **O-12a — 現状監査**  
監査ID: **GCP-O12A-001**  
実施日: **2026-08-23**

## 1. 安全境界

Google Cloud Shellからread-only commandのみを実行した。

- API enable/disableなし
- Billing変更なし
- Cloud Run / Scheduler / Artifact Registry / Firestore / Secret Manager / Storage変更なし
- Firestore document本文read/query/exportなし
- Secret payload readなし
- Firebase Hosting変更なし
- Project変更/削除なし

## 2. 確認結果

### Project / Billing

- project: `sleep-improvement-cloud`
- lifecycleState: `ACTIVE`
- billingEnabled: `true`

### Cloud Run

`asia-northeast1` で次の3 serviceを確認した。

- `sleep-improvement-api`
- `sleep-improvement-drive-sync-api`
- `maya-daily-observation-console`

最初の2件はSleep Compass repository/docsの既知resourceと一致する。

`maya-daily-observation-console` はSleep Compass repository内を検索しても参照を確認できなかったため、O-12aでは **未説明resource** とする。削除・停止・変更は行わない。

### Cloud Scheduler

- `sleep-drive-sync-daily`
- region: `asia-northeast1`
- state: `ENABLED`

repository/docs上の既知resourceと一致する。

### Artifact Registry

- repository: `cloud-run-source-deploy`
- format: `DOCKER`
- locationは今回の表出力では空欄だったため、O-12aではrepository存在確認までを証拠とする。

### Firestore

- database: `(default)`
- location: `asia-northeast1`
- type: `FIRESTORE_NATIVE`

Firestore document本文は読んでいない。

### Secret Manager

secret名のみ確認:

- `drive-sync-api-token`
- `health-export-api-token`

payloadは読んでいない。

### Cloud Storage

- `run-sources-sleep-improvement-cloud-asia-northeast1`

### Service Accounts

- count: `5`

account名/メールは記録しない。

### Cloud Build

trigger一覧は空だった。今回の出力上、trigger名は確認されなかった。

### Relevant enabled APIs

確認したenabled API:

- `artifactregistry.googleapis.com`
- `cloudbuild.googleapis.com`
- `cloudscheduler.googleapis.com`
- `drive.googleapis.com`
- `firebase.googleapis.com`
- `firebasehosting.googleapis.com`
- `firestore.googleapis.com`
- `identitytoolkit.googleapis.com`
- `run.googleapis.com`
- `secretmanager.googleapis.com`
- `storage.googleapis.com`

### Cloud Asset Inventory

`cloudasset.googleapis.com` はenabled一覧に含まれなかったため未実行。

**APIは有効化しない。** O-12aではservice-specific inventoryを既に取得しているため、CAI未実行自体はblockerにしない。

### Firebase Hosting

- site ID: `sleep-improvement-cloud`

## 3. ChatGPTレビュー

`GCP-O12A-001` は **PARTIAL PASS**。

確認できた主要category:

- Project lifecycle / Billing
- Cloud Run
- Cloud Scheduler
- Artifact Registry
- Firestore database metadata
- Secret Manager names
- Cloud Storage bucket
- Service Account count
- Cloud Build trigger list
- relevant enabled APIs
- Firebase Hosting

O-12aの残blockerは、Sleep Compass repository/docsに参照のないCloud Run service `maya-daily-observation-console` の用途/由来の分類だけとする。

このserviceは現時点で停止・削除しない。O-12aではread-only metadataを最小追加確認し、Sleep Compass関連 / 他用途 / 不明のいずれかへ分類する。

## 4. 次の最小確認

Cloud Shellで次のread-only commandだけを実行する。

```bash
PROJECT="sleep-improvement-cloud"
SERVICE="maya-daily-observation-console"
REGION="asia-northeast1"

gcloud run services describe "$SERVICE" \
  --project="$PROJECT" \
  --region="$REGION" \
  --format='yaml(metadata.name,metadata.creationTimestamp,metadata.labels,status.latestReadyRevisionName,spec.template.spec.containers[0].image)'
```

返却するのは上記commandの出力だけでよい。

禁止:

- service update/delete
- traffic変更
- IAM変更
- env/secrets表示
- logs閲覧
- API enable/disable

この結果で用途が判別できない場合は、O-12aで「用途不明resource」として明示的に残し、Cloud撤去前のO-12j final auditでも再確認対象とする。