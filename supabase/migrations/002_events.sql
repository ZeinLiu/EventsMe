-- Run this in Supabase SQL Editor

create table if not exists events (
  id              uuid default gen_random_uuid() primary key,
  title           text not null,
  description     text,
  category        text,
  event_date      date,
  event_end_date  date,
  venue           text,
  price_min       integer default 0,
  price_max       integer default 0,
  is_free         boolean default false,
  source_url      text,
  booking_url     text,
  image_url       text,
  source_name     text,
  short_summary   text,
  created_at      timestamptz default now()
);

alter table events enable row level security;

-- Events are publicly readable by any authenticated user
create policy "Events are publicly readable"
  on events for select using (auth.role() = 'authenticated');

-- ── Seed data ────────────────────────────────────────────────

insert into events (title, description, category, event_date, event_end_date, venue, price_min, price_max, is_free, source_url, booking_url, image_url, source_name, short_summary) values

(
  'Singapore Food Festival 2026',
  'Annual celebration of Singapore''s vibrant food culture with hawker masterclasses, food trails, and celebrity chef showcases across the island.',
  'Food & Lifestyle',
  '2026-07-18', '2026-07-26',
  'Various locations islandwide',
  0, 80, false,
  'https://www.visitsingapore.com',
  'https://www.visitsingapore.com',
  'https://images.unsplash.com/photo-1565299507177-b0ac66763828?w=800',
  'Visit Singapore',
  'Annual food festival celebrating Singapore hawker culture with masterclasses and food trails across the island. Family friendly.'
),

(
  'ArtScience Museum: Future World',
  'Permanent interactive digital art exhibition featuring immersive rooms where art and science converge. Perfect for families with children of all ages.',
  'Arts & Culture',
  '2026-07-01', '2026-12-31',
  'ArtScience Museum, Marina Bay Sands',
  19, 25, false,
  'https://www.marinabaysands.com',
  'https://www.marinabaysands.com/museum',
  'https://images.unsplash.com/photo-1518998053901-5348d3961a04?w=800',
  'Marina Bay Sands',
  'Immersive digital art exhibition at Marina Bay where art meets science. Highly interactive, ideal for curious kids and adults.'
),

(
  'Singapore Zoo Breakfast with Orangutans',
  'Enjoy a buffet breakfast in the presence of free-ranging orangutans at the Jungle Flavours restaurant. A unique wildlife experience for the whole family.',
  'Nature & Wildlife',
  '2026-07-01', '2026-12-31',
  'Singapore Zoo, Mandai',
  35, 55, false,
  'https://www.mandai.com',
  'https://www.mandai.com/en/singapore-zoo',
  'https://images.unsplash.com/photo-1540573133985-87b6da6d54a9?w=800',
  'Mandai Wildlife Group',
  'Buffet breakfast alongside free-ranging orangutans at Singapore Zoo. Unmissable wildlife experience perfect for young children.'
),

(
  'National Day Preview 2026',
  'Preview of Singapore''s National Day Parade featuring aerial displays, military processions, and spectacular fireworks at the Padang.',
  'Cultural & National',
  '2026-08-01', '2026-08-01',
  'The Padang, City Hall',
  0, 0, true,
  'https://www.ndp.gov.sg',
  'https://www.ndp.gov.sg',
  'https://images.unsplash.com/photo-1533900298318-6b8da08a523e?w=800',
  'NDP Official',
  'Singapore National Day Parade preview with fireworks and aerial displays at the Padang. Free entry, iconic national event.'
),

(
  'Kidz Amaze at HomeTeamNS',
  'Singapore''s largest indoor playground with over 30 play structures, rides and attractions across 3 floors. Perfect for kids aged 1–12.',
  'Kids & Family',
  '2026-07-01', '2026-12-31',
  'HomeTeamNS Bukit Batok',
  18, 28, false,
  'https://www.hometeamns.sg',
  'https://www.hometeamns.sg/kidzamaze',
  'https://images.unsplash.com/photo-1575783970733-1aaedde1db74?w=800',
  'HomeTeamNS',
  'Singapore''s largest indoor playground with 30+ play structures across 3 floors. Perfect for kids aged 1–12, great rainy day option.'
);
