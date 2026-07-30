import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase com a service role key — só pode ser importado de código
 * que roda no servidor (Server Actions, Route Handlers, Server Components).
 * O pacote "server-only" quebra o build se isso vazar pra um bundle client.
 */
export function getSupabaseServerClient() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY não configurados");
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}
