// Signs the student's Telegram account in once, for the Channel Reader
// (docs/adr/0002-lessons-imported-from-the-mahad-channel-by-a-script.md).
//
// Run on the student's PC: `npx tsx scripts/telegram-login.mts`. It asks for
// the api_id and api_hash from my.telegram.org/apps, then the phone number,
// the code Telegram sends and the 2FA password if there is one. It checks
// that the account can read the Ma'had Channel, then writes the secrets the
// Channel Reader needs to a file in the home folder, never in this repo:
//
//   npx supabase secrets set --env-file "<the path it prints>"
//
// then delete the file. The session string in it gives full control of the
// account, so it is never printed.
//
// The session is kept in memory only, so nothing else is left on disk.

import { MemoryStorage } from '@mtcute/core';
import { TelegramClient } from '@mtcute/node';
import { writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';

// The Ma'had Channel, as Telegram Web shows it (#-3740281211), in the marked
// form the API uses for channels.
const DEFAULT_CHANNEL_ID = '-1003740281211';

const OUTPUT = join(homedir(), 'mudhakir-telegram.env');

const rl = createInterface({ input: process.stdin, output: process.stdout });
const apiId = Number((await rl.question('api_id > ')).trim());
const apiHash = (await rl.question('api_hash > ')).trim();
const channelId = (await rl.question(`Channel id [${DEFAULT_CHANNEL_ID}] > `)).trim() || DEFAULT_CHANNEL_ID;
rl.close();
if (!Number.isInteger(apiId) || apiId <= 0 || !/^[0-9a-f]{32}$/.test(apiHash)) {
  throw new Error('The api_id is a number and the api_hash 32 letters and digits, both from my.telegram.org/apps');
}

const tg = new TelegramClient({ apiId, apiHash, storage: new MemoryStorage() });
try {
  const self = await tg.start({
    phone: () => tg.input('Phone (with +212…) > '),
    code: () => tg.input('Code Telegram sent > '),
    password: () => tg.input('2FA password > '),
  });
  console.log(`Signed in as ${self.displayName}.`);

  // Found among the account's chats rather than by id alone: a new session
  // doesn't yet know the channel's access hash, and this also checks the
  // account has joined it.
  let title: string | null = null;
  for await (const dialog of tg.iterDialogs()) {
    if (dialog.peer.id === Number(channelId)) {
      title = dialog.peer.displayName;
      break;
    }
  }
  if (title === null) throw new Error(`This account has no chat with id ${channelId}: is it the Ma'had Channel's id?`);
  console.log(`The Channel Reader will read only: ${title}`);

  const lines = [
    `TELEGRAM_API_ID=${apiId}`,
    `TELEGRAM_API_HASH=${apiHash}`,
    `TELEGRAM_CHANNEL_ID=${channelId}`,
    `TELEGRAM_SESSION=${await tg.exportSession()}`,
  ];
  writeFileSync(OUTPUT, lines.join('\n') + '\n', { mode: 0o600 });
  console.log(`\nWrote ${OUTPUT}. Now run:\n\n  npx supabase secrets set --env-file "${OUTPUT}"\n\nthen delete that file.`);
} finally {
  await tg.destroy();
}
