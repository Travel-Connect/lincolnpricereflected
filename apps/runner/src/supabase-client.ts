/**
 * Supabase client singleton for the Runner.
 * Uses service_role key for full DB access.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import "dotenv/config";

let client: SupabaseClient | null = null;

/** Get (or create) the singleton Supabase client */
export function getSupabase(): SupabaseClient {
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
  });
  return client;
}
