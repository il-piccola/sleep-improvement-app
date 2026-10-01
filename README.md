# Sleep Compass

Sleep Compass is a self-hosted, cross-device sleep dashboard. It imports iPhone Health sleep data via Health Auto Export and Google Drive, then displays it on the web and Android. The project focuses on sync visibility, missing-data explanations, configurable sleep-day boundaries, sleep stage visualization, and gentle self-monitoring insights rather than medical diagnosis.

Current web features include month-based sleep views, timeline and split-sleep summaries, REM/Core/Deep sleep stage display when source data provides it, data diagnosis, sync status visibility, and a consolidated data import / sleep source settings screen.

The Web application is local-first and does not use Firebase, Firebase Authentication, Firebase Hosting, or the legacy Cloud API. The production Web build reads from the local API through the same-origin `/api` path. Android-specific Firebase/Cloud compatibility is maintained as a separate mobile boundary.

For the scheduled Google Drive sync setup, see [O-10 Drive Auto Sync](docs/o10-drive-auto-sync.md).
For the consolidated data import and sleep source settings screen, see [O-11 Data Import Screen Consolidation](docs/o11-data-import-screen-consolidation.md).
For Tailscale URL coexistence and future URL changes, see [O-14 Tailscale URL Coexistence](docs/o14-tailscale-url-coexistence.md).
For the planned Cloudflare and N100 Linux Live USB migration, see [O-15 Cloudflare / Live USB Migration Plan](docs/o15-cloudflare-live-usb-migration.md).
For scoped runtime reads and the incremental Processor implementation, see [O-15b Validation and Implementation Results](docs/o15b-incremental-processing-validation.md).
For the deferred N100-to-Mac mini migration, start with [Mac mini Migration Handoff](docs/o15-mac-mini-migration-handoff.md), including the configuration and LaunchAgent templates. The migration has not been executed.

## Local Web operation

For a production build behind a private access gateway, run `npm run build` and then
`npm run serve:production` alongside `npm run server`. The production Web server binds
only to `127.0.0.1:5180`, serves `dist`, and forwards same-origin `/api` requests to
`127.0.0.1:8787`. Set `SLEEP_COMPASS_WEB_PORT` if port 5180 is unavailable. Port
4173 is reserved for Moonlight Bamboo!! on this host. For domain-free remote
access, the Cloudflare Worker in `cloudflare/worker.mjs` uses a Workers VPC
Service to reach the local Web port and requires Cloudflare Access identity.
See [O-15 Cloudflare deployment progress](docs/o15-cloudflare-deployment-progress.md).

On the current Windows host, keep the production Web available after logon with:

```powershell
npm run build
powershell -ExecutionPolicy Bypass -File .\scripts\install-production-web-task.ps1 -StartNow
$env:SLEEP_COMPASS_WEB_URL = 'http://127.0.0.1:5180'
npm run runtime:check
```

The task is separate from the existing local API/Vite task. Remove it with
`scripts/uninstall-production-web-task.ps1` if the Cloudflare route is retired.

Start the Web application and its local API together before opening the Tailscale URL:

```powershell
npm run dev:all
```

Tailscale Serve forwards `https://leto.taile04360.ts.net:8443/` to Web port `5173`, and the Web `/api` proxy forwards to the local API on port `8787`. If the `dev:all` process is stopped, the Tailscale page returns `502 Bad Gateway` and the browser may show `Load failed`.

Configure the Sleep Compass endpoint with:

```powershell
tailscale serve --bg --https=8443 http://127.0.0.1:5173
```

The default HTTPS endpoint, `https://leto.taile04360.ts.net/`, serves Moonlight Bamboo!! on port `4173`. Keep that mapping when configuring Sleep Compass. Both endpoints are accessible only within the tailnet. Browser preferences stored under the previous URL need to be configured again at the new URL; server-side sleep data is shared with the existing local runtime.

### Windows local runtime

Register the local runtime to start at Windows logon:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-local-runtime-task.ps1 -StartNow
```

The task starts `scripts/run-local-runtime.ps1`. `dev:all` restarts the API or Web child process after an unexpected exit. Runtime logs are written to the ignored `runtime-logs` directory.

Check Web availability, API availability, watcher state, and Processed Data freshness without printing health-data values:

```powershell
npm run runtime:check
```

The API health endpoint is available at `http://127.0.0.1:8787/api/healthz`. It reports `503` when the watcher is stopped, the raw Google Drive sync folder cannot be inspected, or the Processed Data snapshot is behind the raw JSON metadata.

## Android display app verification

Sleep Compass is also packaged as a Capacitor Android display app. The Android app is a viewer for the existing Cloud Run / Firestore data flow; it does not collect Android health data directly.

Verified on Pixel 10a:

- `installDebug` succeeded.
- Sleep Compass launched without a blank screen or crash.
- Firebase Google sign-in succeeded.
- The app returned to Sleep Compass after sign-in.
- Firebase ID token retrieval succeeded.
- Cloud API data display succeeded.
- Latest sleep data displayed.
- Data diagnosis tab displayed.
- Sign-in state persisted after app restart.
- Logcat did not show `idToken`, `accessToken`, `credential`, `Authorization`, `Bearer`, or JWT-like `eyJ` token output during the verification pass.
- `android/app/google-services.json` remains local-only and must not be committed.

Local Android notes:

- `google-services.json` is required at `android/app/google-services.json`.
- Use JDK 21 for the Android Gradle build.
- The Android package name is `com.maya.sleepimprovement`.

## Android Debug APK local operation

Use this flow when updating and reinstalling the Android display app locally.

For updating Pixel 10a without a USB connection, see [Android APK distribution notes](docs/android-apk-distribution.md).
For the next distribution steps, see [Android distribution roadmap](docs/android-distribution-roadmap.md).
For the Google Play internal testing preparation plan, see [Android Play internal test plan](docs/android-play-internal-test-plan.md).
For Play Console account and app setup checks, see [Android Play Console prerequisites](docs/android-play-console-prerequisites.md).
For mobile distribution cost boundaries, see [Mobile distribution costs](docs/mobile-distribution-costs.md).
For the current web-only operation policy, see [Mobile development freeze](docs/mobile-development-freeze.md).

Prerequisites:

- JDK 21 is required.
- Android Studio, Android SDK, and `adb` are required.
- `android/app/google-services.json` must exist locally.
- `google-services.json` must not be committed.
- Android package name: `com.maya.sleepimprovement`.
- The Android app is display-only. It does not collect Health Connect, Google Fit, or Android device health data.
- Sleep data is displayed through the existing Cloud API.

Build and sync web changes into Android:

```powershell
npm run build
npx cap sync android
```

This builds the web app into `dist` and syncs the Capacitor Android project.

Build the debug APK:

```powershell
cd android
.\gradlew.bat assembleDebug
```

Debug APK path:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

Archive a named debug APK:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/package-debug-apk.ps1
```

This command builds the web app, syncs Capacitor Android, runs `assembleDebug`, and copies the generated debug APK into:

```text
dist-apk/
```

Naming format:

```text
SleepCompass-debug-YYYYMMDD-<shortCommit>.apk
```

Example:

```text
SleepCompass-debug-20260603-16a8efc.apk
```

If the working tree has uncommitted changes when the script runs, the filename includes `-dirty` so the APK is easy to distinguish from a clean commit build.

APK archive notes:

- `dist-apk/*.apk` is ignored by Git.
- APK binaries should not be committed.
- `dist-apk/.gitkeep` only keeps the local archive folder available in the repository.
- Use saved APKs when reinstalling a known working local build or returning to a previous working version.

Install a saved APK:

```powershell
adb install -r dist-apk/SleepCompass-debug-20260603-16a8efc.apk
```

Windows full-path `adb` example:

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" install -r dist-apk/SleepCompass-debug-20260603-16a8efc.apk
```

Install on Pixel 10a:

```powershell
cd android
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" devices
.\gradlew.bat installDebug
```

`adb devices` should show Pixel 10a as `device`. If it shows `unauthorized`, allow USB debugging on the phone.

Launch the app:

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" shell monkey -p com.maya.sleepimprovement 1
```

Check:

- Sleep Compass launches.
- The screen is not blank.
- Google sign-in works.
- Latest sleep data is displayed.
- Data diagnosis is displayed.
- Sign-in state persists after app restart.

Check Logcat for normal errors:

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" logcat -d | findstr /i "FATAL EXCEPTION com.maya.sleepimprovement Firebase Auth WebView 401 500"
```

Check Logcat for token leakage:

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" logcat -d | findstr /i "idToken accessToken credential Authorization Bearer eyJ"
```

Expected:

- No `FATAL EXCEPTION`.
- No Cloud API `401` or `500` after sign-in.
- No `idToken`, `accessToken`, `credential`, `Authorization`, `Bearer`, or JWT-like `eyJ` output.

`google-services.json` handling:

- Place it at `android/app/google-services.json`.
- Do not commit it.
- Download it from Firebase Console when needed.
- Keep the filename exactly `google-services.json`.
- Do not leave it as `google-services (1).json` or another downloaded filename.

Troubleshooting:

- If `adb devices` does not show the phone, check USB debugging, the USB cable, and the phone-side permission prompt.
- If the phone is `unauthorized`, allow USB debugging on Pixel 10a.
- If Gradle is not using Java 21, set `JAVA_HOME` or Android Studio Gradle JDK to JDK 21.
- If Google sign-in fails, check the Firebase Android app SHA-1/SHA-256 settings and refresh `google-services.json`.
- If Cloud API returns `401`, check sign-in state and Firebase ID token retrieval.

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
