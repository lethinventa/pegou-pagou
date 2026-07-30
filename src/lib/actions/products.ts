"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Product } from "@/lib/types";

export async function getProducts(): Promise<Product[]> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from("products").select("*").order("name");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createProduct(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const price = Number(String(formData.get("price") ?? "").replace(",", "."));
  if (!name || Number.isNaN(price) || price < 0) return;

  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("products").insert({ name, price });
  if (error) throw new Error(error.message);

  revalidatePath("/config");
}

export async function deleteProduct(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/config");
}
