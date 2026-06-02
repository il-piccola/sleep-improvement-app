# Android APK Distribution Notes

This note describes how to update the Sleep Compass Android display app without connecting Pixel 10a to the development PC by USB.

## Scope

- This is for local debug APK distribution only.
- This does not cover Google Play publishing.
- This does not cover release signing or Android App Bundle creation.
- The APK binary is not committed to Git.
- `android/app/google-services.json` remains local-only and is not committed.
- Sleep Compass remains a display app. It does not collect Android health data directly.

## Recommended short-term options

### Option A: GitHub Releases

Use this when you want a stable download link tied to a commit or milestone.

1. Build a named debug APK on the PC.
2. Create a GitHub Release.
3. Attach the APK file to the release.
4. Open the release page on Pixel 10a.
5. Download the APK and install it.

This is the clearest option for keeping a history of known working APKs.

### Option B: Google Drive

Use this when you want a quick private handoff.

1. Build a named debug APK on the PC.
2. Upload the APK to Google Drive.
3. Open Google Drive on Pixel 10a.
4. Download the APK and install it.

This is fast, but it is less structured than GitHub Releases.

### Option C: Google Play internal testing

Use this later if you want app-store-style updates.

This is a future step. It needs release signing, an Android App Bundle, Play App Signing or upload-key planning, and Firebase release SHA-1/SHA-256 registration.

## Build a named APK on the PC

Run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/package-debug-apk.ps1
```

Output:

```text
dist-apk/SleepCompass-debug-YYYYMMDD-<shortCommit>.apk
```

Example:

```text
dist-apk/SleepCompass-debug-20260603-16a8efc.apk
```

If the working tree has uncommitted changes, the filename includes `-dirty`.

## Install from Pixel 10a

1. Download the APK from GitHub Releases or Google Drive.
2. Open the downloaded APK on Pixel 10a.
3. If Android asks, allow installation from that source.
4. Choose update/install.
5. Open Sleep Compass.
6. Confirm sign-in state, latest sleep, and the data diagnosis tab.

## Reinstall a saved APK

If a newer local build is not working, reinstall a known working APK.

USB install example:

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" install -r dist-apk/SleepCompass-debug-20260603-16a8efc.apk
```

Pixel-only flow:

1. Download the older APK again from GitHub Releases or Google Drive.
2. Open it on Pixel 10a.
3. Install it as an update.

## Important notes

- Android can update the app only if the APK uses the same signing key as the installed app.
- Debug APKs are for personal verification, not broad distribution.
- Installing outside Google Play requires allowing that download source on Pixel 10a.
- Do not commit APK binaries to the Git repository.
- Do not commit `android/app/google-services.json`.
- Do not share debug APKs broadly.
- For formal distribution, move to release signing, Android App Bundle, and Google Play internal testing.

## Future Google Play internal testing notes

Before moving to Google Play internal testing:

- Create and protect a release keystore.
- Register release SHA-1 and SHA-256 fingerprints in Firebase.
- Build an Android App Bundle.
- Decide how to handle Play App Signing and the upload key.
- Add testers in Google Play Console internal testing.
- Treat public release as a separate later phase.
