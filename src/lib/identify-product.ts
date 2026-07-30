import type { IdentifyProductResult, Product } from "@/lib/types";

export async function identifyProduct(
  imageBase64: string,
  products: Product[]
): Promise<IdentifyProductResult> {
  try {
    const response = await fetch("/api/identify-product", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image: imageBase64,
        products: products.map((p) => ({ id: p.id, name: p.name, price: p.price })),
      }),
    });

    if (!response.ok) {
      return { product_id: null, confidence: "baixa" };
    }

    const data = await response.json();
    if (data?.confidence === "alta" || data?.confidence === "media" || data?.confidence === "baixa") {
      return { product_id: data.product_id ?? null, confidence: data.confidence };
    }
    return { product_id: null, confidence: "baixa" };
  } catch {
    return { product_id: null, confidence: "baixa" };
  }
}
