-- ── Admin system: roles, app settings, discovery scheduling, run history ──────
-- Run in Supabase SQL Editor

-- ── 1. User roles table (must exist before is_admin() references it) ──────────
CREATE TABLE IF NOT EXISTS user_roles (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid REFERENCES auth.users ON DELETE CASCADE,
  role       text NOT NULL DEFAULT 'user',
  created_at timestamp DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- Simple self-read policy (no function needed — no recursion risk)
CREATE POLICY "Users can read own role"
  ON user_roles FOR SELECT
  USING (auth.uid() = user_id);

-- ── 2. Admin helper function (security definer avoids RLS recursion) ──────────
-- Created AFTER user_roles so PostgreSQL can resolve the table reference.
CREATE OR REPLACE FUNCTION public.is_admin(uid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = uid AND role = 'admin'
  );
$$;

-- ── 3. Remaining user_roles policies (use is_admin now that it exists) ────────
CREATE POLICY "Admins can read all roles"
  ON user_roles FOR SELECT
  USING (is_admin(auth.uid()));

CREATE POLICY "Admins can manage roles"
  ON user_roles FOR ALL
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

-- ── 4. App settings table ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_settings (
  key         text PRIMARY KEY,
  value       text NOT NULL,
  label       text,
  description text,
  type        text DEFAULT 'text',
  options     text,
  category    text DEFAULT 'general',
  updated_at  timestamp DEFAULT now(),
  updated_by  uuid REFERENCES auth.users
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage settings"
  ON app_settings FOR ALL
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

-- ── 5. Discovery runs log ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS discovery_runs (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  source_id     uuid REFERENCES discovery_sources ON DELETE SET NULL,
  source_label  text,
  source_type   text,
  started_at    timestamptz DEFAULT now(),
  finished_at   timestamptz,
  events_found  int DEFAULT 0,
  tokens_used   int DEFAULT 0,
  status        text DEFAULT 'running',  -- running | success | error
  error_message text
);

ALTER TABLE discovery_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read discovery runs"
  ON discovery_runs FOR SELECT
  USING (is_admin(auth.uid()));

-- ── 6. Admin policy on discovery_sources ─────────────────────────────────────
-- Service role continues to bypass RLS for backend Edge Functions.
CREATE POLICY "Admins can manage discovery sources"
  ON discovery_sources FOR ALL
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

-- ── 7. Scheduling + stats columns on discovery_sources ───────────────────────
ALTER TABLE discovery_sources
  ADD COLUMN IF NOT EXISTS language             text DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS refresh_frequency   text DEFAULT 'weekly',
  ADD COLUMN IF NOT EXISTS refresh_days        text DEFAULT '1',
  ADD COLUMN IF NOT EXISTS last_successful_run timestamp,
  ADD COLUMN IF NOT EXISTS next_scheduled_run  timestamp,
  ADD COLUMN IF NOT EXISTS run_count           int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_tokens_used   int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avg_events_per_run  numeric DEFAULT 0;

-- ── 8. Seed app_settings defaults ────────────────────────────────────────────
INSERT INTO app_settings (key, value, label, description, type, category)
VALUES
  ('discovery_enabled',    'true',    'Discovery Engine',          'Master on/off switch for all discovery',             'boolean', 'discovery'),
  ('max_events_per_run',   '15',      'Max events per source',     'Max events extracted per source per run',            'number',  'discovery'),
  ('event_window_days',    '90',      'Event window (days)',       'Only fetch events within this many days ahead',       'number',  'discovery'),
  ('daily_token_limit',    '300000',  'Daily token limit',         'Pause discovery if today''s usage exceeds this',     'number',  'tokens'),
  ('daily_tokens_used',    '0',       'Daily tokens used',         'Running counter — reset each day',                   'number',  'tokens'),
  ('max_tokens_per_call',  '1000',    'Max tokens per Claude call','Token limit per individual API call',                'number',  'tokens'),
  ('monthly_token_budget', '5000000', 'Monthly token budget',      'Alert threshold for monthly usage',                  'number',  'tokens'),
  ('dedup_window_days',    '7',       'Dedup window (days)',       'Date range for duplicate checking',                  'number',  'general'),
  ('new_event_badge_hours','48',      'New badge duration (hours)','Hours to show NEW badge after discovery',            'number',  'general'),
  ('auto_archive_days',    '7',       'Auto-archive after (days)', 'Days after event ends before archiving',             'number',  'general')
ON CONFLICT (key) DO NOTHING;

-- ── 9. Seed refresh schedules on existing sources ────────────────────────────
UPDATE discovery_sources SET
  refresh_frequency = 'daily',
  refresh_days      = '0,1,2,3,4,5,6'
WHERE type = 'api';

UPDATE discovery_sources SET
  refresh_frequency = 'weekly',
  refresh_days      = '1,4'
WHERE type = 'ai_search' AND language = 'en';

UPDATE discovery_sources SET
  refresh_frequency = 'weekly',
  refresh_days      = '2,5'
WHERE type = 'ai_search' AND language = 'zh';

UPDATE discovery_sources SET
  refresh_frequency = 'weekly',
  refresh_days      = '3,6'
WHERE type = 'rss';

UPDATE discovery_sources SET
  refresh_frequency = 'weekly',
  refresh_days      = '3'
WHERE type = 'scraper';
