# Mobile Distribution Costs

This note records the cost boundaries for Android and iOS app distribution so Sleep Compass does not drift into paid setup without an explicit decision.

## Current policy

- Cost-bearing routes must be called out before work starts.
- The amount, billing frequency, payee, and free stopping point must be clear.
- Paid registration must not happen without Maya's explicit approval.
- Release signing, AAB, TestFlight, App Store, or Play Store work should be handled as separate approved phases.

## Android

### Free range

The following can be done without a Google Play Developer account:

- Build the Android display app locally.
- Install a debug APK on Pixel 10a with `adb installDebug`.
- Use the already installed debug build on Pixel 10a.
- Update the app only when needed by connecting Pixel 10a to the PC and running `installDebug`.

### Paid boundary

Google Play internal testing or Play Store distribution requires a Google Play Developer account.

- Cost: US$25
- Frequency: one-time registration fee
- Payee: Google Play Developer account / Google Play Console
- Current status: frozen

Do not move toward Google Play internal testing, Play App Signing, release AAB upload, or Play Store distribution until this cost is intentionally approved.

### Current Android operating choice

For now:

1. Keep using the debug build already installed on Pixel 10a.
2. When an update is needed, connect Pixel 10a to the PC.
3. Run the local debug install workflow.
4. Keep Google Play internal testing frozen until the US$25 fee is worth it.

Firebase App Distribution was tested. Upload succeeded, but Pixel 10a blocked installation through Google Play Protect. It is not the current stable PC-free update route.

## iOS

### Free range

The following may be possible without Apple Developer Program membership:

- Technical exploration with Xcode or a cloud Mac.
- Limited local device testing using a free Apple Developer account.
- Capacitor iOS project setup experiments that do not require TestFlight or App Store Connect distribution.

### Paid boundary

TestFlight or App Store distribution requires Apple Developer Program membership.

- Cost: US$99
- Frequency: annual membership
- Payee: Apple Developer Program
- Current status: frozen

Do not move toward TestFlight, App Store Connect upload, App Store distribution, or external iOS tester distribution until this annual cost is intentionally approved.

## Shared rules

- Any route described as "PC-free update", "TestFlight", "internal testing", "store distribution", or "public release" may involve paid platform registration.
- Before proposing such a route, document:
  - cost amount
  - billing frequency
  - payee
  - free stopping point
  - what is still possible without paying
- Do not commit `android/app/google-services.json`.
- Do not commit APK, AAB, or IPA binaries.
- Do not write token, Secret, Firebase config values, keystore passwords, or personal health data values into documentation.
- Do not change Cloud API, Firestore, Drive sync, save processing, or Android authentication as part of cost planning.

## Practical stopping point

Sleep Compass can continue as:

- Web app
- Android debug display app on Pixel 10a
- PC-connected debug updates when needed

This keeps the project usable while avoiding Google Play or Apple Developer registration fees until those costs are intentionally accepted.
