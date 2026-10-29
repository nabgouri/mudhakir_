-- The Channel Reader (docs/adr/0002): the `channel-reader` Edge Function
-- reads the Ma'had Channel every hour, as the service role, and imports each
-- new Lesson for the student: it creates the Lesson (and its Subject, if
-- new), and sends its parts for generation as the phone would.

-- The name the ma'had gives a Lesson, from its audio post's caption.
alter table public.lessons add column title text;

comment on column public.lessons.title is
  'The Lesson Title, from the Ma''had Channel''s audio post; null for a Lesson added by hand.';

-- When the student studied the Lesson; until then its Questions are not
-- introduced. A Lesson added by hand is studied when added (the default, so
-- an app from before this column still adds studied Lessons). The reader
-- adds Lessons unstudied, and marks one studied when the student reacts to
-- any of its posts in the channel, with every earlier unstudied Lesson of
-- the Subject.
alter table public.lessons add column studied_at timestamptz default now();
update public.lessons set studied_at = created_at;

-- Marks the Subject's unstudied Lessons up to `p_up_to` studied: the
-- student reacted to Lesson `p_up_to` in the channel. Written as the cloud
-- (`cloud_write_time`), so it wins over the phone's copy on the next sync.
create function public.mark_lessons_studied(p_owner uuid, p_subject_id uuid, p_up_to integer) returns integer
language sql set search_path = '' as $$
  with marked as (
    update public.lessons set
      studied_at = now(),
      updated_at = public.cloud_write_time(updated_at)
    where owner = p_owner and subject_id = p_subject_id and number <= p_up_to
      and studied_at is null and deleted_at is null
    returning 1
  )
  select count(*)::integer from marked;
$$;

revoke execute on function public.mark_lessons_studied(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.mark_lessons_studied(uuid, uuid, integer) to service_role;

-- Where the reader has got to: posts after `last_post_id` are new. One row.
-- `problems` lists the last run's posts it could not read as Lessons.
create table public.channel_reader_state (
  id smallint primary key default 1 check (id = 1),
  last_post_id bigint not null default 0,
  last_run_at timestamptz,
  last_error text,
  problems jsonb not null default '[]'
);
insert into public.channel_reader_state default values;

-- The channel post each imported Lesson's Transcript PDF came from, so the
-- reader can download it again to send a part that has not been sent yet.
create table public.channel_imports (
  lesson_id uuid primary key references public.lessons (id) on delete cascade,
  pdf_post_id bigint,
  post_ids bigint[] not null,
  created_at timestamptz not null default now()
);

-- Only the service role reads or writes these: no policies.
alter table public.channel_reader_state enable row level security;
alter table public.channel_imports enable row level security;

-- The reader sends parts as the service role.
grant execute on function public.start_lesson_part(uuid, integer, integer) to service_role;
grant execute on function public.unstart_lesson_part(uuid, integer) to service_role;

-- The shared secret the scheduled call carries. It is made here and never
-- leaves the database: the function checks a call's secret against it.
select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'channel_reader_secret')
where not exists (select 1 from vault.secrets where name = 'channel_reader_secret');

create function public.channel_reader_secret_ok(p_secret text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from vault.decrypted_secrets where name = 'channel_reader_secret' and decrypted_secret = p_secret
  );
$$;

revoke execute on function public.channel_reader_secret_ok(text) from public, anon, authenticated;
grant execute on function public.channel_reader_secret_ok(text) to service_role;

-- Calls the reader. Its address is Vault's `channel_reader_url`
-- (docs/setup-channel-reader.md); until that is set, nothing happens.
create function public.run_channel_reader() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'channel_reader_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'channel_reader_secret';
  if v_url is null or v_secret is null then
    return;
  end if;
  perform net.http_post(
    url := v_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-reader-secret', v_secret),
    timeout_milliseconds := 150000
  );
end;
$$;

revoke execute on function public.run_channel_reader() from public, anon, authenticated;

-- Every hour, at 7 minutes past: the posting time varies.
create extension if not exists pg_cron;
select cron.schedule('channel-reader', '7 * * * *', 'select public.run_channel_reader()');
