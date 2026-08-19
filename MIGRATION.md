# MIGRATION — cutting a customer over to their own deployment

> Last updated: 2026-08-19
> Audience: Kirk (operator), or anyone taking over a fresh Supabase + Vercel
> deployment of this codebase for a new customer.

This document is the step-by-step checklist for migrating a customer from the
**shared demo** (Kirk's Supabase + Kirk's Vercel + `comedyclubads.vercel.app`)
onto their **own infrastructure** (their Supabase org + their Vercel team +
their custom domain).

The codebase is built for one-shot migration. The schema, RLS, RPCs, and env
contract are designed so the customer can stand up a working deployment with
a single SQL paste + a single Vercel env push. This doc walks through it.

---

## 0. Before you start

Make sure you have:

- A Supabase account for the customer (or the customer's invitation to
  join their existing org). Need an org owner or developer role.
- A Vercel account for the customer (or an invite to their team). Need
  permissions to create / link projects and set env vars.
- A GitHub account for the customer (or an invite to be a collaborator
  on `kirkdettmann-ops/meta-ads-agent`). They can also transfer the
  repo to their own org if they want full ownership — see §6.
- The customer's **product name** (for the browser tab + login wordmark).
- The customer's **primary color** (oklch string) if they want to override
  the default `oklch(0.55 0.22 27)`. Optional.
- The customer's **first user email** (the operator who'll sign in first
  to create their tenant).
- The customer's **custom domain** (if applicable; many SMBs start on
  the free `*.vercel.app` and add a domain later).

---

## 1. Apply the SQL schema to the customer's Supabase

The customer creates a fresh Supabase project (or you use theirs). Then:

1. In the Supabase dashboard → **SQL Editor** → **New query**.
2. Open `supabase/combined.sql` from this repo (~78 KB as of 2026-08-19,
   includes 16 migrations). Paste the entire file.
3. Click **Run**. This creates all tables, RLS policies, indexes, RPCs.
4. The bundle is idempotent for functions and uses `CREATE TABLE IF NOT
   EXISTS` + `DROP POLICY IF EXISTS` so re-running is safe.

**Verify:** run the probe in §7. Every table and RPC should be present.

---

## 2. Push the env vars to the customer's Vercel project

Two options:

### Option A: Vercel dashboard (manual, no script)

1. Create / link a Vercel project to the customer's GitHub repo.
2. Project → **Settings** → **Environment Variables** → add the keys from
   `.env.example`. The full list is in that file with descriptions.

### Option B: `scripts/push-vercel-env.ts` (one command)

If the customer has issued you a Vercel personal token
(`vcp_*...`), you can push all 11 env vars in one go:

```bash
# In the customer's checkout
VERCEL_TOKEN=vcp_xxx npm run push-env
```

The script reads `.env.local` and POSTs each var to
`https://api.vercel.com/v10/projects/{projectId}/env`. Personal tokens work;
OIDC tokens do NOT (Vercel API limitation).

---

## 3. Supabase Auth URL config

In the customer's Supabase → **Authentication** → **URL Configuration**:

- **Site URL**: `https://your-app.vercel.app` (or the custom domain).
- **Additional Redirect URLs**: include the same URL plus
  `/auth/callback` for the magic-link bounce route:
  - `https://your-app.vercel.app/auth/callback`
  - `https://your-custom-domain.com/auth/callback` (if applicable)

**Why this matters:** Supabase silently overrides the `redirectTo` param
on magic-link emails if the target URL isn't on the allowlist — your
customers sign in but land on the Site URL instead. This is the #1
"magic link redirects to wrong place" cause.

---

## 4. Vercel env vars to set per deployment

These are the env vars the app reads at runtime. Set in Vercel Project
→ Settings → Environment Variables. Most are also in `.env.example`.

| Var | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | from the customer's Supabase API settings |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | the new `sb_publishable_...` format |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | server-only, never exposed to client |
| `SUPABASE_JWKS_URL` | yes | default = `{URL}/auth/v1/.well-known/jwks.json` |
| `CRON_SECRET` | yes | `openssl rand -base64 32` |
| `META_SYSTEM_USER_TOKEN` | yes for Meta | long-lived System User token from customer's Meta Business Manager |
| `META_BUSINESS_ID` | yes for Meta | numeric |
| `META_AD_ACCOUNT_ID` | yes for Meta | `act_...` |
| `META_PAGE_IDS` | yes for Meta | comma-separated |
| `NEXT_PUBLIC_APP_URL` | yes | where the app is served |
| `NEXT_PUBLIC_SITE_URL` | yes | usually same as above |
| `NEXT_PUBLIC_PRODUCT_NAME` | recommended | customer's product name (browser tab + login) |
| `AGENT_VERSION` | yes | `1.0.0` |
| `NEXT_PUBLIC_DEMO_LOGIN` | **DO NOT SET** in customer envs | demo-only, leave unset (or `"false"`) |

---

## 5. First user + first tenant

After the schema is applied and env vars are pushed, the customer's
**first user** needs to be created manually:

1. **Create the auth user** (Supabase dashboard → Authentication → Users
   → Add user → Create manually). Use the customer's real email so
   magic links actually deliver. (Don't use `*.local` placeholders —
   those have no MX records and the magic link never arrives.)
2. **Seed the tenant + profile + brand + placeholder social handles**:

   ```bash
   npm run seed -- \
     --email 'customer@theirdomain.com' \
     --tenant-name 'Their Brand Co' \
     --tenant-slug 'their-brand'
   ```

   The script defaults to the demo's "Comedy Club Co" tenant — **always
   pass `--tenant-name` and `--tenant-slug` for a real customer** so they
   get a tenant that matches their business.
3. **Sign in once** with the customer's email to confirm the magic-link
   flow works end-to-end before adding more users.

---

## 6. Custom domain (if applicable)

For SMBs that want a real domain (e.g. `ads.comedyclub.com`):

1. **Add the domain** in Vercel Project → Settings → Domains. Vercel
   shows a CNAME target.
2. **Configure DNS** at the customer's registrar:
   - CNAME `ads` (or `@`) → `cname.vercel-dns.com`
3. **Wait for DNS** to propagate (5 min - 24 h).
4. **Update Supabase Auth** → URL Configuration:
   - Site URL: the new domain
   - Additional Redirect URLs: `https://new-domain.com/auth/callback`
5. **Update Vercel env vars**: set `NEXT_PUBLIC_APP_URL` and
   `NEXT_PUBLIC_SITE_URL` to the new domain.
6. **Re-deploy** (Vercel will pick up the env var change on next push,
   or trigger a manual redeploy from the dashboard).

---

## 7. Verify with the probe

```bash
# If the customer has their own .env.local:
node scripts/check-migrations.mjs
```

Expected: every table check is ✓, every RPC check is ✓. If anything
shows ✗, go back to §1 and re-paste the SQL bundle.

For the full customer-takeover health check, also run:

```bash
node scripts/setup-new-deployment.ts --supabase-url "https://xxx.supabase.co" --service-key "sb_secret_xxx"
```

It runs the same probe + prints the rest of the cutover checklist
(custom domain, magic-link email template, etc.).

---

## 8. Post-cutover cleanup (Kirk's side, not the customer's)

After the customer is on their own infra:

- **Delete the seeded `*.local` users** from Kirk's Supabase
  (`nils@comedy-club-demo.local`, `client@comedy-club-demo.local`). They
  were only there for the demo.
- **Optionally retire `comedyclubads.vercel.app`** once the customer is
  on their own domain. The alias is still useful as a sales surface,
  so most folks keep it as a permanent demo URL.
- **Turn off GitHub auto-deploy** on `kirkdettmann-ops/meta-ads-agent` if
  the repo was transferred to the customer's org. If the customer was
  added as a collaborator, leave it on.

---

## 9. Going further (optional)

Things the customer can do once they're on their own infra:

- **Custom brand** — `UPDATE public.tenant_brand SET ...` with their
  display name, wordmark text, tagline, primary color, hero watermark
  SVG. The whole UI re-skins on next page load.
- **Add real Meta ad accounts** — populate `meta_business`,
  `meta_ad_account`, `meta_page` with their Meta System User token +
  business IDs.
- **Add TikTok** — populate `tiktok_business_account`,
  `tiktok_advertiser` with their TikTok Business Center OAuth.
- **Email branding** — Supabase → Auth → Email Templates → Magic Link
  → customize the from-name, subject, body with their brand.
- **Production domain in Vercel** — set the customer's domain as the
  **production domain** in Vercel Project → Settings → Domains so every
  push auto-rolls forward without manual re-alias.

---

## 10. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Magic link redirects to Site URL instead of `/dashboard` | Target URL not on Supabase allowlist | Add the redirect URL to Supabase → Auth → URL Configuration |
| `get_tenant_brand` returns default Comedy Club Co values | No `tenant_brand` row for this tenant | Run the seed script (§5) or INSERT manually |
| Vercel preview URL shows old code | `git push` happened, but the auto-generated production domain is on an older commit | Re-alias the custom domain to the latest deployment URL |
| 401 on dashboard load | User has no `user_profile` row | Run `seed-tenant.ts` for that user (after they sign in once) |
| `Tenant not in scope: caller=... target=...` from RPC | User's `user_profile.tenant_id` doesn't match the target tenant | Check `SELECT * FROM user_profile WHERE auth_user_id = '...'` |

---

## 11. Reference

- `supabase/combined.sql` — full schema bundle
- `.env.example` — every env var with descriptions
- `scripts/setup-new-deployment.ts` — connection + schema probe + checklist
- `scripts/check-migrations.mjs` — schema-only probe
- `scripts/seed-tenant.ts` — creates tenant + user_profile + brand row + social-handle placeholders
- `scripts/push-vercel-env.ts` — pushes all env vars from `.env.local` to Vercel via API
- `src/lib/brand.ts` — `Brand` type + `getTenantBrand()` server helper
- `supabase/migrations/0015_tenant_brand.sql` — brand table + RPCs
- `supabase/migrations/0016_upsert_social_handle.sql` — write API for social handles
