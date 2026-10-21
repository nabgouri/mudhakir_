-- Telling the phone when a Lesson's Questions are ready, or generating them
-- failed, so it syncs without waiting to be opened (docs/setup-push.md).
--
-- The phone registers its Expo push token here. When a Lesson's
-- `generation_status` turns `ready` or `failed`, a trigger calls the
-- `notify-ready` Edge Function, which sends a data-only push to the
-- owner's phones; the app's background task then syncs.
--
-- The function's URL and the secret it checks are kept in Vault
-- (`notify_ready_url`, `notify_ready_secret`). Until both are there the
-- trigger does nothing, and the phone learns the status at its next sync.

create extension if not exists pg_net with schema extensions;

create table public.push_tokens (
  token text primary key,
  owner uuid not null references auth.users (id) on delete cascade,
  updated_at timestamptz not null default now()
);

create index push_tokens_owner on public.push_tokens (owner);

-- No policies: the phone writes only through `register_push_token`, and
-- only the Edge Function, with the service-role key, reads tokens.
alter table public.push_tokens enable row level security;

-- Records the signed-in user's push token. A token that belonged to another
-- account (the phone signed in as someone else) moves to this one.
create function public.register_push_token(p_token text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in first';
  end if;
  insert into public.push_tokens (token, owner, updated_at) values (p_token, auth.uid(), now())
  on conflict (token) do update set owner = excluded.owner, updated_at = excluded.updated_at;
end;
$$;

revoke execute on function public.register_push_token(text) from public, anon;
grant execute on function public.register_push_token(text) to authenticated;

create function public.notify_lesson_status() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'notify_ready_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'notify_ready_secret';
  if v_url is null or v_secret is null then
    return null;
  end if;
  -- Asynchronous: the routine's write doesn't wait for the push.
  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('lessonId', new.id, 'owner', new.owner, 'status', new.generation_status),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', v_secret)
  );
  return null;
end;
$$;

revoke execute on function public.notify_lesson_status() from public, anon, authenticated;

create trigger lessons_notify_status
  after update of generation_status on public.lessons
  for each row
  when (old.generation_status is distinct from new.generation_status and new.generation_status in ('ready', 'failed'))
  execute function public.notify_lesson_status();
