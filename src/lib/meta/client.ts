/**
 * Meta (Facebook) Marketing API client builder.
 *
 * Uses the official `facebook-nodejs-business-sdk` from Meta.
 * Token strategy: System User token (per Business, long-lived).
 *
 * Day 1: STUB. The actual Meta credentials are with Nils.
 * When META_SYSTEM_USER_TOKEN + META_BUSINESS_ID + META_AD_ACCOUNT_ID are set,
 * the cron routes will call these builders to get a real client.
 */

export type MetaClientConfig = {
  accessToken: string;
  apiVersion: string;
};

/**
 * Read Meta credentials from env. Returns null if not configured.
 * Use this as the gate before any live Meta API call.
 */
export function getMetaConfig(): MetaClientConfig | null {
  const accessToken = process.env.META_SYSTEM_USER_TOKEN;
  const apiVersion = process.env.META_API_VERSION ?? "v23.0";
  if (!accessToken) {
    return null;
  }
  return { accessToken, apiVersion };
}

/**
 * Check if Meta is configured (token + IDs present).
 */
export function isMetaConfigured(): boolean {
  return !!(
    process.env.META_SYSTEM_USER_TOKEN &&
    process.env.META_BUSINESS_ID &&
    process.env.META_AD_ACCOUNT_ID
  );
}

/**
 * Build a Meta Marketing API client.
 *
 * Uses dynamic import to avoid loading the SDK in environments where
 * it isn't installed (Day 1 scaffold, before `npm install`).
 *
 * Usage:
 *   const fb = await getMetaClient();
 *   if (!fb) return; // not configured
 *   const campaigns = await new AdAccount(adAccountId).getCampaigns();
 */
export async function getMetaClient(): Promise<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  FacebookAds: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  AdAccount: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Campaign: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  AdSet: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Ad: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Business: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Page: any;
} | null> {
  const config = getMetaConfig();
  if (!config) return null;

  // Dynamic import — the SDK is ESM and heavy
  const sdk = await import("facebook-nodejs-business-sdk");
  const {
    FacebookAds,
    AdAccount,
    Campaign,
    AdSet,
    Ad,
    Business,
    Page,
  } = sdk;

  FacebookAds.init(config.accessToken);

  return { FacebookAds, AdAccount, Campaign, AdSet, Ad, Business, Page };
}

/**
 * Fetch a list of businesses accessible to the configured System User.
 * Used by the seed-tenant script and the /businesses page refresh.
 */
export async function fetchBusinesses(): Promise<
  Array<{ id: string; name: string; created_time: string }>
> {
  const client = await getMetaClient();
  if (!client) {
    throw new Error("Meta not configured. Set META_SYSTEM_USER_TOKEN first.");
  }
  const me = new client.Business("me");
  const businesses = await me.getOwnedBusinesses(
    ["id", "name", "created_time"],
    { limit: 100 },
  );
  return businesses;
}

/**
 * Fetch the ad accounts for a Business.
 */
export async function fetchAdAccounts(businessId: string) {
  const client = await getMetaClient();
  if (!client) {
    throw new Error("Meta not configured. Set META_SYSTEM_USER_TOKEN first.");
  }
  const biz = new client.Business(businessId);
  const accounts = await biz.getAdAccounts(
    [
      "id",
      "name",
      "currency",
      "timezone_name",
      "account_status",
      "business_name",
    ],
    { limit: 100 },
  );
  return accounts;
}

/**
 * Fetch campaigns for an ad account.
 */
export async function fetchCampaigns(
  adAccountId: string,
  fields: string[] = [
    "id",
    "name",
    "objective",
    "status",
    "daily_budget",
    "lifetime_budget",
    "start_time",
    "stop_time",
    "buying_type",
    "updated_time",
  ],
) {
  const client = await getMetaClient();
  if (!client) {
    throw new Error("Meta not configured. Set META_SYSTEM_USER_TOKEN first.");
  }
  const account = new client.AdAccount(adAccountId);
  const campaigns = await account.getCampaigns(fields, { limit: 500 });
  return campaigns;
}

/**
 * Fetch insights (daily metrics) for an ad account.
 * The `time_increment=1` parameter returns one row per day in the date range,
 * which lets us batch a 90-day pull in a single API call.
 */
export async function fetchInsights(
  adAccountId: string,
  options: {
    since: string; // YYYY-MM-DD
    until: string; // YYYY-MM-DD
    level?: "account" | "campaign" | "adset" | "ad";
  },
) {
  const client = await getMetaClient();
  if (!client) {
    throw new Error("Meta not configured. Set META_SYSTEM_USER_TOKEN first.");
  }
  const account = new client.AdAccount(adAccountId);
  const fields = [
    "impressions",
    "reach",
    "frequency",
    "clicks",
    "ctr",
    "cpc",
    "cpm",
    "spend",
    "conversions",
    "cost_per_conversion",
    "purchase_roas",
    "actions",
  ];
  const params: Record<string, unknown> = {
    time_increment: 1, // one row per day
    time_range: { since: options.since, until: options.until },
    level: options.level ?? "ad",
  };
  const insights = await account.getInsights(fields, params);
  return insights;
}
