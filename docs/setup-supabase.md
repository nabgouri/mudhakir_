# One-time setup: Supabase and Google sign-in

The app backs up and syncs the student's data to a Supabase project, and the student signs in with Google through Supabase Auth. This is set up once, by hand. Until it is, the app works as before and the Settings screen says backup isn't set up.

Only public values go into the app: the project URL and its publishable key. Row-level security keeps every row to its owner. The service-role key never goes into the app or this repo.

## 1. Create the Supabase project

1. Sign in at [supabase.com](https://supabase.com) and create a new project (the free plan is enough). Pick a region near the student.
2. Note the **project ref**, the part before `.supabase.co` in the project URL.

## 2. Create the tables

The schema is in [`supabase/migrations/`](../supabase/migrations/). Apply it with the Supabase CLI:

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push
```

Or paste the migration file into the dashboard's **SQL Editor** and run it.

Check under **Table Editor** that `subjects`, `lessons`, `questions`, `reviews` and `settings` exist, each with RLS enabled.

## 3. Create the Google OAuth client

In the [Google Cloud console](https://console.cloud.google.com):

1. Create a project (or pick one).
2. **Google Auth Platform → Branding / Audience** (the OAuth consent screen): user type **External**, app name مُذاكر, your email as support and developer contact. Leave it in **Testing** and add the student's Gmail address under **Test users**. Scopes: `openid`, `email`, `profile` (the defaults).
3. **Clients → Create client**: type **Web application**. Under **Authorized redirect URIs** add:

   ```
   https://<project-ref>.supabase.co/auth/v1/callback
   ```

4. Copy the **Client ID** and **Client secret**.

## 4. Turn on Google sign-in in Supabase

In the Supabase dashboard:

1. **Authentication → Sign In / Providers → Google**: enable it, paste the client ID and secret, save.
2. **Authentication → URL Configuration → Redirect URLs**: add `mudhakir://auth-callback`. This is where the browser returns to the app after signing in.

## 5. Give the app the project's URL and key

From **Project Settings → API Keys**, copy the project URL and the **publishable** key (`sb_publishable_…`; the legacy `anon` key also works).

For `npx expo start` with a development build, copy `.env.example` to `.env.local` and fill both in:

```bash
EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_KEY=sb_publishable_…
```

For EAS builds (the standalone APK bundles its JavaScript on EAS), add them as EAS environment variables:

```bash
npx eas-cli@latest env:create --name EXPO_PUBLIC_SUPABASE_URL --value https://<project-ref>.supabase.co --environment development --environment preview --visibility plaintext
npx eas-cli@latest env:create --name EXPO_PUBLIC_SUPABASE_KEY --value sb_publishable_… --environment development --environment preview --visibility plaintext
```

This ticket added native modules (`expo-web-browser`, `expo-network`), so build and install a new APK (see the README) before trying sign-in.

## 6. Check it on the phone

1. Open **الإعدادات** and tap **سجّل الدخول بحساب Google**. Pick the student's account. The section then shows the account and «تمت المزامنة».
2. In the Supabase **Table Editor**, the student's Subjects, Lessons, Questions, Reviews and settings appear.
3. Turn on airplane mode, answer a few Questions in a Review Session, turn it off: within a few seconds the new rows appear in `reviews`.
4. To check a restore, uninstall the app, install it again, sign in, and allow notifications when asked: every Subject, Lesson, Question and Review comes back, the settings are restored, and Reminders are scheduled again.
