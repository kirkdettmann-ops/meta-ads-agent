/**
 * One-off: push all 11 env vars from .env.local to Vercel
 * for both production and preview environments.
 *
 * Idempotent: each env var call is upsert-like (Vercel allows
 * multiple values per key+env, but we want one of each).
 *
 * Skips: VERCEL_TOKEN, VERCEL_OIDC_TOKEN (Vercel-managed),
 * and any line that starts with #.
 */

import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";

if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const VERCEL_ORG_ID = process.env.VERCEL_ORG_ID;
const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID;

if (!VERCEL_TOKEN || !VERCEL_ORG_ID || !VERCEL_PROJECT_ID) {
  console.error("Need VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID env vars.");
  process.exit(1);
}

async function main() {
  // Vars to push — only the ones from .env.local that the app actually uses.
  // Skips VERCEL_* (Vercel-managed) and the Vercel-added OIDC token line.
  const SKIP_PREFIXES = ["VERCEL_"];

  const envContent = readFileSync(".env.local", "utf8");
  const vars: Array<{ key: string; value: string; target: ("production" | "preview" | "development")[] }> = [];

  for (const raw of envContent.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (SKIP_PREFIXES.some((p) => key.startsWith(p))) continue;
    // Push to production + preview (skip development — no `vercel dev` usage).
    vars.push({ key, value, target: ["production", "preview"] });
  }

  console.log(`Pushing ${vars.length} env vars to Vercel project ${VERCEL_PROJECT_ID} (org ${VERCEL_ORG_ID}):`);
  for (const v of vars) console.log(`  - ${v.key} (×${v.target.length})`);

  const API = `https://api.vercel.com/v10/projects/${VERCEL_PROJECT_ID}/env`;

  let okCount = 0;
  let skipCount = 0;
  let failCount = 0;

  for (const v of vars) {
    for (const target of v.target) {
      const body = {
        key: v.key,
        value: v.value,
        type: "encrypted",
        target: [target],
      };
      const r = await fetch(API, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${VERCEL_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (r.ok) {
        okCount++;
        console.log(`  ✓ ${v.key} → ${target}`);
      } else {
        const text = await r.text();
        // Already exists with same value → idempotent, treat as skip
        if (text.includes("already exists") || r.status === 400) {
          skipCount++;
          console.log(`  = ${v.key} → ${target} (already exists)`);
        } else {
          failCount++;
          console.error(`  ✗ ${v.key} → ${target}: ${r.status} ${text.slice(0, 200)}`);
        }
      }
    }
  }

  console.log(`\nDone. ok=${okCount} skip=${skipCount} fail=${failCount}`);
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
