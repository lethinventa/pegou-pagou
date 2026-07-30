import type { OpenFoodFactsResult } from "@/lib/types";

export async function searchOpenFoodFacts(query: string): Promise<OpenFoodFactsResult[]> {
  try {
    const response = await fetch(`/api/search-products?q=${encodeURIComponent(query)}`);
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data?.results) ? data.results : [];
  } catch {
    return [];
  }
}
