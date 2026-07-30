import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export type MonthlyLogRow = {
  person_id: string | null;
  product_name: string;
  price: number;
};

function currentMonthRange(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1).toISOString();
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 1).toISOString();
  return { start, end };
}

export async function getCurrentMonthLogs(): Promise<MonthlyLogRow[]> {
  const { start, end } = currentMonthRange();
  const supabase = getSupabaseServerClient();

  const { data, error } = await supabase
    .from("consumption_logs")
    .select("person_id, product_name, price")
    .gte("created_at", start)
    .lt("created_at", end);

  if (error) throw new Error(error.message);
  return data ?? [];
}
