# Aura Live Voice & To-Do — Android App Build

This folder is a **Capacitor** project that wraps your existing web app
(`www/`) into a native Android APK, built automatically by **GitHub Actions**.

## One-time setup

1. Create a new GitHub repository (public or private).
2. Push everything in this folder to that repo:

   ```bash
   git init
   git add .
   git commit -m "Initial Capacitor Android project"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo>.git
   git push -u origin main
   ```

3. That's it. Pushing to `main` automatically triggers the workflow in
   `.github/workflows/build-apk.yml`.

## Getting your APK

1. On GitHub, go to your repo → the **Actions** tab.
2. Click the latest "Build Android APK" run (it takes ~3–5 minutes).
3. Scroll to **Artifacts** and download `aura-app-debug-apk` — this is a
   zip containing `app-debug.apk`.
4. Transfer `app-debug.apk` to your Android phone (email it to yourself,
   Google Drive, USB, etc.) and tap it to install.
   - You'll need to allow "Install unknown apps" for whichever app you
     use to open it (Chrome, Files, Gmail) — Android will prompt you.

No local server, PC, or same-Wi-Fi requirement — the APK runs standalone.

## Re-building after code changes

Just edit files inside `www/` (that's your `index.html`, `css/`, `js/`)
and push again — the Action rebuilds the APK automatically. You can also
trigger a rebuild manually from the Actions tab ("Run workflow" button)
since `workflow_dispatch` is enabled.

## Background operation (screen off)

The build now also patches in a **foreground service** that:
- Acquires a wake lock so the CPU doesn't sleep when the screen turns off
- Runs the mic session as `foregroundServiceType="microphone"`, which
  Android requires for background mic access on modern versions
- Shows a persistent low-priority notification ("Aura is listening")
  while active — Android requires this so background audio isn't silent
  to the user

With this, a live voice session keeps running with the screen off, as
long as you don't fully swipe the app away from Recents (that still
kills it — this is standard Android behavior for any app).

On first launch you'll get two permission prompts: microphone, and (on
Android 13+) notifications — allow both for background mode to work.

## Microphone & speaker

- **Speaker**: works automatically — no setup needed, WebView audio
  playback (`<audio>`, Web Audio API) just works.
- **Microphone**: the workflow automatically patches the generated
  Android project on every build to:
  1. Add `RECORD_AUDIO` (and related) permissions to `AndroidManifest.xml`
  2. Request the runtime microphone permission on app launch (required
     on Android 6+, separate from the manifest declaration)

  On first launch, Android will show a native "Allow Aura to record
  audio?" popup — tap **Allow**. After that, the app's own
  `getUserMedia()` call (already in your `js/audio-recorder.js`) will
  succeed and the mic will work normally.

  If you ever deny the permission by mistake, you'll need to re-enable
  it manually: Android Settings → Apps → Aura Live Voice → Permissions
  → Microphone → Allow.

## Notes on this specific app

- The API key is stored in `localStorage` as before — this still works
  inside the Capacitor WebView, per-device.
- This build is a **debug APK** (fine for personal/testing use, not
  signed for the Play Store). If you eventually want to publish it,
  that requires a signing key setup — ask and I can add that step.
- `main.py`, `server.py`, `gemini_client.py`, and `create_icons.py`
  from your original zip are Python dev/build helper scripts, not part
  of the shipped app — they're intentionally left out of `www/`.
