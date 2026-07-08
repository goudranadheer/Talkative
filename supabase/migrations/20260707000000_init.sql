-- Talkative pilot backend: per-user free quota + usage log.
-- Quota unit = one processed utterance (one translate call, voice or text).

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  quota_units integer not null default 300,
  used_units  integer not null default 0,
  created_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

-- Auto-create a profile (with the default free quota) on signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Service-role-only usage log (no RLS policies on purpose).
create table public.usage_events (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references auth.users (id) on delete cascade,
  kind          text not null, -- 'stt' | 'translate' | 'suggest' | 'coach'
  units         integer not null default 0,
  input_tokens  integer,
  output_tokens integer,
  created_at    timestamptz not null default now()
);

alter table public.usage_events enable row level security;

-- Atomically consume quota units. Returns remaining units, or -1 if the
-- user doesn't have enough left. Called by edge functions via service role.
create or replace function public.consume_units(p_user uuid, p_units integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_remaining integer;
begin
  update public.profiles
     set used_units = used_units + p_units
   where id = p_user
     and used_units + p_units <= quota_units
  returning quota_units - used_units into v_remaining;

  if not found then
    return -1;
  end if;

  return v_remaining;
end;
$$;

create or replace function public.remaining_units(p_user uuid)
returns integer
language sql
security definer
set search_path = public
as $$
  select quota_units - used_units from public.profiles where id = p_user;
$$;
