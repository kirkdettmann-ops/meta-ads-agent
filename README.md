# Meta Ads Agent

A Meta Ads management system for the NEON client (agency mode, multi-tenant). Pulls Facebook + Instagram ad data via Meta Marketing/Graph API, stores in our own Supabase DB, runs a read-only agent that outputs daily spend recommendations + alerts to a Next.js dashboard.

**Owner**: Kirk (kirkdettmann-ops)
**Co-planner**: Nils (Kirk's brother) — conceptualized the project with the client.
**Status**: Day 1 scaffold — 2026-08-16.

## Tech stack

- **Frontend**: Next.js 16 (App Router) + React 19 + Tailwind v4
- **UI**: Plain Tailwind + lucide-react (shadcn/base-ui later)
- **DB**: Supabase (Postgres + Auth + pg_cron)
- **Auth**: Supabase magic link
- **Meta API**: `facebook-nodejs-business-sdk`
- **Agent LLM**: via the matrix MCP (llm-call)
- **Deploy**: Vercel Hobby

## Local dev

```bash
# 1. Install deps
npm install

# 2. Copy env
cp .env.local.example .env.local
# Fill in Supabase URL, anon key, service role key

# 3. Run DB migrations against your Supabase project
supabase db push

# 4. Generate TypeScript types from Supabase
npm run db:types

# 5. Start dev server
npm run dev
# → http://localhost:4000
```

## Project structure

```
src/
├── app/
│   ├── (auth)/login/page.tsx           # Magic link sign-in
│   ├── (app)/                          # Authenticated app shell
│   │   ├── layout.tsx                  # Sidebar + header
│   │   ├── dashboard/page.tsx          # Daily briefing
│   │   ├── businesses/page.tsx         # Business list
│   │   ├── businesses/[id]/page.tsx    # Business detail
│   │   ├── businesses/[id]/campaigns/page.tsx
│   │   ├── businesses/[id]/campaigns/[cid]/page.tsx
│   │   └── recommendations/page.tsx    # Recommendation queue
│   ├── api/cron/                       # Cron route handlers
│   │   ├── pull-structure/route.ts     # 6h
│   │   ├── pull-insights/route.ts      # 4h
│   │   ├── pull-comments/route.ts      # 15min
│   │   └── run-agent/route.ts          # 6h
│   └── layout.tsx
├── components/                         # UI components
├── lib/
│   ├── auth.ts                         # requireUser, requireAdmin
│   ├── tenant.ts                       # tenant + agency admin helpers
│   ├── supabase/
│   │   ├── client.ts                   # Browser client
│   │   ├── server.ts                   # Server client (RSC + route handlers)
│   │   └── service.ts                  # Service role (bypass RLS)
│   ├── meta/
│   │   ├── client.ts                   # SDK instance builder
│   │   └── probe.ts                    # Curl-equivalent for debug
│   ├── agent/
│   │   ├── signals.ts                  # 5 deterministic signal functions
│   │   └── recommender.ts              # Rule-based recommender
│   └── utils.ts                        # cn() helper, etc.
├── types/database.types.ts             # Generated from Supabase
supabase/
├── migrations/0001-0010                # Schema + RLS + RPCs
└── functions/                           # Edge Functions (later)
scripts/
├── seed-tenant.ts                      # One-time NEON tenant seed
└── probe-meta.ts                       # Curl-equivalent for Meta API
```

## What works on Day 1 (2026-08-16)

- [x] Project scaffold (Next.js 16 + Tailwind v4 + TypeScript)
- [x] Full Supabase DB schema (10 migrations)
- [x] RLS policies (multi-tenant from day 1)
- [x] Helper SECURITY DEFINER RPCs (avoids the 5-min RLS edge hang)
- [x] Auth flow (Supabase magic link)
- [x] 5 page shells (dashboard, businesses, businesses/[id]/campaigns, businesses/[id]/campaigns/[id], recommendations)
- [x] Cron route stubs (pull-structure, pull-insights, pull-comments, run-agent)
- [x] Meta client builder + probe script
- [x] Recommender signal functions (5 deterministic)

## What needs Nils (Meta BM access)

- [ ] System User token from Meta Business Manager
- [ ] Ad Account ID
- [ ] Business Manager ID
- [ ] App ID + App Secret (if using Marketing API app credentials)

Once Nils drops those, the live Meta API integration lights up — the stub routes and SDK calls are already in place.

## Day-2+ roadmap

- Phase 1 (2-3 weeks from kickoff):
  - Live Meta API integration (Nils's token)
  - Real cron jobs
  - Daily briefing email
- Phase 2 (2 weeks): Comments pull + triage agent
- Phase 3 (2 weeks): Write actions (gated)
- Phase 4 (2 weeks): Multi-tenant admin + reporting
