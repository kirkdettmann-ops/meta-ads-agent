# AGENTS.md — meta-ads-agent

This file is the single source of truth for any agent (human or AI) working on this project. Read it first.

## Project

A **Meta Ads management system** for the NEON client. Multi-tenant. Standalone Next.js + Supabase. Read-only agent in v1.

**Owner**: Kirk (`kirkdettmann-ops`)
**Co-planner**: Nils (Kirk's brother) — has the Meta Business Manager access. Kirk does NOT.
**Live URL**: not deployed yet (Day 1, 2026-08-16)
**Local dev**: `npm run dev` → http://localhost:4000

## Day 1 reality (2026-08-16)

Kirk does NOT have Meta Business Manager access. Nils does. Today's deliverable: **scaffold + DB + auth + UI shell with mock data**. No live Meta data.

Live Meta integration lights up when Nils drops the System User token + Ad Account ID + Business Manager ID into `.env.local`.

## Hard rules

1. **ALWAYS ask before `git push` to any remote.** Kirk's standing rule, applies to this repo too. No surprise pushes to `kirkdettmann-ops/meta-ads-agent`. Branch + PR only.
2. **No auto-install of software.** If a tool is missing, ask first. Don't `winget install`, `scoop install`, etc.
3. **PowerShell on Windows.** No bash. No `&&`. No `cd dir && command`. Use `;` or the `workdir` parameter. `npm`/`npx` are blocked by execution policy — use the `.cmd` wrappers explicitly: `& "C:\Program Files\nodejs\npm.cmd" install`.
4. **`.env.local` is gitignored. Never commit.** Real keys go to Vercel env vars (encrypted).
5. **Every read goes through a SECURITY DEFINER RPC.** Never `from('table').select()` directly from RSC. Reason: the 5-min Vercel edge hang on `tenant_id` RLS.
6. **Every table has `tenant_id uuid not null` from day 1.** No exceptions. No retrofits.
7. **Dev server = `npm run dev` (port 4000).** Don't deploy `--preview` unless real-device testing is needed.

## Three-question memory rule (for new tables / RPCs / files)

When in doubt, ask:
1. Only true in this repo? → Update this `AGENTS.md` (project memory).
2. True across projects? → Update `agents/mavis/memory/MEMORY.md` (agent memory).
3. True across users? → Update `agents/mavis/memory/user.md` (user memory).

## Architecture cheat sheet

```
Meta API
  ↓ (Supabase pg_cron, every 6h/4h/15min)
Raw tables (raw_campaign, raw_adset, raw_ad, raw_insights, raw_page_post, raw_comment, audience_snapshot)
  ↓ (derived rollups)
Derived tables (campaign_daily_metrics, adset_daily_metrics, audience_saturation_score, comment_sentiment_score)
  ↓ (read by)
Agent (read-only — writes to recommendation + alert_log only)
  ↓ (displayed by)
Surface (5 pages, reads via SECURITY DEFINER RPCs)
```

## Phase 1 = data sync + recommender

- 2-3 weeks target from kickoff
- Day 1 ships the skeleton; live Meta wires in when Nils's token lands
- Phase 2 (comments + triage), Phase 3 (write actions, gated), Phase 4 (admin + reports) come later

See the original plan in `README.md` and the section 9 decisions for the locked design.
