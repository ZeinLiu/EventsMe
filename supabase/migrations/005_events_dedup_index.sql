-- Safety-net unique index to prevent exact title+date duplicates.
-- Run the cleanup-duplicates edge function first if the table already has duplicates,
-- otherwise this index creation will fail.
CREATE UNIQUE INDEX IF NOT EXISTS events_title_date_unique
ON events (LOWER(TRIM(title)), event_date)
WHERE event_date IS NOT NULL;
