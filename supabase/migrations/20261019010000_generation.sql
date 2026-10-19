-- Question generation (docs/adr/0001). The `generate-lesson` Edge Function
-- fires the routine for one part of a Lesson's material and records the
-- part as sent; the routine's write script (routine/write-questions.ts)
-- stores the part's Questions, or records that the part failed.
--
-- A Lesson's `generation_status` follows its parts, whatever order they
-- finish in: `failed` as soon as any part fails, `ready` once every part is
-- done, `generating` in between.
--
-- These functions write as the cloud, so each change sets `updated_at` past
-- the stored one (to the millisecond the phone keeps) and wins over the
-- phone's copy on the next sync.

comment on column public.questions.part_index is
  'The Lesson part whose routine run wrote this Question (the Interactive Review is read by part 0); null for a Question the student added by hand.';

create function public.cloud_write_time(previous timestamptz) returns timestamptz
language sql stable set search_path = '' as $$
  select greatest(date_trunc('milliseconds', clock_timestamp()), previous + interval '1 millisecond');
$$;

create function public.part_status(parts_done integer[], failed_parts integer[], part_count integer) returns text
language sql immutable set search_path = '' as $$
  select case
    when cardinality(failed_parts) > 0 then 'failed'
    when cardinality(parts_done) >= part_count then 'ready'
    else 'generating'
  end;
$$;

-- Called by the Edge Function as the signed-in student, after the routine
-- was fired for the part, so row-level security limits it to their own
-- Lessons. A part already done is left alone. Sending a failed part again
-- clears its failure.
create function public.lesson_part_sent(p_lesson_id uuid, p_part_index integer, p_part_count integer)
returns text
language plpgsql set search_path = '' as $$
declare
  v_status text;
begin
  update public.lessons l set
    part_count = p_part_count,
    failed_parts = array_remove(l.failed_parts, p_part_index),
    generation_status = public.part_status(l.parts_done, array_remove(l.failed_parts, p_part_index), p_part_count),
    error = case when array_remove(l.failed_parts, p_part_index) = '{}' then null else l.error end,
    updated_at = public.cloud_write_time(l.updated_at)
  where l.id = p_lesson_id and l.deleted_at is null and not (p_part_index = any (l.parts_done))
  returning l.generation_status into v_status;
  return v_status;
end;
$$;

-- Replaces the part's Questions with `p_questions` (rows shaped as
-- `toQuestionRecord` in shared/generation.ts makes them, already checked by
-- the write script) and marks the part done, in one transaction, so a re-run
-- of a part never duplicates its Questions. Questions the student edited are
-- kept. Returns the Lesson's new status.
create function public.finish_lesson_part(p_lesson_id uuid, p_part_index integer, p_questions jsonb)
returns text
language plpgsql set search_path = '' as $$
declare
  v_owner uuid;
  v_now timestamptz := date_trunc('milliseconds', clock_timestamp());
  v_status text;
begin
  select owner into v_owner from public.lessons
  where id = p_lesson_id and deleted_at is null
  for update;
  if not found then
    raise exception 'Lesson % does not exist or was deleted', p_lesson_id;
  end if;

  update public.questions set
    deleted_at = v_now,
    updated_at = public.cloud_write_time(updated_at)
  where lesson_id = p_lesson_id and part_index = p_part_index and not edited and deleted_at is null;

  -- One millisecond apart, so the Lesson lists them in the routine's order.
  insert into public.questions (
    id, owner, lesson_id, part_index, kind, origin, prompt, options, correct_option, answer, source_passage,
    created_at, updated_at
  )
  select
    gen_random_uuid(), v_owner, p_lesson_id, p_part_index, q ->> 'kind', q ->> 'origin', q ->> 'prompt',
    nullif(q -> 'options', 'null'::jsonb), (q ->> 'correct_option')::integer, q ->> 'answer', q ->> 'source_passage',
    v_now + (n - 1) * interval '1 millisecond', v_now + (n - 1) * interval '1 millisecond'
  from jsonb_array_elements(p_questions) with ordinality as t (q, n);

  update public.lessons l set
    parts_done = array(select distinct p from unnest(array_append(l.parts_done, p_part_index)) as p order by p),
    failed_parts = array_remove(l.failed_parts, p_part_index),
    generation_status = public.part_status(
      array(select distinct p from unnest(array_append(l.parts_done, p_part_index)) as p),
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

-- Records that the routine could not write the part's Questions. The
-- Lesson shows `failed` with the reason.
create function public.fail_lesson_part(p_lesson_id uuid, p_part_index integer, p_error text)
returns text
language plpgsql set search_path = '' as $$
declare
  v_status text;
begin
  update public.lessons l set
    failed_parts = array(select distinct p from unnest(array_append(l.failed_parts, p_part_index)) as p order by p),
    generation_status = 'failed',
    error = left(p_error, 1000),
    updated_at = public.cloud_write_time(l.updated_at)
  where l.id = p_lesson_id and l.deleted_at is null
  returning l.generation_status into v_status;
  if not found then
    raise exception 'Lesson % does not exist or was deleted', p_lesson_id;
  end if;
  return v_status;
end;
$$;

-- Only the routine's write script, with the service-role key, stores
-- generated Questions or failures; the student's own session can only
-- record a part as sent (through the Edge Function).
revoke execute on function public.cloud_write_time(timestamptz) from public, anon;
revoke execute on function public.part_status(integer[], integer[], integer) from public, anon;
revoke execute on function public.lesson_part_sent(uuid, integer, integer) from public, anon;
revoke execute on function public.finish_lesson_part(uuid, integer, jsonb) from public, anon, authenticated;
revoke execute on function public.fail_lesson_part(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.cloud_write_time(timestamptz) to authenticated, service_role;
grant execute on function public.part_status(integer[], integer[], integer) to authenticated, service_role;
grant execute on function public.lesson_part_sent(uuid, integer, integer) to authenticated;
grant execute on function public.finish_lesson_part(uuid, integer, jsonb) to service_role;
grant execute on function public.fail_lesson_part(uuid, integer, text) to service_role;
