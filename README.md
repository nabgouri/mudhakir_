# مُذاكر (Mudhakir)

A personal Android app that helps one student of an online ma'had memorize each Lesson. The spec is issue #1; the vocabulary is in [`GLOSSARY.md`](GLOSSARY.md); decisions are in [`docs/adr/`](docs/adr/).

The app is Expo (React Native, TypeScript), Android only, Arabic and right to left. Data lives on the phone in SQLite and is backed up and synced to Supabase once the student signs in with Google. Setting up the Supabase project and Google sign-in is a one-time manual step: [`docs/setup-supabase.md`](docs/setup-supabase.md). So is setting up the Claude Code routine that writes Questions: [`docs/setup-routine.md`](docs/setup-routine.md).

## Develop

```bash
npm install
npm test            # Jest
npm run typecheck   # tsc (the app, and the routine's write script)
npm run lint        # ESLint
```

## Install on the phone

The forced right-to-left layout is set at build time, so install an EAS build rather than using Expo Go:

```bash
npx eas-cli@latest login
npx eas-cli@latest build --profile development --platform android   # development build (APK), then `npx expo start`
npx eas-cli@latest build --profile preview --platform android       # standalone APK
```

Open the link EAS prints on the phone to download and install the APK.

## Layout

- `src/app/`: screens (Expo Router). `index.tsx` lists Subjects with their due counts; `subjects/[subjectId].tsx` lists a Subject's Lessons; `lessons/[lessonId].tsx` lists a Lesson's Questions; `questions/` adds and edits a Question; `review.tsx` is the full-screen Review Session, which a Reminder opens; `settings.tsx` signs in for backup and sets the place, calculation method, delay and prayers for Reminders; `auth-callback.tsx` is where Google sign-in returns to.
- `src/engine/`: the study engine, pure TypeScript with no I/O. It schedules Questions with FSRS (`ts-fsrs`) and picks what a Review Session asks: `rate`, `due`, `nextSession`. `reminders.ts` times Reminders from prayer times calculated on the phone (`adhan`): `reminderTimes`. Its tests are the study-engine seam; they run on Makkah time (`jest.global-setup.js`).
- `src/data/`: the local SQLite database. Deletions set `deleted_at` instead of removing rows, so sync can send them to the cloud. Reviews are append-only: triggers refuse any change or removal.
- `src/sync/`: Google sign-in (Supabase Auth, in the phone's browser) and two-way sync with Supabase. For Subjects, Lessons, Questions and settings the last write by `updated_at` wins; Reviews are only ever added, and each Question's schedule is rebuilt from its Reviews. Sync runs when the app opens, a few seconds after local changes, when the phone comes back online, and in the background task. Each sync also sends Lessons waiting for Questions to the Edge Function, and shows a «الأسئلة جاهزة» notification when a Lesson's Questions arrive (`generation.ts`).
- `supabase/`: the Supabase project's schema (`migrations/`), with row-level security on every table, and the `generate-lesson` Edge Function (`functions/`, Deno), which starts the routine for a Lesson.
- `shared/generation.ts`: the generation contract (`GenerateRequest`, `GeneratedQuestions`), plain TypeScript depending only on `zod`, imported by the app, the Edge Function and the write script. Its Arabic fixture tests are the generation-contract seam.
- `routine/` and `.claude/skills/generate-lesson-questions/`: what the Claude Code routine runs. The skill says how to turn a Lesson's material into Questions; `routine/write-questions.ts` (run with `tsx`) checks them against the contract and stores them in Supabase.
- `src/reminders/`: schedules Reminders as local notifications (`expo-notifications`) for the next three days. They are rescheduled when the app opens or goes to the background, after each Review, when settings change, after a sync brings changes, and from a periodic background task (`expo-background-task`), which also syncs. The app declares `USE_EXACT_ALARM`, so they fire on time; that permission is allowed because the app is not on the Play Store.
- `src/ui/`: shared components, theme, and all interface text (`strings.ts`).
