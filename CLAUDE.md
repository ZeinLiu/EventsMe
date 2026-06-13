# EventsMe — Project Context

## What this is
A Singapore family events recommendation web app.
AI-powered, profile-driven. Not a listing site —
a personalised concierge that knows your family.

## Supabase Tables
- profiles — user profile (auto-created on login)
- family_members — per member, one row each
- preferences — budget, days, distance per profile
- events — all discovered events
- saved_events — user wishlist
- calendar_entries — user calendar
- recommendations — cached AI recommendations
- chat_history — AI chat sessions
- discovery_sources — all event sources + schedules
- user_roles — admin role management
- app_settings — all configurable settings

## Edge Functions Deployed
| Function | Purpose |
|----------|---------|
| claude-wizard | AI conversational family profile builder |
| claude-discovery | AI web search (English + Chinese) |
| get-recommendations | AI recommendations engine |
| rss-discovery | RSS feed parser |
| eventbrite-sync | Eventbrite official API |
| ticketmaster-sync | Ticketmaster official API |
| sistic-sync | SISTIC scraper |
| cleanup-duplicates | Semantic AI deduplication |
| enrich-event-images | Post-discovery image enrichment |
| run-scheduler | Master scheduler (reads discovery_sources) |

## Supabase Secrets Set
- CLAUDE_API_KEY
- SUPABASE_SERVICE_ROLE_KEY (auto-injected)
- EVENTBRITE_API_KEY (needs adding)
- TICKETMASTER_API_KEY (needs adding)

## Discovery Engine
All sources managed dynamically via
discovery_sources table — nothing hardcoded.

Cadence (via run-scheduler):
- Daily: RSS feeds + Eventbrite API
- Weekly Sunday: AI web search queries
- Weekly Thursday: SISTIC scraper
- Weekly Monday: Ticketmaster API

Search queries include English AND Chinese
(catches XHS-style content from blogs/aggregators)

## Token Efficiency Rules
- All limits read from app_settings table (never hardcoded)
- Cache recommendations in Supabase
- Refresh only when 5+ new events added or profile changes
- Send max 60-day event window to AI
- short_summary field max 30 words per event
- Daily token budget enforced via tokenBudget.ts
- dedup_checked_at prevents re-checking clean events

## Tech Stack
- Frontend: React + Tailwind → Vercel
- DB + Auth: Supabase
- AI: Claude API (claude-sonnet-4-6)
- Edge Functions: Deno (Supabase)

## UI — Navigation
Bottom nav has 4 tabs:
- 🏠 Home (`/`) — greeting, ChatBar, AI recommendations
- 🎪 Events (`/events`) — full event listing + filter drawer
- 💬 Chat (`/chat`)
- 👤 Profile (`/profile`)

Routes that exist but are NOT in the nav bar:
- `/calendar` — accessible via "View Calendar" link
  inside the CalendarBottomSheet only
- `/admin` — accessible from Profile for admin users

"For You" tab was removed — AI recommendations are
merged into the Home/Dashboard tab.

## Events Page
- Dynamic filter drawer (not hardcoded pills)
- Filters: Category, Source, Date, Price,
  Audience, Admission
- All filter options loaded from DB dynamically
- Sort: Latest Added (default), Date, Price
- NEW badge for events added within 48 hours
- 3 action buttons per card:
  Wishlist | Calendar | Source
- Event detail bottom sheet on card tap

## Admin Panel (/admin)
Accessible from Profile page for admin users only.
- /admin/settings — app_settings management
- /admin/discovery — source management + manual triggers
- /admin/usage — token usage dashboard

## Auth
- Google OAuth (PKCE flow)
- Email/password
- Supabase handles sessions
- Profile row auto-created on first login

## Key Design Decisions
- Mobile-first, tested on iPhone Safari
- Green brand color (#16a34a)
- All Claude API calls via Supabase Edge Functions
  (never direct from browser — protects API key)
- Single HTML file pattern NOT used
  (full React app)
- vercel.json must stay in frontend/ folder
- PKCE auth flow configured in supabase.js
- flowType: pkce + detectSessionInUrl: true

## Known Issues / Watch Out For
- discovery_sources drives ALL scheduling —
  refresh_frequency and refresh_days columns
  control when each source runs
- dedup_checked_at must be NULL or old for
  cleanup to re-check an event
- is_archived = true hides events from all queries
- Token budget resets daily via last_token_reset
  in app_settings
- Vercel env vars must be re-entered if redeployed
  from scratch (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
- Claude-supplied image_url values can be broken
  (404/CORS) — EventCard uses onError to hide them

## Good-to-Have (Phase 5+)
- Group planning for two families
- Push/email alerts for new matches
- Map view and neighbourhood filter

## GitHub
Repo: github.com/ZeinLiu/EventsMe
Branch: main (direct commits, solo POC)
Deployed: Auto-deploy on push to main via Vercel
