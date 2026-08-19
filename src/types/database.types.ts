/**
 * Placeholder Supabase generated types.
 *
 * In a real install, run `npm run db:types` to generate these from the
 * Supabase project's schema. For Day 1, we hand-write just the shapes we
 * use in the UI. Replace this file with the generated one once you connect
 * to a live Supabase project.
 *
 * Generated types come from:
 *   supabase gen types typescript --local > src/types/database.types.ts
 *
 * KIRK, 2026-08-19: rewrote the Insert/Update shapes to be inlined rather
 * than using the self-referential `Database["public"]["Tables"]["X"]["Row"]`
 * trick. The recursive reference caused tsc strict mode to error:
 *   "TS1005: ']' expected" / "TS1131: Property or signature expected"
 * on line 27. That was the only thing keeping
 * `typescript.ignoreBuildErrors: true` in next.config.ts, which was in
 * turn masking real "X is not defined" type bugs from reaching production.
 * Inlined shapes are a few extra lines but typecheck cleanly and don't
 * pull their own weight via type self-reference.
 */

export type Json = string | number | boolean | null | { [k: string]: Json | undefined } | Json[];

type TenantStatus = "active" | "suspended" | "archived";
type UserRole = "owner" | "admin" | "client";
type MetaTokenStatus = "unknown" | "fresh" | "aging" | "expired" | "error";

export interface Database {
  public: {
    Tables: {
      tenant: {
        Row: {
          id: string;
          name: string;
          slug: string;
          status: TenantStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          name: string;
          slug: string;
          status?: TenantStatus;
        };
        Update: Partial<{
          name: string;
          slug: string;
          status: TenantStatus;
        }>;
      };
      user_profile: {
        Row: {
          id: string;
          auth_user_id: string;
          tenant_id: string;
          role: UserRole;
          display_name: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          auth_user_id: string;
          tenant_id: string;
          role?: UserRole;
          display_name?: string | null;
          avatar_url?: string | null;
        };
        Update: Partial<{
          tenant_id: string;
          role: UserRole;
          display_name: string | null;
          avatar_url: string | null;
        }>;
      };
      meta_business: {
        Row: {
          id: string;
          tenant_id: string;
          meta_bm_id: string;
          name: string;
          access_token: string | null;
          token_status: MetaTokenStatus;
          token_last_used_at: string | null;
          token_rotated_at: string | null;
          raw_json: Json | null;
          fetched_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          tenant_id: string;
          meta_bm_id: string;
          name: string;
          access_token?: string | null;
          token_status?: MetaTokenStatus;
          token_last_used_at?: string | null;
          token_rotated_at?: string | null;
          raw_json?: Json | null;
        };
        Update: Partial<{
          name: string;
          access_token: string | null;
          token_status: MetaTokenStatus;
          token_last_used_at: string | null;
          token_rotated_at: string | null;
          raw_json: Json | null;
          fetched_at: string;
        }>;
      };
      // Other tables omitted from the placeholder — see the generated types
      // once `npm run db:types` runs against a live Supabase project.
    };
  };
}
