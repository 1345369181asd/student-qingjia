import { getSupabaseClient } from "@/storage/database/supabase-client";

export async function getClient() {
  return getSupabaseClient();
}

export function getDb() {
  return getSupabaseClient();
}
