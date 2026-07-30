import "server-only";
import { NextResponse } from "next/server";

const CONFIDENCE_VALUES = new Set(["alta", "media", "baixa"]);

type ProductInput = { id: string; name: string; price: number };

function buildPrompt(products: ProductInput[]): string {
  const list = products
    .map((p) => `- id: ${p.id} | nome: ${p.name} | preço: R$ ${p.price.toFixed(2)}`)
    .join("\n");

  return `Você identifica qual produto de uma lista fixa aparece em uma foto tirada em um escritório
(formato "pegou pagou", auto-atendimento de salgadinhos/bebidas/doces).

Lista de produtos possíveis:
${list}

Responda APENAS um JSON, sem markdown, sem texto antes ou depois:
{"product_id": "<id mais provável ou null>", "confidence": "alta" | "media" | "baixa"}

Se não houver produto claro e centralizado na foto, ou dois produtos parecidos sem certeza,
retorne confidence "baixa".`;
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL ?? "gemini-3.5-flash";

  if (!apiKey) {
    return NextResponse.json({ error: "GEMINI_API_KEY não configurada" }, { status: 500 });
  }

  const body = await request.json().catch(() => null);
  const image = body?.image;
  const products = body?.products as ProductInput[] | undefined;

  if (typeof image !== "string" || !image || !Array.isArray(products)) {
    return NextResponse.json({ error: "payload inválido" }, { status: 400 });
  }

  let geminiResponse: Response;
  try {
    geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: buildPrompt(products) },
                { inline_data: { mime_type: "image/jpeg", data: image } },
              ],
            },
          ],
          generationConfig: { responseMimeType: "application/json" },
        }),
      }
    );
  } catch (err) {
    // Falha de rede com a Gemini não deve derrubar o kiosk — trata como baixa confiança.
    console.error("[identify-product] falha de rede chamando Gemini:", err);
    return NextResponse.json({ product_id: null, confidence: "baixa" });
  }

  if (!geminiResponse.ok) {
    const errorBody = await geminiResponse.text().catch(() => "");
    console.error(
      `[identify-product] Gemini respondeu ${geminiResponse.status} (modelo: ${model}):`,
      errorBody
    );
    return NextResponse.json({ product_id: null, confidence: "baixa" });
  }

  const data = await geminiResponse.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

  let parsed: { product_id?: string | null; confidence?: string } | null = null;
  try {
    parsed = typeof text === "string" ? JSON.parse(text) : null;
  } catch (err) {
    console.error("[identify-product] resposta da Gemini não é JSON válido:", text, err);
    parsed = null;
  }

  const confidence = parsed?.confidence;
  if (!parsed || !confidence || !CONFIDENCE_VALUES.has(confidence)) {
    console.error("[identify-product] resposta sem confidence válida:", parsed ?? data);
    return NextResponse.json({ product_id: null, confidence: "baixa" });
  }

  console.log(`[identify-product] confidence=${confidence} product_id=${parsed.product_id ?? "null"}`);

  // Nunca confia cegamente no id devolvido pela IA — só aceita se estiver na lista enviada.
  const productId =
    parsed.product_id && products.some((p) => p.id === parsed.product_id)
      ? parsed.product_id
      : null;

  return NextResponse.json({ product_id: productId, confidence });
}
