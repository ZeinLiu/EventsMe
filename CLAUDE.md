# EventsMe — Project Context

## What this is
A Singapore family events recommendation web app.
AI-powered, profile-driven. Not a listing site —
a personalised concierge that knows your family.

## Must-Have Features
1. Account + family profile management
2. Event collection from SG sources (Eventbrite,
   Visit Singapore, NParks, SISTIC)
3. Supabase database for event storage
4. AI recommendations via Claude API (cached, efficient)
5. AI chat search bar
6. In-app calendar management

## Good-to-Have (Phase 5+)
- Group planning for two families
- Push/email alerts for new matches
- Map view and neighbourhood filter

## Tech Stack
- Frontend: React + Tailwind → Vercel
- Backend: Node.js + Express → Railway
- DB + Auth: Supabase
- AI: Claude API (claude-sonnet-4-20250514)
- Scraping: Playwright

## Token Efficiency Rules
- Cache recommendations in Supabase
- Only re-run AI when profile changes or 5+ new events added
- Send max 60-day event window to AI
- Each event has a short_summary field (50 words max)
- Never send raw scraped HTML to Claude

## Current Phase
Phase 1 — Foundation

## Repo Structure
/frontend → React app
/backend → Node.js API + scrapers