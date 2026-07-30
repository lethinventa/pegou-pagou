"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export type SessionItem = {
  productId: string;
  productName: string;
  price: number;
};

/**
 * Grava o carrinho inteiro da sessão de uma vez, no momento do "Concluir"
 * (a pessoa só é conhecida nesse instante — ver decisão de fluxo no README).
 */
export async function finalizeSession(personId: string, items: SessionItem[]) {
  if (!personId || items.length === 0) return;

  const supabase = getSupabaseServerClient();
  const rows = items.map((item) => ({
    person_id: personId,
    product_id: item.productId,
    product_name: item.productName,
    price: item.price,
  }));

  const { error } = await supabase.from("consumption_logs").insert(rows);
  if (error) throw new Error(error.message);

  revalidatePath("/resumo");
}
