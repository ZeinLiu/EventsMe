-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New query)

-- Family members table
create table if not exists family_members (
  id            uuid default gen_random_uuid() primary key,
  profile_id    uuid references auth.users(id) on delete cascade not null,
  name          text not null,
  age           integer,
  role          text,
  interests     text[],
  constraints   text default '',
  availability  text default '',
  summary       text default '',
  created_at    timestamptz default now()
);

alter table family_members enable row level security;

create policy "Users manage their own family members"
  on family_members for all
  using  (auth.uid() = profile_id)
  with check (auth.uid() = profile_id);

-- Preferences table (one row per user)
create table if not exists preferences (
  id             uuid default gen_random_uuid() primary key,
  profile_id     uuid references auth.users(id) on delete cascade not null unique,
  budget         integer default 100,
  preferred_days text[] default '{}',
  max_distance   integer default 20,
  notes          text default '',
  created_at     timestamptz default now()
);

alter table preferences enable row level security;

create policy "Users manage their own preferences"
  on preferences for all
  using  (auth.uid() = profile_id)
  with check (auth.uid() = profile_id);
