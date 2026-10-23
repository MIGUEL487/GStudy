import { createClient } from "@supabase/supabase-js";
import { supabaseConfig } from "@/integrations/supabase/config";

/** A public shared cache must never accept educational content written directly by clients. */
export function gameCacheWriter() {
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"]?.trim();
  if (!key) return null;
  const { url } = supabaseConfig(import.meta.env, process.env, true);
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
