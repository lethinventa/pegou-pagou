import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";

// Bucket público criado manualmente no painel do Supabase (Storage → New bucket
// → "product-references", marcado como público). Ver supabase/migrations/0003_products_module.sql.
const BUCKET = "product-references";

function extensionFromMimeType(mimeType: string): string {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

/** Sobe uma imagem pro Storage e devolve a URL pública, dentro de `folder/`. */
export async function uploadProductImage(file: File, folder: string): Promise<string> {
  const supabase = getSupabaseServerClient();
  const ext = extensionFromMimeType(file.type);
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || "image/jpeg",
    upsert: false,
  });
  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
