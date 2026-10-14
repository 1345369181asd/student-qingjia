import { getSupabaseClient } from '@/storage/database/supabase-client';

export function getDb() {
  return getSupabaseClient();
}
