# One-time setup: the Channel Reader

The Channel Reader imports each new Lesson from the Ma'had Channel on Telegram (see [`docs/adr/0002-lessons-imported-from-the-mahad-channel-by-a-script.md`](adr/0002-lessons-imported-from-the-mahad-channel-by-a-script.md)). It signs in as the student's own Telegram account, so this is done once, by hand, by the student.

For now only the spike exists: `read-channel` reads the channel and downloads one PDF, to show that this works on Supabase. It stores nothing.

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

## 4. Deploy and test the spike

```bash
npx supabase functions deploy read-channel
```

In the Supabase dashboard, open **Edge Functions → read-channel → Test**, choose the **service role**, and send a POST with an empty body. The answer lists the channel's latest posts, the newest PDF it downloaded, and how long each step took. A `403` means the call was not made as the service role.
