-- Which past books the Channel Reader imports (docs/adr/0002): the channel
-- goes back to books from before the student's current ones. Lessons posted
-- before `import_since` are imported only for `past_subjects`; every Lesson
-- posted since is, so a book the channel starts later comes in on its own.
alter table public.channel_reader_state
  add column import_since timestamptz not null default now(),
  add column past_subjects text[] not null default '{}';

update public.channel_reader_state set
  import_since = '2026-10-29T00:00:00Z',
  past_subjects = array['موجز الاعتقاد', 'أعمال القلوب'];

-- While Lessons are waiting, the reader queues its next call through pg_net,
-- like the hourly job: a request the function starts itself is dropped when
-- it shuts down after replying.
grant execute on function public.run_channel_reader() to service_role;
