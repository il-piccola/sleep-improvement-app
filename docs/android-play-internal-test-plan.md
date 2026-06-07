# Android Play Internal Test Plan

This note captures the Google Play internal testing option after the Sleep Compass debug APK was successfully uploaded to Firebase App Distribution but was blocked on Pixel 10a by Google Play Protect during installation.

As of 2026-06-08, this route is frozen because creating a Google Play Developer account requires a one-time US$25 registration fee. Do not proceed with Play Console setup, release signing, or AAB work until that cost is intentionally approved.

Reference: [Get started with Play Console](https://support.google.com/googleplay/android-developer/answer/6112435)

## Current state

- Debug APK installation through `adb installDebug` works on Pixel 10a.
- The Android display app starts successfully.
- Firebase sign-in works on the Android app.
- The app returns to Sleep Compass after sign-in.
- Cloud API display works.
- The Firebase App Distribution upload succeeded.
- Pixel 10a blocked the Firebase App Distribution install with a Play Protect warning.
- `android/app/google-services.json` remains local-only and is not committed.
- APK binaries in `dist-apk/*.apk` remain uncommitted.

## Interpretation

Firebase App Distribution proved that the APK can be uploaded and assigned to a tester, but the Pixel 10a environment blocked installation before the update could be verified.

For this device environment, Firebase App Distribution is not the strongest PC-free update route. Google Play internal testing is the next formal route, but it is currently on hold because it requires a paid Google Play Developer account.

Until that cost is approved, the practical fallback is:

1. Keep using the debug build already installed on Pixel 10a.
2. When an update is needed, connect Pixel 10a to the PC and use `installDebug`.
3. Revisit PC-free updates later through Google Play internal testing only if the developer account fee is worth it.

## Frozen route: Google Play internal testing

Do not move toward Google Play internal testing yet.

If this route is resumed later, the target route is:

1. Create or confirm the Google Play Console app for `com.maya.sleepimprovement`.
2. Prepare release signing.
3. Build a release Android App Bundle.
4. Register release signing fingerprints with Firebase.
5. Add the tester account.
6. Publish to the internal test track.
7. Verify update/install on Pixel 10a through the Play testing flow.

## Required preparation

These items are not active tasks right now. They are recorded only so the project can resume cleanly if Google Play internal testing becomes worth the fee.

### Google Play Console

- Confirm the Google Play Developer account is ready.
- Confirm the one-time US$25 developer registration fee is intentionally approved before paying.
- Create a Play Console app if it does not already exist.
- Use the package name `com.maya.sleepimprovement`.
- Keep public release out of scope for now.

### Signing

- Create a release keystore or decide how to manage the upload key.
- Do not commit the keystore.
- Do not write keystore passwords into repository files.
- Decide how to store keystore passwords locally and safely.
- Document the keystore location separately if needed, without committing secrets.

### Firebase

- Extract release SHA-1 and SHA-256 fingerprints after release signing is configured.
- Register release SHA-1 and SHA-256 in Firebase for the Android app.
- Re-download `google-services.json` if Firebase config changes require it.
- Keep `android/app/google-services.json` out of Git.

### Android build

- Build a release Android App Bundle.
- Keep generated AAB files out of Git.
- Do not replace the existing debug APK workflow yet.
- Treat release build setup as a separate phase from this planning note.

### Testing

- Add `il.piccola.fleuriste@gmail.com` as an internal tester.
- Use the internal test track for Pixel 10a verification.
- Confirm the app installs or updates through the Play testing flow.
- Confirm Sleep Compass starts.
- Confirm sign-in state and Cloud API display.
- Confirm latest sleep and data diagnosis remain visible.

## What not to do yet

- Do not pay the Google Play Developer registration fee until the route is explicitly approved.
- Do not create a release keystore in this documentation-only step.
- Do not build an AAB yet.
- Do not publish to Google Play yet.
- Do not change Cloud API, Firestore, Drive sync, save processing, or Android authentication.
- Do not commit `google-services.json`.
- Do not commit APK or AAB binaries.
- Do not include token, Secret, keystore, or Firebase config values in documentation.

## Safety rules

- Existing Sleep Compass on Pixel 10a should not be uninstalled during planning.
- The current ADB-installed debug build remains the fallback working app.
- PC-free updates are frozen unless this route is intentionally resumed.
- Any signing or Play Console work should be handled in a separate, explicit phase.
- Public release is not part of the current scope.
