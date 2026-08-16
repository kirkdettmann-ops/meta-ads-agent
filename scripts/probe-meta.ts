/**
 * Probe script: hit the Meta Marketing API directly to verify the token works.
 *
 * Usage:
 *   npm run probe:meta -- --bm <business_id> --account <ad_account_id>
 *
 * What it does:
 *   1. Reads META_SYSTEM_USER_TOKEN from env
 *   2. Fetches the Business's owned ad accounts
 *   3. Prints the first 5 + their currency/timezone/status
 *
 * Use this to verify Nils's token before running the cron.
 */

import { createClient } from "facebook-nodejs-business-sdk";

async function main() {
  const accessToken = process.env.META_SYSTEM_USER_TOKEN;
  if (!accessToken) {
    console.error("META_SYSTEM_USER_TOKEN not set in env.");
    process.exit(1);
  }

  const { FacebookAds, Business } = createClient(accessToken);

  const args = process.argv.slice(2);
  const argMap: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, "");
    argMap[key] = args[i + 1];
  }

  console.log("Token length:", accessToken.length, "chars");

  try {
    const me = new Business("me");
    const businesses = await me.getOwnedBusinesses(["id", "name", "created_time"], { limit: 10 });
    console.log(`\nFound ${businesses.length} businesses:`);
    for (const b of businesses) {
      console.log(`  - ${b.id}  ${b.name}`);
    }

    const target = argMap.bm ?? businesses[0]?.id;
    if (!target) {
      console.log("\nNo business ID provided and none found.");
      process.exit(0);
    }

    console.log(`\nInspecting business ${target}:`);
    const biz = new Business(target);
    const accounts = await biz.getAdAccounts(
      ["id", "name", "currency", "timezone_name", "account_status", "business_name"],
      { limit: 20 },
    );
    console.log(`  ${accounts.length} ad accounts:`);
    for (const a of accounts) {
      console.log(`  - ${a.id}  ${a.name}  [${a.currency}, ${a.timezone_name}, status=${a.account_status}]`);
    }

    if (argMap.account) {
      console.log(`\nPulling 7-day insights for act_${argMap.account}:`);
      const acct = new (await import("facebook-nodejs-business-sdk")).AdAccount(`act_${argMap.account}`);
      const since = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
      const until = new Date().toISOString().slice(0, 10);
      const insights = await acct.getInsights(
        ["impressions", "reach", "clicks", "spend", "ctr", "cpc", "cpm"],
        { time_increment: 1, time_range: { since, until } },
      );
      console.log(`  ${insights.length} rows. First 3:`);
      for (const i of insights.slice(0, 3)) {
        console.log(`    ${i.date_start}  spend=${i.spend}  impressions=${i.impressions}  ctr=${i.ctr}`);
      }
    }
  } catch (err) {
    console.error("Meta API error:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main();
