# Party Android player

Kotlin + Jetpack Compose client for the party Socket.IO server. Player-only (no host admin).

## Requirements

- JDK 17+
- Android SDK (API 35) / Android Studio recommended
- A running `party-server` (`npm run serve:server` or `npm run dev` from the repo root)

## Nx / Gradle

```bash
# from repo root
nx run android:assembleDebug
nx run android:test
nx run android:installDebug   # device/emulator attached
```

Or from this directory:

```bash
./gradlew :app:assembleDebug
./gradlew :app:testDebugUnitTest
```

## CI

GitHub Actions workflow [`.github/workflows/android.yml`](../../.github/workflows/android.yml) runs when files under `apps/android/` change (PRs and pushes to `main`). It runs unit tests, builds the debug APK, and uploads a downloadable artifact named **party-android-debug** (`party-android-debug.apk`).

Download from the workflow run’s **Artifacts** section on GitHub.

## Login

The login screen asks for:

1. **Server URL** — e.g. emulator `http://10.0.2.2:8080`, device on LAN `http://192.168.x.x:8080`, or a deployed `https://…`
2. **Display name** — 1–24 characters (same rules as the web app)

The URL is persisted and reused. Changing the server disconnects and clears the previous `playerId`.

Do not set a custom `Origin` header; the Rust server allows native clients with no Origin.

## Manual dual-client checks

1. Start the server; open the web app and this Android client against the same URL.
2. Log in with different names; confirm both appear in system admin / games.
3. Re-login with the same name from Android while web is connected — web should be displaced.
4. Play one round of each game; leave a game screen and confirm maze / word survivor clocks pause.
5. Open Leaderboard; confirm top 10 and your row when outside the top.
6. Host system-remove the Android player; app should return to login.

## Scope

Player parity: quizzer, crossword, word search, sudoku, maze, word survivor, leaderboard. No host unlock or admin screens.
