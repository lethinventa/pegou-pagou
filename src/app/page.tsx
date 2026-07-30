import { getPeople } from "@/lib/actions/people";
import { getProducts } from "@/lib/actions/products";
import { ScanScreen } from "@/components/scan-screen";

// Sempre busca gente/produtos frescos do Supabase — nunca cachear/pré-renderizar.
export const dynamic = "force-dynamic";

export default async function Home() {
  const [people, products] = await Promise.all([getPeople(), getProducts()]);

  return <ScanScreen people={people} products={products} />;
}
