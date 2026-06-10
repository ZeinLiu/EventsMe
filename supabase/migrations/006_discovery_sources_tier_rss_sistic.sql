-- Add tier column for source prioritisation
ALTER TABLE discovery_sources ADD COLUMN IF NOT EXISTS tier integer default 1;

-- RSS feeds (tier 1)
INSERT INTO discovery_sources (label, type, value, tier, is_active) VALUES
  ('TimeOut Singapore',       'rss', 'https://www.timeout.com/singapore/rss',            1, true),
  ('The Smart Local',         'rss', 'https://thesmartlocal.com/feed',                    1, true),
  ('Honeycombers Singapore',  'rss', 'https://thehoneycombers.com/singapore/feed',        1, true),
  ('HoneyKids Asia',          'rss', 'https://honeykidsasia.com/feed',                    1, true),
  ('Mothership SG',           'rss', 'https://mothership.sg/feed',                        1, true),
  ('Daniel Food Diary',       'rss', 'https://danielfooddiary.com/feed',                  1, true),
  ('Seth Lui',                'rss', 'https://sethlui.com/feed',                          1, true);

-- SISTIC scraper (tier 1)
INSERT INTO discovery_sources (label, type, value, tier, is_active) VALUES
  ('SISTIC Singapore', 'scraper', 'https://www.sistic.com.sg/events', 1, true);
