# Mobile Development Freeze

This note records the decision to pause Android and iOS app development and focus Sleep Compass on web app operation for now.

## Current policy

Sleep Compass is switching back to web-first operation.

The current primary surface is:

- Firebase Hosting
- Cloud Run
- Firestore
- Google Drive sync
- Health Auto Export import
- Sleep data display
- Data diagnosis
- Web UI improvements

Android and iOS app development are frozen until there is a separate, explicit decision to resume them.

## Why mobile work is frozen

Mobile app distribution and update routes add cost and operational overhead.

- Google Play Developer account costs US$25 as a one-time fee.
- Apple Developer Program costs US$99 per year.
- Firebase App Distribution upload worked, but Pixel 10a blocked the install through Play Protect.
- Google Play internal testing, TestFlight, and store distribution should not be treated as casual next steps.

For now, the project gets more value from stabilizing the web app than from pushing into paid mobile distribution routes.

## Android status

- Android display app development is stopped for now.
- Google Play internal testing is stopped.
- Firebase App Distribution retries are stopped.
- Release keystore work is stopped.
- AAB creation is stopped.
- Google Play distribution work is stopped.
- The debug build already installed on Pixel 10a is reference-only.

If an Android update is needed later, use the existing local debug workflow deliberately, with PC connection and `installDebug`. Do not treat PC-free Android updates as an active goal.

## iOS status

- Capacitor iOS work is stopped.
- TestFlight planning is stopped.
- App Store planning is stopped.
- IPA or iOS project generation is not an active task.
- Apple Developer Program payment is not approved.

Any future iOS work must first state the cost boundary and get explicit approval before TestFlight or App Store-related work begins.

## Web app focus

Continue improving the web app instead.

Useful next candidates:

- Web operation checks.
- O-8b Cloud API sleepDay boundary review.
- Data diagnosis improvements.
- Weekly summary design.
- README and docs cleanup.
- Gentle AI-assisted summaries only after the data layer is clear.

## Safety rules

- Do not start Android or iOS implementation without explicit approval.
- Do not create release keystores, AABs, IPAs, or iOS projects as part of web-focused work.
- Do not pay Google Play or Apple Developer fees without explicit approval.
- Do not commit `android/app/google-services.json`.
- Do not commit APK, AAB, or IPA binaries.
- Do not write token, Secret, Firebase config values, keystore passwords, or personal health data values into documentation.
- Do not change Cloud API, Firestore, Drive sync, save processing, or Android authentication as part of this policy.
