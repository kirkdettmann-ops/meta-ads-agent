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
 */

export type Json = string | number | boolean | null | { [k: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      tenant: {
        Row: {
          id: string;
          name: string;
          slug: string;
          status: "active" | "suspended" | "archived";
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["tenant"]["Row">, "id" | "created_at" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["tenant"]["Insert"]>;
      };
      user_profile: {
        Row: {
          id: string;
          auth_user_id: string;
          tenant_id: string;
          role: "owner" | "admin" | "client";
          display_name: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["user_profile"]["Row"], "id" | "created_at" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["user_profile"]["Insert"]>;
      };
      meta_business: {
        Row: {
          id: string;
          tenant_id: string;
          meta_bm_id: string;
          name: string;
          access_token: string | null;
          token_status: "unknown" | "fresh" | "aging" | "expired" | "error";
          token_last_used_at: string | null;
          token_rotated_at: string | null;
          raw_json: Json | null;
          fetched_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["meta_business"]["Row"], "id" | "created_at" | "updated_at" | "fetched_at">;
        Update: Partial<Database["public"]["Tables"]["meta_business"]["Insert"]>;
      };
      // Other tables omitted from the placeholder — see the generated types
      // once `npm run db:types` runs against a live Supabase project.
    };
  };
}
