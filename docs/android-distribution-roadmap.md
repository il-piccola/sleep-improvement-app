# Android Distribution Roadmap

This note describes the next distribution options for the Sleep Compass Android display app after local debug APK installation has been verified on Pixel 10a.

## Current state

- The Android display app has been verified on Pixel 10a.
- `scripts/package-debug-apk.ps1` can create a named debug APK.
- APK files in `dist-apk/*.apk` are not committed to Git.
- `android/app/google-services.json` remains local-only and is not committed.
- Google Drive or GitHub Releases can be used as a short-term manual distribution route.
- Sleep Compass remains a display-only app. It does not collect Android health data directly.

## Short-term route: Google Drive or GitHub Releases

Use this route while the app is still a personal debug build.

### Google Drive

Google Drive is the fastest handoff path:

1. Build a named debug APK on the PC.
2. Upload the APK to Google Drive.
3. Download the APK on Pixel 10a.
4. Install it as an update.
5. Confirm Sleep Compass starts, sign-in is retained, and the latest sleep data and data diagnosis tab are visible.

This is quick, but it does not provide a structured release history.

### GitHub Releases

GitHub Releases are useful when you want a stable APK download tied to a commit or milestone:

1. Build a named debug APK on the PC.
2. Create a GitHub Release.
3. Attach the APK to the release.
4. Download it from Pixel 10a.
5. Install it as an update.

This is better than Google Drive for keeping a history of known working APKs. APK binaries should still not be committed to the repository.

## Next route: Firebase App Distribution

Firebase App Distribution is the recommended next step before Google Play internal testing.

It can provide:

- APK or AAB distribution through Firebase.
- Tester access by email.
- Easier update delivery than manually uploading to Google Drive.
- A practical pre-Play testing workflow.

Likely requirements:

- Firebase CLI.
- Firebase App Distribution enabled for the Android app.
- Android app ID for `com.maya.sleepimprovement`.
- Tester email addresses.
- A debug or release APK/AAB to distribute.

Important notes:

- This is not Google Play Store delivery.
- It is intended for tester distribution.
- A decision is needed on whether to start with debug APKs or move to release builds first.
- Secrets, tokens, and `google-services.json` values must not be written into documentation or committed.

## Later route: Google Play internal testing

Google Play internal testing is the formal next step when Sleep Compass is ready for Play-style updates.

It can provide:

- Play Store-like update flow for internal testers.
- A path toward production Play Store release.
- Better alignment with Android App Bundle delivery.

Likely requirements:

- Google Play Console setup.
- Release keystore.
- Android App Bundle.
- Play App Signing and upload key planning.
- Release SHA-1 and SHA-256 fingerprints registered in Firebase.
- Store listing basics.
- Data safety and privacy policy preparation.
- Internal tester list or group.

Important notes:

- This is heavier than debug APK distribution.
- It should be treated as a separate phase.
- Public release is not part of the current scope.

## Recommended order

1. Short term: continue with named debug APKs through Google Drive or GitHub Releases.
2. Next: use Firebase App Distribution to reduce manual APK handoff work.
3. Later: prepare release signing, AAB, and Google Play internal testing.
4. Public release: keep out of scope until privacy, support, and store requirements are ready.

## Safety rules

- Do not commit APK binaries.
- Do not commit `android/app/google-services.json`.
- Do not include token, Secret, or Firebase config values in docs.
- Do not change Cloud API, Firestore, Drive sync, save processing, or Android authentication for distribution planning.
- Treat debug APKs as personal verification builds, not broad distribution artifacts.
