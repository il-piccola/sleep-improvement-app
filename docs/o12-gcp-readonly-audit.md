# O-12a GCP read-only監査手順

Status: **READY**  
Phase: **O-12a — 現状監査**  
対象project: `sleep-improvement-cloud`  
目的: N100へ`gcloud`を追加導入せず、Google Cloudの現在のcontrol-plane / Billing状態をread-onlyで確認する。

## 1. 料金・安全境界

- Google Cloud Shell自体はGoogle Cloudアカウント利用者は無料。
- 今回の手順ではCloud resourceの作成・更新・停止・削除を行わない。
- APIを有効化/無効化しない。
- Billing設定を変更しない。
- Firestore document本文をread/query/exportしない。
- Secret payloadを取得しない。
- account email、access token、billing account IDを記録しない。
- commandが権限不足またはAPI無効で失敗した場合は、設定変更せず`BLOCKED`として記録する。

## 2. 実行場所

Google Cloud ConsoleからCloud Shellを開き、以下をそのまま実行する。

```bash
PROJECT="sleep-improvement-cloud"

echo '=== PROJECT ==='
gcloud projects describe "$PROJECT" \
  --format='yaml(projectId,lifecycleState)'

echo '=== BILLING ==='
gcloud billing projects describe "$PROJECT" \
  --format='yaml(projectId,billingEnabled)'

echo '=== CLOUD RUN ==='
gcloud run services list \
  --project="$PROJECT" \
  --format='table(name,region)'

echo '=== CLOUD SCHEDULER ==='
for loc in $(gcloud scheduler locations list --project="$PROJECT" --format='value(locationId)' 2>/dev/null); do
  rows=$(gcloud scheduler jobs list \
    --project="$PROJECT" \
    --location="$loc" \
    --format='csv[no-heading](name.basename(),state)' 2>/dev/null)
  if [ -n "$rows" ]; then
    while IFS= read -r row; do
      printf '%s,%s\n' "$loc" "$row"
    done <<< "$rows"
  fi
done

echo '=== ARTIFACT REGISTRY ==='
gcloud artifacts repositories list \
  --project="$PROJECT" \
  --format='table(name.basename(),format,location)'

echo '=== FIRESTORE DATABASES ==='
gcloud firestore databases list \
  --project="$PROJECT" \
  --format='table(name.basename(),locationId,type)'

echo '=== SECRET MANAGER: NAMES ONLY ==='
gcloud secrets list \
  --project="$PROJECT" \
  --format='value(name)'

echo '=== CLOUD STORAGE: BUCKET NAMES ONLY ==='
gcloud storage buckets list \
  --project="$PROJECT" \
  --format='value(name)'

echo '=== SERVICE ACCOUNT COUNT ONLY ==='
gcloud iam service-accounts list \
  --project="$PROJECT" \
  --format='value(email)' | awk 'NF{n++} END{print n+0}'

echo '=== CLOUD BUILD TRIGGERS ==='
gcloud builds triggers list \
  --project="$PROJECT" \
  --format='table(name,disabled)' 2>/dev/null || echo 'BLOCKED_OR_API_UNAVAILABLE'

echo '=== RELEVANT ENABLED APIS ==='
gcloud services list \
  --enabled \
  --project="$PROJECT" \
  --format='value(config.name)' | \
  grep -E '(^run\.googleapis\.com$|^firestore\.googleapis\.com$|^cloudscheduler\.googleapis\.com$|^artifactregistry\.googleapis\.com$|^secretmanager\.googleapis\.com$|^cloudbuild\.googleapis\.com$|^drive\.googleapis\.com$|^firebasehosting\.googleapis\.com$|^firebase\.googleapis\.com$|^identitytoolkit\.googleapis\.com$|^cloudasset\.googleapis\.com$|^storage\.googleapis\.com$)' || true

echo '=== CLOUD ASSET INVENTORY ==='
if gcloud services list --enabled --project="$PROJECT" \
  --filter='config.name=cloudasset.googleapis.com' \
  --format='value(config.name)' | grep -q '^cloudasset.googleapis.com$'; then
  gcloud asset search-all-resources \
    --scope="projects/$PROJECT" \
    --format='value(assetType)' | sort | uniq -c
else
  echo 'CAI_NOT_ENABLED: 未実行。APIは有効化しない。'
fi

echo '=== FIREBASE HOSTING SITES: SITE ID ONLY ==='
if gcloud services list --enabled --project="$PROJECT" \
  --filter='config.name=firebasehosting.googleapis.com' \
  --format='value(config.name)' | grep -q '^firebasehosting.googleapis.com$'; then
  ACCESS_TOKEN="$(gcloud auth print-access-token)"
  curl -fsS \
    -H "Authorization: Bearer ${ACCESS_TOKEN}" \
    "https://firebasehosting.googleapis.com/v1beta1/projects/${PROJECT}/sites" | \
    python3 -c 'import json,sys; d=json.load(sys.stdin); [print(s.get("name","").split("/")[-1]) for s in d.get("sites",[])]'
  unset ACCESS_TOKEN
else
  echo 'FIREBASE_HOSTING_API_NOT_ENABLED: 未実行。APIは有効化しない。'
fi
```

## 3. 返却する内容

command出力は全文を保存せず、次だけをO-12進捗管理へ転記する。

```text
GCP-O12A-001
結果: PASS / BLOCKED
Project: lifecycleState
Billing: billingEnabled true/false
Cloud Run: service name + region
Cloud Scheduler: job name + region + state
Artifact Registry: repository name + format + region
Firestore: database ID + location + type
Secret Manager: secret名一覧
Cloud Storage: bucket名一覧
Service accounts: 件数のみ
Cloud Build: trigger name + enabled/disabled、またはBLOCKED
Relevant APIs: API名一覧
Cloud Asset Inventory: assetType別件数、または未実行理由
Firebase Hosting: site ID一覧、または未実行理由
変更: なし
エラー/ブロッカー: あれば簡潔に
```

## 4. 禁止事項

以下はこの監査では実行しない。

- `gcloud services enable` / `disable`
- `gcloud billing projects link` / `unlink`
- Cloud Run / Scheduler / Artifact Registry / Secret / Storage / Firestore resource変更
- Firestore document read/query/export
- Secret version access
- Firebase Hosting deploy/delete
- project delete / undelete
- package install
- access tokenの表示・保存

## 5. O-12aでの扱い

この監査はGCPの「現在実在するcontrol-plane resource」を確認するための証拠であり、Firestore document内容やhistorical data分類そのものはO-12eで扱う。

O-12aでは、repository上の既知resourceとこのcontrol-plane結果を突き合わせ、未説明resource categoryがないかをChatGPTが判定する。

## 6. CLI確認メモ

2026-08-23時点のGoogle Cloud公式CLI referenceで、以下をstable commandとして再確認済み。

- `gcloud projects describe`
- `gcloud billing projects describe`
- `gcloud run services list`
- `gcloud scheduler locations list`
- `gcloud scheduler jobs list`
- `gcloud artifacts repositories list`
- `gcloud firestore databases list`
- `gcloud services list`

旧 `gcloud beta billing projects describe` は使用せずstable commandを使う。Cloud Runの旧 `--platform=managed` 指定も不要なため外す。
