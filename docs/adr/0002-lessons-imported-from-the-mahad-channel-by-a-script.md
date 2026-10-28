# Lessons are imported from the Ma'had Channel by a plain script on the student's Telegram account

Until now the student added each Lesson by hand. The ma'had posts every Lesson to its Telegram channel (Sunday, Monday, Wednesday and Thursday; Sunday has the main Subject only): an mp3 whose caption is the Lesson Title, a PDF named «<Subject> (n).pdf» holding the Transcript, and an Interactive Review link such as `…/Muojaz/12`, each tagged with the Subject's hashtag. The Channel Reader now imports them on its own.

The Channel Reader is a plain script, with no AI, logged in to the student's own Telegram account through the MTProto API. A bot cannot read the channel, and the student cannot join it from a second account. The script refuses every chat except the Ma'had Channel's id. It runs every hour, since the posting time varies. For each new Lesson it downloads the PDF, extracts the text with the same pdf.js version the phone uses, and hands the Lesson to the existing generation path (ADR 0001). Claude sees only the Lesson's material, never the account. The one exception is a post the script cannot classify: the text of that post alone goes to the routine, which decides what it is.

A post counts as a Lesson only when it has a Subject hashtag and either a numbered PDF or an Interactive Review link. The Lesson number comes from the link's path and is checked against the PDF's name. If the two disagree, the Lesson is skipped and the student is notified. `#المواد_الإثرائية` (Supplements) and the audio are skipped. A Subject and number already in the app is never imported again. Edits to a post after its import are ignored; the student deletes the Lesson to have it imported again. A new hashtag creates a new Subject. The first run imports every past Lesson.

The script runs as a scheduled Supabase Edge Function using mtcute's web build (`jsr:@mtcute/web`), which reaches Telegram over WebSocket, with the session in a function secret. mtcute's Deno build can't be used there, because it imports `node:sqlite`, which Edge Functions don't have. A spike (`read-channel`) signed in, read the channel's last 40 posts and downloaded a 2 MB Transcript PDF in 3.5 s. GitHub Actions remains the fallback if the limits are ever hit.

## Considered Options

- **A Claude agent (e.g. Vercel's eve) reading Telegram:** more flexible about format changes. But Claude would hold the account, so "only this channel" would be an instruction it follows, not a lock. Every run would use the subscription even when nothing was posted, and it adds a new host. The hybrid above keeps the flexibility where it is needed.
- **The public web preview (`t.me/s/…`):** needs no login, but the channel is private.
- **A bot, or the student forwarding posts:** a bot can't be added to the channel. Forwarding works, and is the fallback (see below).
- **A second Telegram account that has joined only the channel:** this would truly limit what the session can see, but the student can't join the channel from another account.
- **The student's PC on a scheduled task:** works only while the PC is on.

## Consequences

- A Lesson's Questions are usually ready before the next prayer after it is posted, with no action from the student.
- The Telegram session string gives full control of the student's account. It is kept only as a secret of the host that runs the script, never in the app or this repo.
- Telegram puts accounts using unofficial API clients "under observation". Reading one channel hourly is not the flooding or spam its bans target, but some risk remains.
- Telegram's API terms (§1.5) forbid using data obtained through the API for the "deployment of artificial intelligence". Sending the PDF's text to Claude arguably falls under that. The student accepted this for personal, low-volume use; the stated penalty is a notice with 10 days to comply before API access is cut. If that happens, the student shares the day's PDFs to the app by hand and the rest of the path is unchanged.
- If the Channel Reader fails (an expired session, a changed format), the phone gets «تعذّر قراءة القناة» with the reason, at most once a day.
