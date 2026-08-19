#!/usr/bin/env node
/**
 * Find page.tsx + layout.tsx files that use a capitalized JSX identifier
 * but never import it. Catches what `typescript.ignoreBuildErrors: true`
 * in next.config.ts masks at build time but blows up at runtime as
 * `ReferenceError: X is not defined`.
 *
 * Usage:  node scripts/scan-missing-imports.mjs
 * Output: zero or more "<File> uses <X> but doesn't import it" lines.
 *
 * Known false positives to ignore: TypeScript generics like
 * `Array<Record<string, unknown>>` register as `<Record` even though
 * it's not JSX. The scanner doesn't try to parse the AST — it'd need
 * a real TS parser to be bulletproof. Manual review is fine for the
 * handful of hits this produces.
 *
 * KIRK, 2026-08-19: written after a 20-minute debugging session
 * chasing a "this page couldn't load" error in production. Two meta
 * dashboard pages used <Badge> without importing it. The build passed
 * (ignoreBuildErrors: true), the page rendered fine until React hit
 * the first <Badge> and threw. Recommend running this in CI on every
 * PR (or at least before pushing to main).
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve("src");
const results = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) walk(full);
    else if (entry === "page.tsx" || entry === "layout.tsx") check(full);
  }
}

function check(file) {
  const src = readFileSync(file, "utf8");
  // Find all <Capitalized ...> JSX uses
  const used = new Set();
  for (const m of src.matchAll(/<([A-Z][A-Za-z0-9_]+)/g)) {
    used.add(m[1]);
  }
  // Find all top-level imports
  const imported = new Set();
  for (const m of src.matchAll(/^import\s+(?:type\s+)?\{([^}]+)\}/gm)) {
    for (let n of m[1].split(",")) {
      n = n.trim().split(/\s+as\s+/)[0];
      if (n) imported.add(n);
    }
  }
  // Default imports too
  for (const m of src.matchAll(/^import\s+([A-Z][A-Za-z0-9_]+)\s+from/gm)) {
    imported.add(m[1]);
  }
  const missing = [...used].filter((u) => !imported.has(u));
  if (missing.length) {
    results.push({ file: relative(ROOT, file), missing });
  }
}

walk(ROOT);

if (results.length === 0) {
  console.log("✓ No missing imports found");
  process.exit(0);
}

console.log("Missing imports (would be ReferenceError at runtime):");
for (const r of results) {
  console.log(`  ${r.file}`);
  for (const m of r.missing) console.log(`    <${m}>`);
}
process.exit(1);
