# O-10 Drive Auto Sync

O-10 adds a scheduled Google Drive sync path for Sleep Compass.

The goal is to stop depending on manual sync for normal daily operation. The scheduler calls the existing Drive sync route once per day, then the web app reads the updated Firestore view data as before.

## Current State

- Cloud Scheduler job: `sleep-drive-sync-daily`
- Schedule: `0 8 * * *`
- Time zone: `Asia/Tokyo`
- Target: private Cloud Run sync service
- Auth model: Cloud Scheduler OIDC + Cloud Run IAM
- Manual token-based sync remains supported for the public API route.

The project still keeps the main web/API surface on the public `sleep-improvement-api` service. A separate private service is used for scheduled Drive sync:

- Public app/API service: `sleep-improvement-api`
- Private scheduled sync service: `sleep-improvement-drive-sync-api`

The private service is not meant for browser traffic. It is invoked by Cloud Scheduler using a dedicated service account.

## Why a Private Sync Service Exists

The original scheduled job used a static `Authorization: Bearer ...` header. That worked, but it left the sync token in Scheduler job configuration.

The O-10 setup uses a dedicated Cloud Scheduler service account instead:

```text
Cloud Scheduler
  -> OIDC token
  -> private Cloud Run service
  -> /api/drive-sync
```

Cloud Run IAM verifies the scheduler identity before the request reaches the container. The container allows this path only when `DRIVE_SYNC_TRUST_CLOUD_RUN_IAM=true` is set on the private sync service.

Do not set `DRIVE_SYNC_TRUST_CLOUD_RUN_IAM=true` on the public app/API service.

## Code Changes

The Cloud API now supports two Drive sync authorization paths:

1. Existing static bearer token auth for manual/admin sync.
2. Scheduler OIDC / Cloud Run IAM trust for the private sync service.

The route behavior remains the same after authorization:

- list Health Auto Export JSON files in Google Drive
- skip already processed files
- normalize sleep records
- save sleep records and health metric records
- record sync status in Firestore

No Firestore schema migration was required.

## Cost Boundary

Cloud Scheduler pricing is per job per month. Google Cloud currently provides a small free allowance per billing account. This project uses one daily sync job for this feature.

Normal Cloud Run and Firestore usage still applies when the job runs. This feature should remain lightweight because it runs once daily and reuses the existing Drive sync path.

## Verification

Verified during O-10 setup:

- `npm test`
- `npm run build`
- `npm run lint`
- `cloud-api npm run build`
- private Cloud Run sync service deployed
- Scheduler job updated to OIDC
- manual Scheduler run returned HTTP 200

## Daily Operation Check

After the next scheduled run, check the web app's data diagnosis tab:

- final Drive sync time updated
- latest Drive file looks current
- previous checked/processed/skipped/error counts look natural
- latest sleep record and latest sleep day are current
- top page latest sleep still appears naturally

If the sync time updates but sleep data does not, check whether the latest Health Auto Export JSON actually contains sleep analysis records.

If the sync time does not update, check:

- Cloud Scheduler job state
- Cloud Scheduler run logs
- private Cloud Run sync service request logs
- Google Drive folder sharing and Drive API access

## Safety Notes

- Do not commit sync tokens.
- Do not commit `android/app/google-services.json`.
- Do not write Drive folder IDs, token values, or raw health data values into public docs.
- Do not expose the private sync service as a browser-facing API.
- Keep Android and iOS work frozen unless separately approved.
