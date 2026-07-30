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

  // Vêm preenchidos quando o produto foi escolhido via busca no Open Food Facts;
  // ficam null no cadastro manual simples.
  const brand = String(formData.get("brand") ?? "").trim() || null;
  const quantity = String(formData.get("quantity") ?? "").trim() || null;
  const imageUrl = String(formData.get("imageUrl") ?? "").trim() || null;
  const externalId = String(formData.get("externalId") ?? "").trim() || null;

  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("products").insert({
    name,
    price,
    brand,
    quantity,
    image_url: imageUrl,
    external_id: externalId,
  });
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
