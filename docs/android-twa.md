# Mosaic on Android — a Trusted Web Activity

Mosaic ships to Google Play as a **Trusted Web Activity (TWA)**: a small native
shell whose only job is to open `https://mosaic-app-rho.vercel.app` in a
full-screen Chrome view, with no URL bar and no browser chrome. The web app is
the app. Deploying to Vercel updates the phone immediately; no new release is
needed for a frontend change.

Why this and not Capacitor or a rewrite:

- Requests stay **same-origin**, so the `m2_session` HttpOnly cookie
  (`server/auth.js`) keeps working and `api/[route].js` needs no CORS headers.
- The API keys stay server-side, exactly as they are now.
- There is no second copy of the UI to maintain.

## What is already in place

| Requirement | Where |
| --- | --- |
| Web app manifest, `display: standalone`, 192/512/maskable icons | `public/manifest.webmanifest` |
| Service worker with an offline fallback | `public/sw.js`, `public/offline.html`, registered in `src/main.jsx` |
| Digital Asset Links file (fingerprint still a placeholder) | `public/.well-known/assetlinks.json` |
| Back button closes the reader instead of leaving the app | `src/ui/reader/Reader.jsx` |
| Verified production host | `mosaic-app-rho.vercel.app` |

Vite copies everything under `public/` into `dist/`, including `.well-known/`,
so Vercel serves these files at the paths above.

## One-time setup

### 1. Prerequisites

```sh
npm i -g @bubblewrap/cli
```

On first run Bubblewrap offers to download the JDK and the Android SDK
command-line tools. Accept. Everything lands under `~/.bubblewrap`.

### 2. Generate the Android project

Keep it **outside** this repo's `app/` directory, or add it as its own
directory with its own git history. It is a full Gradle project.

```sh
mkdir -p ~/code/mosaic-android && cd ~/code/mosaic-android
bubblewrap init --manifest https://mosaic-app-rho.vercel.app/manifest.webmanifest
```

Answers that matter:

- **Application ID / package name**: `app.mosaic.twa`. This must match
  `package_name` in `public/.well-known/assetlinks.json`. It can never be
  changed after the first Play upload.
- **Display mode**: `standalone`.
- **Status bar colour**: `#f5f0e6`.
- **Signing key**: let Bubblewrap create `android.keystore`. Store the keystore
  file and both passwords in a password manager. Losing them means losing the
  ability to upload an update under this listing.

### 3. Build

```sh
bubblewrap build
```

Output:

- `app-release-bundle.aab` — upload this to Play Console.
- `app-release-signed.apk` — install this on a phone for testing.

### 4. Wire up Digital Asset Links

Without a matching `assetlinks.json` the app opens with a Chrome URL bar
across the top. Two fingerprints have to be listed, because Play re-signs the
app with its own key:

1. **Upload key** (your local keystore):
   ```sh
   bubblewrap fingerprint list
   ```
2. **Play app signing key**: Play Console → your app → Test and release → Setup
   → App signing → *SHA-256 certificate fingerprint*. This value only exists
   after the first bundle upload.

Put both in the array:

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "app.mosaic.twa",
      "sha256_cert_fingerprints": ["<upload key>", "<play signing key>"]
    }
  }
]
```

Edit `public/.well-known/assetlinks.json`, then deploy. Verify the live file:

```sh
curl -s https://mosaic-app-rho.vercel.app/.well-known/assetlinks.json
```

### 5. Test on a real phone

```sh
adb install -r app-release-signed.apk
```

Check all five:

- No URL bar at the top. A URL bar means asset-link verification failed.
- Sign-in works and survives closing and reopening the app.
- The system back button closes the reader, then walks back through the pages,
  then leaves the app from the desk.
- Turn on airplane mode and cold-start the app. It must show the desk or the
  offline page, never a Chrome error page.
- Media embeds play (YouTube, Spotify).

## Play Console checklist

- **App access**: Mosaic is password-gated. Give reviewers a working name and
  password, or stay on a testing track.
- **Privacy policy**: a public URL is mandatory. It must cover the account
  name, the password, the saved threads, and the third-party services the
  server calls (Groq, Tavily, Upstash, Vercel).
- **Data safety form**: declare account info and user-generated content, and
  state whether it is encrypted in transit (it is) and whether people can ask
  for deletion.
- **Content rating**: fill in the questionnaire.
- **Target API level**: Google raises the minimum every August. Bubblewrap's
  current template targets a compliant level. Confirm in Console before upload,
  and re-run `bubblewrap update` if Console complains.
- **Release track**: for an invite-only app, use **internal testing** (up to
  100 tester emails). A production release from a personal developer account
  requires closed testing with 12 testers for 14 days first. Check the current
  rule in Console — it has changed before.

## Keeping it up to date

A frontend change needs nothing: deploy to Vercel.

A change to the shell (app name, icons, theme colour, Android target level)
needs a new bundle:

```sh
bubblewrap update   # pulls the manifest again and bumps the tooling
bubblewrap build
```

`bubblewrap update` rewrites the files it generated. Keep any hand-written
native code in **new** files, and keep the project in git, so an overwrite is
visible and recoverable.

## Later: a home-screen widget

A widget is possible in this same project, but it is native work, not web
work:

- It is built with `RemoteViews` in a Kotlin `AppWidgetProvider`. None of
  Mosaic's CSS applies.
- It cannot read the `m2_session` cookie — that lives inside Chrome's cookie
  jar, not the app's. The widget needs its own bearer token in native storage,
  plus one read-only endpoint that accepts it (for example, today's four items
  or the open threads).
- Tapping it deep-links back into the app at a hash route, such as
  `https://mosaic-app-rho.vercel.app/#/t/<id>`.

Estimate: one to two days once the TWA is live. Nothing above blocks it.
