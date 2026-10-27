-- Core and Detail Questions (docs/adr/0003): a Core Question is on one of a
-- Lesson's main points, and Review Sessions introduce Core Questions first.
-- Existing Questions, and any the student adds by hand, are Core.

alter table public.questions add column priority text not null default 'core'
  check (priority in ('core', 'detail'));

-- As before (20261019010000_generation.sql), now storing each Question's
-- priority. A routine run from before this change sends none, so Core.
create or replace function public.finish_lesson_part(p_lesson_id uuid, p_part_index integer, p_questions jsonb)
returns text
language plpgsql set search_path = '' as $$
declare
  v_owner uuid;
  v_now timestamptz := date_trunc('milliseconds', clock_timestamp());
  v_status text;
begin
  select owner, generation_status into v_owner, v_status from public.lessons
  where id = p_lesson_id and deleted_at is null and not (p_part_index = any (parts_done))
  for update;
  if not found then
    select generation_status into v_status from public.lessons where id = p_lesson_id and deleted_at is null;
    if not found then
      raise exception 'Lesson % does not exist or was deleted', p_lesson_id;
    end if;
    return v_status;
  end if;

  update public.questions set
    deleted_at = v_now,
    updated_at = public.cloud_write_time(updated_at)
  where lesson_id = p_lesson_id and part_index = p_part_index and deleted_at is null;

  -- One millisecond apart, so the Lesson lists them in the routine's order.
  insert into public.questions (
    id, owner, lesson_id, part_index, kind, origin, priority, prompt, options, correct_option, answer, source_passage,
    created_at, updated_at
  )
  select
    gen_random_uuid(), v_owner, p_lesson_id, p_part_index, q ->> 'kind', q ->> 'origin',
    coalesce(q ->> 'priority', 'core'), q ->> 'prompt',
    nullif(q -> 'options', 'null'::jsonb), (q ->> 'correct_option')::integer, q ->> 'answer', q ->> 'source_passage',
    v_now + (n - 1) * interval '1 millisecond', v_now + (n - 1) * interval '1 millisecond'
  from jsonb_array_elements(p_questions) with ordinality as t (q, n);

  update public.lessons l set
    parts_done = public.int_array_add(l.parts_done, p_part_index),
    parts_sent = public.int_array_add(l.parts_sent, p_part_index),
    failed_parts = array_remove(l.failed_parts, p_part_index),
    generation_status = public.part_status(
      public.int_array_add(l.parts_done, p_part_index),
      array_remove(l.failed_parts, p_part_index),
      l.part_count
    ),
    error = case when array_remove(l.failed_parts, p_part_index) = '{}' then null else l.error end,
    updated_at = public.cloud_write_time(l.updated_at)
  where l.id = p_lesson_id
  returning l.generation_status into v_status;
  return v_status;
end;
$$;
