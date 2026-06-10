ALTER TABLE events ADD COLUMN IF NOT EXISTS is_archived boolean default false;

CREATE INDEX IF NOT EXISTS events_is_archived_idx ON events (is_archived)
WHERE is_archived = true;
