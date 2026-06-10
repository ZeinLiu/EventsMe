-- Run this in Supabase SQL Editor

-- Wishlisted events
create table if not exists saved_events (
  id         uuid default gen_random_uuid() primary key,
  user_id    uuid references auth.users(id) on delete cascade not null,
  event_id   uuid references events(id) on delete cascade not null,
  created_at timestamptz default now(),
  unique(user_id, event_id)
);

alter table saved_events enable row level security;

create policy "Users manage own saved events"
  on saved_events for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Calendar entries
create table if not exists calendar_entries (
  id             uuid default gen_random_uuid() primary key,
  user_id        uuid references auth.users(id) on delete cascade not null,
  event_id       uuid references events(id) on delete cascade not null,
  scheduled_date date not null,
  notes          text,
  created_at     timestamptz default now()
);

alter table calendar_entries enable row level security;

create policy "Users manage own calendar entries"
  on calendar_entries for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
