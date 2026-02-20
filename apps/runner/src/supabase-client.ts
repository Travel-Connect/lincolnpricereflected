/**
 * Supabase client singleton for the Runner.
 * Uses service_role key for full DB access.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";

// Load .env from project root
config({ path: resolve(import.meta.dirname, "..", "..", "..", ".env") });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any, "lincoln">;

let client: AnySupabaseClient | null = null;

/** Get (or create) the singleton Supabase client */
export function getSupabase(): AnySupabaseClient {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment",
    );
  }

  client = createClient(url, key, {
    auth: { persistSession: false },
    db: { schema: "lincoln" },
  });
  return client;
}
