# React + TypeScript + Vite

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
