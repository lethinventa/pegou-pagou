"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { uploadProductImage } from "@/lib/actions/storage";
import type { Product, ProductWithStats, ReferenceImage } from "@/lib/types";

const REFERENCES_PATH = "/produtos";

export async function getProducts(): Promise<Product[]> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from("products").select("*").order("name");
  if (error) throw new Error(error.message);
  return data ?? [];
}

// Usa o count embutido do PostgREST em vez de N+1 queries por produto.
export async function getProductsWithStats(): Promise<ProductWithStats[]> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("products")
    .select("*, product_reference_images(count)")
    .order("name");
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const { product_reference_images, ...product } = row as Product & {
      product_reference_images: { count: number }[];
    };
    return {
      ...product,
      reference_count: product_reference_images?.[0]?.count ?? 0,
    };
  });
}

export async function getProduct(id: string): Promise<Product | null> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from("products").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function createProduct(formData: FormData): Promise<{ id: string } | undefined> {
  const name = String(formData.get("name") ?? "").trim();
  const price = Number(String(formData.get("price") ?? "").replace(",", "."));
  if (!name || Number.isNaN(price) || price < 0) return undefined;

  // Vêm preenchidos quando o produto foi escolhido via busca no Open Food Facts;
  // ficam null no cadastro manual simples.
  const brand = String(formData.get("brand") ?? "").trim() || null;
  const quantity = String(formData.get("quantity") ?? "").trim() || null;
  const externalId = String(formData.get("externalId") ?? "").trim() || null;
  const category = String(formData.get("category") ?? "").trim() || null;

  // Imagem principal: ou uma URL externa (resultado do Open Food Facts), ou um
  // arquivo enviado manualmente no cadastro — nunca os dois ao mesmo tempo.
  let imageUrl = String(formData.get("imageUrl") ?? "").trim() || null;
  const mainImageFile = formData.get("mainImageFile");
  if (mainImageFile instanceof File && mainImageFile.size > 0) {
    imageUrl = await uploadProductImage(mainImageFile, "products");
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("products")
    .insert({
      name,
      price,
      brand,
      quantity,
      image_url: imageUrl,
      external_id: externalId,
      category,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  revalidatePath(REFERENCES_PATH);
  revalidatePath("/config");
  return data;
}

export async function updateProduct(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const price = Number(String(formData.get("price") ?? "").replace(",", "."));
  if (!id || !name || Number.isNaN(price) || price < 0) return;

  const category = String(formData.get("category") ?? "").trim() || null;

  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from("products")
    .update({ name, price, category, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath(REFERENCES_PATH);
  revalidatePath(`${REFERENCES_PATH}/${id}`);
  redirect(`${REFERENCES_PATH}/${id}`);
}

export async function deleteProduct(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath(REFERENCES_PATH);
  revalidatePath("/config");
}

export async function recordRecognitionFeedback(productId: string, wasCorrect: boolean) {
  const supabase = getSupabaseServerClient();
  const column = wasCorrect ? "correct_recognitions" : "incorrect_recognitions";
  const { data, error } = await supabase.from("products").select(column).eq("id", productId).single();
  if (error || !data) return;

  const current = (data as Record<string, number>)[column] ?? 0;
  await supabase
    .from("products")
    .update({ [column]: current + 1 })
    .eq("id", productId);

  revalidatePath(`${REFERENCES_PATH}/${productId}`);
}

export async function getReferenceImages(productId: string): Promise<ReferenceImage[]> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("product_reference_images")
    .select("*")
    .eq("product_id", productId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Todas as referências já vinculadas a um produto — usado pra treinar o reconhecimento local. */
export async function getAllReferenceImages(): Promise<ReferenceImage[]> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("product_reference_images")
    .select("*")
    .not("product_id", "is", null);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getOrphanImages(): Promise<ReferenceImage[]> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("product_reference_images")
    .select("*")
    .is("product_id", null)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function addReferenceImage(formData: FormData) {
  const productId = String(formData.get("productId") ?? "").trim() || null;
  const origem = String(formData.get("origem") ?? "upload");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return;
  if (origem !== "camera" && origem !== "upload") return;

  const imagePath = await uploadProductImage(file, productId ?? "dataset");

  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("product_reference_images").insert({
    product_id: productId,
    image_path: imagePath,
    origem,
  });
  if (error) throw new Error(error.message);

  if (productId) revalidatePath(`${REFERENCES_PATH}/${productId}`);
  revalidatePath(`${REFERENCES_PATH}/dataset`);
}

export async function deleteReferenceImage(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const productId = String(formData.get("productId") ?? "").trim() || null;
  if (!id) return;

  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("product_reference_images").delete().eq("id", id);
  if (error) throw new Error(error.message);

  if (productId) revalidatePath(`${REFERENCES_PATH}/${productId}`);
  revalidatePath(`${REFERENCES_PATH}/dataset`);
}

export async function setMainReferenceImage(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const productId = String(formData.get("productId") ?? "");
  if (!id || !productId) return;

  const supabase = getSupabaseServerClient();
  const { data: image, error: fetchError } = await supabase
    .from("product_reference_images")
    .select("image_path")
    .eq("id", id)
    .single();
  if (fetchError || !image) return;

  const { error } = await supabase
    .from("products")
    .update({ image_url: image.image_path, updated_at: new Date().toISOString() })
    .eq("id", productId);
  if (error) throw new Error(error.message);

  revalidatePath(`${REFERENCES_PATH}/${productId}`);
}

export async function linkOrphanImage(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const productId = String(formData.get("productId") ?? "");
  if (!id || !productId) return;

  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from("product_reference_images")
    .update({ product_id: productId })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath(`${REFERENCES_PATH}/dataset`);
  revalidatePath(`${REFERENCES_PATH}/${productId}`);
}
