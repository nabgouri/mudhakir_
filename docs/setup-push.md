# One-time setup: syncing when Questions are ready

Without this, the phone learns that a Lesson's Questions are ready only when it next syncs: when the app is opened, or from the background task Android runs every few hours at best. With it, the cloud tells the phone straight away:

routine → `lessons.generation_status` turns `ready` or `failed` → trigger `lessons_notify_status` → `notify-ready` Edge Function → Expo push service → Firebase Cloud Messaging → the app's push task → sync → «الأسئلة جاهزة»

The push is data-only: it shows nothing by itself, it wakes the app's task, and the sync shows the usual notification. Android can still hold a push back on a phone in deep sleep, so this is fast in practice, not guaranteed.

Do this after [`setup-routine.md`](setup-routine.md).

## 1. Firebase

Android pushes always go through Firebase Cloud Messaging, so the app needs a Firebase project. It's free.

1. At [console.firebase.google.com](https://console.firebase.google.com) choose **Create a project** and name it `mudhakir`. Google Analytics isn't needed.
2. In the project, add an **Android** app with package name `com.nabgouri.mudhakir` (it must match `android.package` in `app.json`). Skip the SDK steps the wizard shows: Expo does them.
3. Download **`google-services.json`** and put it in the repo's root, next to `app.json`, which already points to it (`android.googleServicesFile`). It only holds public identifiers, so it is committed.
4. In **Project settings → Service accounts**, choose **Generate new private key**, then **Generate key**. This downloads a `…-firebase-adminsdk-….json` file: it **is** secret. Keep it outside the repo (the repo ignores the name anyway).
5. Give that key to Expo, which sends the pushes. On [expo.dev](https://expo.dev), the `mudhakir` project: **Project settings → Credentials → Android** → the `com.nabgouri.mudhakir` identifier → **Service credentials → FCM V1 service account key → Add a service account key**, upload the file, **Save**. (Or `npx eas-cli@latest credentials` → **Android** → **production** → **Google Service Account** → **Manage your Google Service Account Key for Push Notifications (FCM V1)** → **Set up …** → **Upload a new service account key**.) Then delete the file from your computer.

## 2. Supabase

From the repo, linked as in `setup-supabase.md`:

```bash
npx supabase db push                              # adds push_tokens and the trigger
npx supabase functions deploy notify-ready        # verify_jwt is off for it in config.toml
```

Pick a long random secret, the one the trigger sends and the function checks. For example, in PowerShell: `[Convert]::ToBase64String([byte[]](1..32 | % { Get-Random -Max 256 }))`.

Give it to the function:

```bash
npx supabase secrets set NOTIFY_READY_SECRET=<the secret>
```

and, with the function's URL, to the trigger. In the dashboard's **SQL Editor**, run:

```sql
select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/notify-ready', 'notify_ready_url');
select vault.create_secret('<the secret>', 'notify_ready_secret');
```

Until both Vault secrets exist the trigger does nothing, so nothing breaks before this step.

## 3. Build the app

`google-services.json` is native configuration, so build and install a new APK (see the README). Opening the new build signed in registers the phone's push token (`push_tokens` gets a row).

## 4. Check it

1. Close the app (swipe it away), then on the routine's page choose **Run now** for a Lesson that is generating, or add a Lesson from the phone and close the app.
2. When the run ends, «الأسئلة جاهزة» should arrive within a minute or so, without opening the app, and the Lesson's Questions are there when you do.
3. If not: **Edge Functions → notify-ready → Logs** shows whether the trigger called it (a `401` means the two secrets differ) and whether Expo accepted the push. With no call at all, check the Vault secrets' names. Accepted but nothing on the phone: check the FCM key on expo.dev, and that the phone has a row in `push_tokens`.
