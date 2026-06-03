# Android Play Internal Test Plan

This note captures the next distribution plan after the Sleep Compass debug APK was successfully uploaded to Firebase App Distribution but was blocked on Pixel 10a by Google Play Protect during installation.

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

For this device environment, Firebase App Distribution is not the strongest PC-free update route. The next practical route is Google Play internal testing, which is closer to Play Store-style delivery.

## Recommended next route

Move toward Google Play internal testing in a separate phase.

The target route is:

1. Create or confirm the Google Play Console app for `com.maya.sleepimprovement`.
2. Prepare release signing.
3. Build a release Android App Bundle.
4. Register release signing fingerprints with Firebase.
5. Add the tester account.
6. Publish to the internal test track.
7. Verify update/install on Pixel 10a through the Play testing flow.

## Required preparation

### Google Play Console

- Confirm the Google Play Developer account is ready.
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
- Any signing or Play Console work should be handled in a separate, explicit phase.
- Public release is not part of the current scope.
