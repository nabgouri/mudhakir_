# One-time setup: the Channel Reader

The Channel Reader imports each new Lesson from the Ma'had Channel on Telegram (see [`docs/adr/0002-lessons-imported-from-the-mahad-channel-by-a-script.md`](adr/0002-lessons-imported-from-the-mahad-channel-by-a-script.md)). It signs in as the student's own Telegram account, so this is done once, by hand, by the student.

The secrets involved give full control of the student's Telegram account. They go only into Supabase's Edge Function secrets, never into the app, this repo or a chat.

## 1. Get an api_id and api_hash

At [my.telegram.org/apps](https://my.telegram.org/apps), signed in with the student's phone number, create an application:

- **App title** `Mudhakir Reader`, **Short name** `mudhakirreader`. Telegram asks you not to use the word "Telegram".
- **URL** empty.
- **Platform** *Other*, with a description such as "Personal script that reads one channel I follow, for my own study app".

Keep the page with the **api_id** and **api_hash** open for the next step.

## 2. Sign in once

From the repo, on the PC:

```bash
npx tsx scripts/telegram-login.mts
```

Enter the api_id, the api_hash, and the channel id (press Enter to keep the default, the Ma'had Channel). Then enter the phone number, the code Telegram sends, and the 2FA password if the account has one. The script prints the channel's name, so you can check it is the Ma'had Channel, and writes the secrets to `mudhakir-telegram.env` in your home folder.

Telegram shows a new login, named after the app, under **Settings → Devices**. Ending that session there stops the Channel Reader.

## 3. Give the secrets to Supabase

Use the path the script printed. In Bash:

```bash
npx supabase secrets set --env-file ~/mudhakir-telegram.env
```

In PowerShell or cmd, `~` isn't expanded, so write the full path, such as `"C:\Users\<you>\mudhakir-telegram.env"`.

Then delete `mudhakir-telegram.env`.

## 4. Deploy the reader

```bash
npx supabase db push                                  # lessons.title, studied_at, the reader's tables and hourly job
npx supabase functions deploy channel-reader generate-lesson
```

The hourly job (pg_cron, at 7 minutes past) does nothing until Vault holds the reader's address, so the reader is still off.

## 5. Update the app, then switch the reader on

Install an app build with this change first: an older app doesn't know which Lessons are unstudied and would ask their Questions. Then, in the Supabase dashboard's **SQL Editor**:

```sql
select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/channel-reader', 'channel_reader_url');
```

From the next hour on, the reader imports the channel's Lessons, oldest first, one per call; the first run catches up on every past Lesson within minutes. They arrive **unstudied** («لم يُدرس بعد»): react to any post of the last Lesson you've studied in each Subject, and within the hour it and every earlier Lesson of that Subject become studied, and their Questions start coming.

To see what the last run did, read `channel_reader_state` in the **Table Editor**: `last_run_at`, `last_error`, and `problems`, the posts it could not read as Lessons. To switch the reader off, delete the `channel_reader_url` secret in **Vault**.
