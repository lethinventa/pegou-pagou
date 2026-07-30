import { MOCK_PRODUCTS } from "@/lib/mock-data";
import type { IdentifyProductResult } from "@/lib/types";

/**
 * Substitui POST /api/identify-product (Gemini) enquanto a IA de visão real
 * não está plugada. Mesma assinatura — troca é 1:1 quando o backend chegar.
 */
export async function mockIdentifyProduct(
  _imageBase64: string
): Promise<IdentifyProductResult> {
  await new Promise((resolve) => setTimeout(resolve, 700 + Math.random() * 500));

  const roll = Math.random();
  if (roll < 0.35) {
    return { product_id: null, confidence: "baixa" };
  }

  const product = MOCK_PRODUCTS[Math.floor(Math.random() * MOCK_PRODUCTS.length)];
  return { product_id: product.id, confidence: roll < 0.75 ? "alta" : "media" };
}
