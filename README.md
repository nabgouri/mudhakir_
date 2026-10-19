# مُذاكر (Mudhakir)

A personal Android app that helps one student of an online ma'had memorize each Lesson. The spec is issue #1; the vocabulary is in [`GLOSSARY.md`](GLOSSARY.md); decisions are in [`docs/adr/`](docs/adr/).

The app is Expo (React Native, TypeScript), Android only, Arabic and right to left. Data lives on the phone in SQLite.

## Develop

```bash
npm install
npm test            # Jest
npm run typecheck   # tsc
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

- `src/app/`: screens (Expo Router). `index.tsx` lists Subjects with their due counts; `subjects/[subjectId].tsx` lists a Subject's Lessons; `lessons/[lessonId].tsx` lists a Lesson's Questions; `questions/` adds and edits a Question; `review.tsx` is the full-screen Review Session.
- `src/engine/`: the study engine, pure TypeScript with no I/O. It schedules Questions with FSRS (`ts-fsrs`) and picks what a Review Session asks: `rate`, `due`, `nextSession`. Its tests are the study-engine seam.
- `src/data/`: the local SQLite database. Deletions set `deleted_at` instead of removing rows, so a later sync can send them to the cloud. Reviews are append-only: triggers refuse any change or removal.
- `src/ui/`: shared components, theme, and all interface text (`strings.ts`).
