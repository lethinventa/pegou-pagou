import type { ConsumptionLog, Person, Product } from "@/lib/types";

// Dados de exemplo em memória — substituídos pelo Supabase depois.
export const MOCK_PEOPLE: Person[] = [
  { id: "p1", name: "Letícia", created_at: "2026-01-01T00:00:00Z" },
  { id: "p2", name: "João", created_at: "2026-01-01T00:00:00Z" },
  { id: "p3", name: "Marina", created_at: "2026-01-01T00:00:00Z" },
  { id: "p4", name: "Carlos", created_at: "2026-01-01T00:00:00Z" },
  { id: "p5", name: "Ana", created_at: "2026-01-01T00:00:00Z" },
  { id: "p6", name: "Rafael", created_at: "2026-01-01T00:00:00Z" },
];

export const MOCK_PRODUCTS: Product[] = [
  { id: "prod1", name: "Coca-Cola lata", price: 6, created_at: "2026-01-01T00:00:00Z" },
  { id: "prod2", name: "Guaraná lata", price: 6, created_at: "2026-01-01T00:00:00Z" },
  { id: "prod3", name: "Água com gás", price: 4, created_at: "2026-01-01T00:00:00Z" },
  { id: "prod4", name: "Salgadinho Ruffles", price: 8, created_at: "2026-01-01T00:00:00Z" },
  { id: "prod5", name: "Chocolate ao leite", price: 7, created_at: "2026-01-01T00:00:00Z" },
  { id: "prod6", name: "Biscoito recheado", price: 5, created_at: "2026-01-01T00:00:00Z" },
];

function log(
  id: string,
  personId: string,
  productId: string,
  day: string
): ConsumptionLog {
  const product = MOCK_PRODUCTS.find((p) => p.id === productId)!;
  return {
    id,
    person_id: personId,
    product_id: product.id,
    product_name: product.name,
    price: product.price,
    created_at: `2026-07-${day}T12:00:00Z`,
  };
}

// Histórico de exemplo para a tela de resumo mensal (mês corrente: julho/2026).
export const MOCK_LOGS: ConsumptionLog[] = [
  log("l1", "p1", "prod1", "03"),
  log("l2", "p1", "prod4", "03"),
  log("l3", "p1", "prod1", "10"),
  log("l4", "p1", "prod5", "15"),
  log("l5", "p2", "prod2", "05"),
  log("l6", "p2", "prod2", "12"),
  log("l7", "p2", "prod6", "12"),
  log("l8", "p2", "prod3", "20"),
  log("l9", "p3", "prod5", "07"),
  log("l10", "p3", "prod1", "18"),
  log("l11", "p4", "prod4", "09"),
  log("l12", "p4", "prod4", "22"),
  log("l13", "p4", "prod2", "22"),
  log("l14", "p6", "prod3", "14"),
];
