# O-12a GCP read-only監査結果

Status: **PASS — current-state inventory完了、用途不明resourceはO-12j再確認対象として保留**  
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

Billingは現時点で有効であることをcurrent-stateとして記録する。O-12jより前にBilling設定を変更しない。

### Cloud Run

`asia-northeast1` で次の3 serviceを確認した。

- `sleep-improvement-api`
- `sleep-improvement-drive-sync-api`
- `maya-daily-observation-console`

最初の2件はSleep Compass repository/docsの既知resourceと一致する。

### Cloud Scheduler

- `sleep-drive-sync-daily`
- region: `asia-northeast1`
- state: `ENABLED`

repository/docs上の既知resourceと一致する。

### Artifact Registry

- repository: `cloud-run-source-deploy`
- format: `DOCKER`
- locationは初回table出力では空欄だったため、O-12aではrepository存在確認を証拠とする。

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

**APIは有効化しない。** O-12aではservice-specific inventoryを取得しており、CAI未実行自体はblockerにしない。

### Firebase Hosting

- site ID: `sleep-improvement-cloud`

## 3. `maya-daily-observation-console` 追加read-only分類

追加確認結果:

- service: `maya-daily-observation-console`
- region: `asia-northeast1`
- creationTimestamp: `2026-05-26T01:32:37.322920Z`
- latestReadyRevisionName: `maya-daily-observation-console-00009-vpx`
- container image: `asia-northeast1-docker.pkg.dev/sleep-improvement-cloud/cloud-run-source-deploy/maya-daily-observation-console@sha256...`
- Sleep Compass repository内にservice名の参照なし

このmetadataから、serviceが同projectのArtifact Registryからdeployされていることは確認できるが、用途そのものは確定できない。

O-12aでの分類は次とする。

- **Inventory status: inventoried**
- **Sleep Compass relation: unconfirmed / non-Sleep-Compass candidate**
- **Destructive action: prohibited**
- **O-12j: dedicated-project判定前に再確認必須**

用途不明であること自体を隠さず、既知の保留資産として台帳へ残す。O-12aの目的はcurrent-state inventoryであり、このserviceの用途解明や削除は必須ではない。一方、O-12jでproject全体をshutdownできるかどうかには直接影響するため、再確認なしにproject shutdownしてはいけない。

## 4. ChatGPTレビュー / Exit Gateへの扱い

`GCP-O12A-001` は **PASS**。

確認できた主要category:

- Project lifecycle / Billing enabled state
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
- 未説明Cloud Run resourceの存在とread-only metadata

`maya-daily-observation-console` は用途不明のままだが、存在・作成時刻・region・revision・image sourceを棚卸しし、削除禁止とO-12j再確認条件を明示したため、O-12a current-state inventoryの未確認resourceとしては残さない。

O-12a後も次を守る。

- `maya-daily-observation-console` を停止・削除・変更しない。
- O-12jのdedicated project判定前に用途を再確認する。
- 別用途resourceと判明した場合、`sleep-improvement-cloud` project全体のshutdownは禁止し、Sleep Compass resourceだけを個別撤去するか、別用途resourceを安全に移す計画を先に定義する。
- Firestore document内容・migration分類・reconstructionはO-12eで扱う。
