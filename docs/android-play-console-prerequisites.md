# Android Play Console Prerequisites

This note lists the Play Console checks to complete before moving Sleep Compass from debug APK distribution toward Google Play internal testing.

## Scope

- This is a planning and account-readiness checklist.
- Do not create a release keystore in this step.
- Do not build an Android App Bundle in this step.
- Do not upload anything to Google Play in this step.
- Do not change Firebase, Cloud API, Firestore, Drive sync, save processing, or Android authentication.
- Keep `android/app/google-services.json` local-only and out of Git.
- Keep APK and AAB binaries out of Git.

## Current project assumptions

- App name: Sleep Compass
- Android package name: `com.maya.sleepimprovement`
- Firebase project: `sleep-improvement-cloud`
- Android app is display-only and does not collect Android health data directly.
- Health data display comes from the existing Cloud API / Firestore pipeline.
- Firebase App Distribution upload succeeded, but Pixel 10a installation was blocked by Play Protect.
- Next practical route is Google Play internal testing.

## 1. Google Play Developer account

Confirm in Play Console:

- `il.piccola.fleuriste@gmail.com` can log in.
- The developer account is active.
- Payments, identity verification, and developer profile steps are complete or clearly understood.
- The "Create app" flow is available.
- No account-level warnings block app creation or internal testing.

If any account setup item is blocked, stop before release signing or AAB work.

## 2. Play Console app creation

Before creating the app, decide or confirm:

- App name: Sleep Compass
- Default language: likely Japanese or English, depending on intended first tester flow.
- App type: app, not game.
- Pricing: free.
- Public release: out of scope for now.

Important:

- The package name `com.maya.sleepimprovement` must be correct before the first upload.
- Package names cannot be changed after registration for a Play app.
- Do not create a separate app with a different package unless intentionally starting over.

## 3. Internal testing

Confirm that Play Console allows:

- Creating an internal testing track.
- Adding tester email `il.piccola.fleuriste@gmail.com`.
- Using an email list or Google Group if Play Console requires a tester list setup.
- Generating or sharing an internal test opt-in link.

Internal testing is the first Play route to verify:

- Play-managed install or update.
- Pixel 10a app launch.
- Firebase sign-in.
- Cloud API display.
- Latest sleep data and data diagnosis display.

## 4. Privacy and data safety preparation

Sleep Compass should avoid medical or diagnostic claims.

Prepare short, accurate wording for:

- The app is for self-monitoring, not medical diagnosis.
- The Android app is display-only.
- It does not collect Android Health Connect or Google Fit data directly.
- It displays sleep and related metrics already imported through the existing pipeline.
- It uses Firebase Authentication for sign-in.
- It calls Cloud API endpoints to display the user's data.

Likely Play Console areas to prepare for:

- Privacy policy URL.
- Data safety form.
- Health-related data disclosure.
- Account creation/sign-in disclosure.
- Data deletion or account/data request explanation.
- App access instructions for review if sign-in is required.

These items should be answered carefully before any broader testing or release.

## 5. Next technical requirements

Only after Play Console account readiness is confirmed:

- Decide release keystore / upload key management.
- Keep keystore files out of Git.
- Keep keystore passwords out of Git.
- Build a release Android App Bundle.
- Extract release SHA-1 and SHA-256.
- Register release SHA-1 and SHA-256 in Firebase.
- Refresh `android/app/google-services.json` if Firebase config changes require it.
- Keep `android/app/google-services.json` uncommitted.

## 6. Go / no-go checklist

Proceed to release signing planning only if:

- Play Console account is active.
- New app creation is available.
- `com.maya.sleepimprovement` is available for the Play app.
- Internal testing track can be created.
- Tester setup is clear.
- Privacy/data safety tasks are understood.

Do not proceed if:

- Account verification or payment setup is blocked.
- Package name uncertainty remains.
- Privacy policy or data safety answers are unclear.
- The app would need medical or diagnostic claims to pass review.

## Safety rules

- Do not commit `android/app/google-services.json`.
- Do not commit APK or AAB binaries.
- Do not write token, Secret, keystore password, or Firebase config values into documentation.
- Do not include personal health data values.
- Do not change Cloud API, Firestore, Drive sync, save processing, or Android authentication in this planning step.
