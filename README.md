# PhotoScout

A private (sideloaded) Android app for geotagging scouting photos on a map,
plus a Firebase-backed public map you can share with a client.

- `mobile-app/` &mdash; the Capacitor Android app (camera + GPS capture, offline
  sync queue, your own map of every site you've scouted).
- `web/` &mdash; the public client-facing map (`web/public/index.html`) and the
  admin panel (`web/public/admin/`), hosted for free on **GitHub Pages** (same
  pattern as your `sheseating-map` project: a GitHub Actions workflow
  publishes just the `web/public/` subfolder). Firestore/Storage/Auth stay on
  Firebase regardless of where the static pages are hosted.

All three surfaces (mobile app, admin site, public map) read/write the same
Firestore `sites` collection and Cloud Storage bucket.

## 1. Create the Firebase project

1. Go to https://console.firebase.google.com &rarr; **Add project** &rarr; name
   it `photoscout` (or anything) &rarr; finish the wizard (Analytics optional).
2. **Build &rarr; Firestore Database** &rarr; Create database &rarr; production
   mode &rarr; pick a region.
3. **Build &rarr; Storage** &rarr; Get started &rarr; production mode.
4. **Build &rarr; Authentication** &rarr; Sign-in method &rarr; enable
   **Email/Password**.
5. **Authentication &rarr; Users &rarr; Add user** &rarr; use your own email and a
   password. This is the one admin login shared by the mobile app and the
   admin site.
6. **Project settings (gear icon) &rarr; General &rarr; Your apps &rarr; Web app**
   (the `</>` icon) &rarr; register an app (no Hosting setup needed here) &rarr;
   copy the `firebaseConfig` object it shows you.
7. Paste that object into **both**:
   - `web/public/shared/firebase-config.js` (copy from
     `firebase-config.example.js` first)
   - `mobile-app/www/shared/firebase-config.js` (copy from
     `firebase-config.example.js` first)

Both files get committed to git as normal &mdash; Firebase's web config
(`apiKey`, `authDomain`, etc.) isn't a secret; it has to be publicly visible
in the deployed page for the app to work at all. The real security boundary
is the Firestore/Storage rules (`web/firestore.rules`, `web/storage.rules`)
and the Authentication → Authorized domains list, not hiding this file.

## 2. Deploy Firestore/Storage security rules

```
npm install -g firebase-tools   # one-time
firebase login
cd PhotoScout/web
# edit .firebaserc and replace REPLACE_WITH_YOUR_FIREBASE_PROJECT_ID
firebase deploy --only firestore:rules,storage
```

(No `hosting` target &mdash; the static pages are served by GitHub Pages
instead, see step 3.)

## 3. Push to GitHub and turn on Pages

1. Create a new repo (public, since Pages is free for public repos):
   `gh repo create PhotoScout --public --source=. --remote=origin` (or create
   it on github.com and `git remote add origin <url>`).
2. `git push -u origin master`
3. Repo &rarr; **Settings &rarr; Pages** &rarr; Source: **GitHub Actions**. The
   `.github/workflows/deploy-pages.yml` workflow (already committed) publishes
   `web/public/` on every push that touches it, and can also be run manually
   from the Actions tab.
4. Map goes live at `https://<your-github-username>.github.io/PhotoScout/`,
   admin panel at `.../PhotoScout/admin/`.
5. Back in the Firebase console: **Authentication &rarr; Settings &rarr;
   Authorized domains &rarr; Add domain** &rarr; add
   `<your-github-username>.github.io`, otherwise the admin panel's login will
   be rejected as coming from an unrecognized origin.

## 4. Build the Android app

```
cd PhotoScout/mobile-app
npm install
npx cap add android
npx cap sync
cd android
./gradlew assembleDebug
```

The unsigned debug APK lands at
`mobile-app/android/app/build/outputs/apk/debug/app-debug.apk`. Copy it to
your phone (or `adb install -r app-debug.apk` over USB) and install it &mdash;
you'll need to allow "install unknown apps" for whatever app you use to open
it, since this isn't going through the Play Store.

For a longer-lived install, generate a release keystore once and build
`./gradlew assembleRelease` instead &mdash; ask if you want this wired up.

## Public location suggestions

Anyone on the public map can hit **+ Suggest a location**, drop a pin, and
submit a title/notes/photo &mdash; no login required. These are written
straight to Firestore as `published: false, submittedByPublic: true`, so they
never appear on the public map. They show up in a **Pending Suggestions**
panel at the top of the admin page, where you can **Approve & Publish** (sets
`published: true`) or **Reject** (deletes the doc and its photo).

Security rules (`web/firestore.rules` / `web/storage.rules`) enforce this
server-side: an unauthenticated write can only *create* a new doc shaped
exactly like a pending suggestion (never edit/delete an existing site, never
publish directly), and can only *upload* a brand-new photo file (never
overwrite an existing one). Redeploy rules after pulling this change:
`firebase deploy --only firestore:rules,storage`.

## Session fee payment + booking notification

Two independent buttons, not a backend integration &mdash; nothing is sent or
charged automatically, and no SMS-sending service, email service, or payment
API is involved. Both just open the client's own apps, pre-filled, for them
to complete, and both are enabled/disabled together based on the same
name/phone/date/selection validation:

- **"Step 1: Schedule My Shoot"** hands the tab off to a booking summary
  (name, phone, requested date/time, selected locations), pre-filled and
  ready to send. *Where* depends on the device (checked via
  `navigator.userAgent` in `isMobileDevice()`): on a phone it's an `sms:`
  link (the texting equivalent of `mailto:`) to `SCHEDULE_REQUEST_PHONE`; on
  desktop, with no SMS app to hand off to, it's a `mailto:` link to
  `SCHEDULE_REQUEST_EMAIL` instead. They still have to hit send themselves.
- **"Step 2: Pay Now with Venmo"** opens a pre-filled Venmo payment request
  (`venmo.com/u/<you>?txn=pay&amount=195&...`) in a new tab; they still
  confirm and hit Pay themselves inside Venmo. It's independent of Step 1 on
  purpose &mdash; the client can pay before, after, or without ever texting/
  emailing (a caption under the buttons says as much).

To set it up, in `web/public/shared/firebase-config.js`:
- `SCHEDULE_REQUEST_PHONE` &mdash; your number in E.164 format (e.g.
  `+15551234567`), used on mobile.
- `SCHEDULE_REQUEST_EMAIL` &mdash; fallback address for desktop visitors.
- `VENMO_USERNAME` &mdash; your Venmo username with no `@`, exactly as it
  appears in your profile URL (`venmo.com/u/<this part>`).
- `SESSION_FEE_AMOUNT` / `SESSION_FEE_LABEL` &mdash; the numeric amount used
  in the Venmo link and the display text in the button (`195` / `"$195"`).

All of these are plain constants, not secrets &mdash; safe to change any
time, takes effect on the public map immediately (static file, no rebuild).
Note the Venmo link only does anything useful on a phone (or with Venmo
installed/logged in) &mdash; on a desktop browser with no Venmo session,
nothing visible will happen when Step 2 is clicked.

## Data model

Firestore collection `sites`, one document per scouted location:

| field           | type                        | notes                                   |
|-----------------|-----------------------------|------------------------------------------|
| `title`         | string                      |                                          |
| `lat`, `lng`    | number                      |                                          |
| `notes`         | string                      | editable from the app AND the admin site |
| `pixiesetLinks` | array of `{label, url}`     |                                          |
| `photoUrl`      | string                      | Cloud Storage download URL              |
| `published`     | bool                        | `false` = staged/pending, hidden from public map |
| `createdBy`     | string (auth uid)           | absent on public suggestions             |
| `submittedByPublic` | bool                    | true if submitted via the public "Suggest a location" form |
| `submitterName`, `submitterContact` | string     | optional, only present on public suggestions |
| `createdAt`/`updatedAt` | timestamp           |                                          |

Photos live at `sites/{siteId}/photo.jpg` in Cloud Storage.
