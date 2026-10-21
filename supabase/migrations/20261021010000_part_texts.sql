-- A part's Transcript text, kept only while its routine run needs it
-- (docs/adr/0001). The routine is a model, and a model can't copy tens of
-- thousands of characters exactly, so the text no longer travels in the
-- routine's trigger for it to save: the `generate-lesson` Edge Function keeps
-- it here, and the routine's script fetches it (routine/fetch-request.ts).
--
-- Only the service role reads it: no policies, and the student's session
-- writes it only through `stash_part_text`. A part's text is deleted as soon
-- as the part is done, failed, or no longer sent, and any text left over a
-- day (a run that never finished) the next time a text is kept.

create table public.lesson_part_texts (
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  part_index integer not null,
  text text not null,
  created_at timestamptz not null default now(),
  primary key (lesson_id, part_index)
);

alter table public.lesson_part_texts enable row level security;

-- Called by the Edge Function as the signed-in student, right after
-- `start_lesson_part` recorded the part as sent, so only a part of the
-- student's own Lesson that is under way can be given a text.
create function public.stash_part_text(p_lesson_id uuid, p_part_index integer, p_text text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.lessons
    where id = p_lesson_id and owner = auth.uid() and deleted_at is null
      and p_part_index = any (parts_sent) and not (p_part_index = any (parts_done))
  ) then
    raise exception 'Part % of Lesson % is not being sent', p_part_index, p_lesson_id;
  end if;
  delete from public.lesson_part_texts where created_at < now() - interval '1 day';
  insert into public.lesson_part_texts (lesson_id, part_index, text) values (p_lesson_id, p_part_index, p_text)
  on conflict (lesson_id, part_index) do update set text = excluded.text, created_at = now();
end;
$$;

revoke execute on function public.stash_part_text(uuid, integer, text) from public, anon;
grant execute on function public.stash_part_text(uuid, integer, text) to authenticated;

-- `finish_lesson_part`, `fail_lesson_part` and `unstart_lesson_part` all
-- update the Lesson; whichever ran, a part that is done, failed or no
-- longer sent needs no text. A deleted Lesson needs none at all.
create function public.drop_part_texts() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.lesson_part_texts t
  where t.lesson_id = new.id
    and (
      new.deleted_at is not null
      or t.part_index = any (new.parts_done)
      or t.part_index = any (new.failed_parts)
      or not (t.part_index = any (new.parts_sent))
    );
  return null;
end;
$$;

revoke execute on function public.drop_part_texts() from public, anon, authenticated;

create trigger lessons_drop_part_texts
  after update of parts_done, failed_parts, parts_sent, deleted_at on public.lessons
  for each row
  execute function public.drop_part_texts();
