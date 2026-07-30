import "server-only";
import { NextResponse } from "next/server";

// Proxy pro Open Food Facts — API pública, sem key, mas exige um User-Agent
// descritivo (política deles). Fica no servidor pra centralizar isso e evitar
// depender de CORS deles no client.
const USER_AGENT = "PegouPagou/1.0 (kiosk interno de escritorio; +https://pegou-pagou.vercel.app)";

type OffProduct = {
  code?: string;
  product_name?: string;
  brands?: string;
  quantity?: string;
  image_url?: string;
  image_front_small_url?: string;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();

  if (!query) {
    return NextResponse.json({ results: [] });
  }

  const url = new URL("https://world.openfoodfacts.org/cgi/search.pl");
  url.searchParams.set("search_terms", query);
  url.searchParams.set("json", "1");
  url.searchParams.set("page_size", "20");
  url.searchParams.set(
    "fields",
    "code,product_name,brands,quantity,image_url,image_front_small_url"
  );

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
    });
  } catch {
    return NextResponse.json({ results: [], error: "Falha ao contatar Open Food Facts" }, { status: 502 });
  }

  if (!response.ok) {
    return NextResponse.json({ results: [], error: "Open Food Facts indisponível" }, { status: 502 });
  }

  const data = await response.json().catch(() => null);
  const products: OffProduct[] = Array.isArray(data?.products) ? data.products : [];

  const results = products
    .filter((p) => p.code && p.product_name)
    .map((p) => ({
      code: p.code as string,
      name: p.product_name as string,
      brand: p.brands?.split(",")[0]?.trim() || null,
      quantity: p.quantity || null,
      imageUrl: p.image_url || null,
      thumbnailUrl: p.image_front_small_url || p.image_url || null,
    }));

  return NextResponse.json({ results });
}
