-- Run this in Supabase SQL Editor

create table if not exists discovery_sources (
  id                 uuid default gen_random_uuid() primary key,
  label              text not null,
  type               text not null default 'ai_search',
  value              text not null,
  is_active          boolean default true,
  last_run_at        timestamptz,
  last_run_count     integer default 0,
  total_events_found integer default 0,
  created_at         timestamptz default now()
);

alter table discovery_sources enable row level security;

-- Only service role (Edge Function) can read/write discovery sources
create policy "Service role only"
  on discovery_sources
  using (false);

-- Also allow events table insert from service role (no additional policy needed
-- since service role bypasses RLS by default)

-- ── Seed: default AI search queries ──────────────────────────────────────────

insert into discovery_sources (label, type, value, is_active) values
(
  'Kids & Family Events',
  'ai_search',
  'Singapore family events kids children weekend activities 2026',
  true
),
(
  'Arts & Culture',
  'ai_search',
  'Singapore arts culture exhibitions museum shows 2026',
  true
),
(
  'Nature & Outdoor',
  'ai_search',
  'Singapore nature outdoor parks wildlife events activities 2026',
  true
),
(
  'Food & Lifestyle',
  'ai_search',
  'Singapore food festival dining events lifestyle 2026',
  true
),
(
  'Free Events',
  'ai_search',
  'Singapore free events activities family weekend 2026',
  true
);
