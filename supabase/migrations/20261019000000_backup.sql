-- The cloud copy of the student's data, synced both ways with the phone's
-- SQLite database (src/sync/). Every row belongs to one signed-in user
-- (`owner`) and row-level security keeps each user to their own rows.
--
-- There is deliberately no column for the Transcript or its PDF: they never
-- leave the phone except in the routine's trigger (docs/adr/0001).
--
-- Times the phone sets (`created_at`, `updated_at`, `deleted_at`,
-- `reviewed_at`) are the phone's clock. `server_updated_at` is set here on
-- every write and is what the phone pulls by, since a phone's `updated_at`
-- can be older than changes it has already pulled.

-- Stamps `server_updated_at` and makes the last write by `updated_at` win:
-- an update older than the stored row is skipped, so a phone pushing an
-- old edit never overwrites a newer one. Anyone else writing these tables
-- (the routine) must set `updated_at` too. A row never changes owner.
create function public.sync_last_write_wins() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.updated_at < old.updated_at then
      return null;
    end if;
    new.owner := old.owner;
  end if;
  new.server_updated_at := clock_timestamp();
  return new;
end;
$$;

create table public.subjects (
  id uuid primary key,
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default clock_timestamp()
);

-- `generation_status` is null for a Lesson with no material to generate
-- from. A long Transcript is sent in `part_count` parts; `parts_done` and
-- `failed_parts` hold part indexes, so parts may finish in any order.
create table public.lessons (
  id uuid primary key,
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id uuid not null references public.subjects (id),
  number integer not null,
  interactive_review_url text,
  generation_status text check (generation_status in ('waiting', 'generating', 'ready', 'failed')),
  part_count integer not null default 0 check (part_count >= 0),
  parts_done integer[] not null default '{}',
  failed_parts integer[] not null default '{}',
  error text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default clock_timestamp()
);

-- `origin` is null for a Question the student added by hand, and
-- `part_index` is null unless it came from a Transcript part. `options` is a
-- JSON array of strings for a Multiple-Choice Question. `edited` records
-- that the student changed it, so a later generation run leaves it alone.
create table public.questions (
  id uuid primary key,
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  lesson_id uuid not null references public.lessons (id),
  part_index integer,
  kind text not null check (kind in ('multiple-choice', 'open')),
  origin text check (origin in ('interactive-review', 'concept-card', 'transcript')),
  prompt text not null,
  options jsonb,
  correct_option integer,
  answer text,
  source_passage text,
  edited boolean not null default false,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default clock_timestamp()
);

-- Reviews are append-only: no policy allows changing or removing one, and
-- the trigger refuses it even for the service role.
create table public.reviews (
  id uuid primary key,
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  question_id uuid not null references public.questions (id),
  rating text not null check (rating in ('again', 'hard', 'good', 'easy')),
  reviewed_at timestamptz not null,
  server_updated_at timestamptz not null default clock_timestamp()
);

-- One row per user. `prayers` is a JSON object of the prayers turned on.
create table public.settings (
  owner uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  city_id text,
  latitude double precision,
  longitude double precision,
  method text not null,
  delay_minutes integer not null,
  prayers jsonb not null,
  new_per_day integer not null default 10,
  updated_at timestamptz not null,
  server_updated_at timestamptz not null default clock_timestamp()
);

create function public.reviews_append_only() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.server_updated_at := clock_timestamp();
    return new;
  end if;
  raise exception 'reviews are append-only';
end;
$$;

create trigger subjects_last_write_wins before insert or update on public.subjects
  for each row execute function public.sync_last_write_wins();
create trigger lessons_last_write_wins before insert or update on public.lessons
  for each row execute function public.sync_last_write_wins();
create trigger questions_last_write_wins before insert or update on public.questions
  for each row execute function public.sync_last_write_wins();
create trigger settings_last_write_wins before insert or update on public.settings
  for each row execute function public.sync_last_write_wins();
create trigger reviews_append_only before insert or update or delete on public.reviews
  for each row execute function public.reviews_append_only();

-- The phone pulls each table in `server_updated_at` order.
create index subjects_pull on public.subjects (owner, server_updated_at, id);
create index lessons_pull on public.lessons (owner, server_updated_at, id);
create index questions_pull on public.questions (owner, server_updated_at, id);
create index reviews_pull on public.reviews (owner, server_updated_at, id);
create index lessons_subject on public.lessons (subject_id);
create index questions_lesson on public.questions (lesson_id);
create index reviews_question on public.reviews (question_id);

alter table public.subjects enable row level security;
alter table public.lessons enable row level security;
alter table public.questions enable row level security;
alter table public.reviews enable row level security;
alter table public.settings enable row level security;

create policy "Own subjects" on public.subjects for all to authenticated
  using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
create policy "Own lessons" on public.lessons for all to authenticated
  using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
create policy "Own questions" on public.questions for all to authenticated
  using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
create policy "Own settings" on public.settings for all to authenticated
  using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
create policy "Read own reviews" on public.reviews for select to authenticated
  using (owner = (select auth.uid()));
create policy "Add own reviews" on public.reviews for insert to authenticated
  with check (owner = (select auth.uid()));
