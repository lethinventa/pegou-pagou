"use client";

import { useEffect, useState } from "react";
import { Plus, Search, Trash2, X } from "lucide-react";
import { createProduct, deleteProduct } from "@/lib/actions/products";
import { searchOpenFoodFacts } from "@/lib/search-products";
import { formatBRL } from "@/lib/format";
import type { OpenFoodFactsResult, Product } from "@/lib/types";

const SEARCH_DEBOUNCE_MS = 400;

type AddMode = "closed" | "search" | "manual";

export function ProductsSection({ products }: { products: Product[] }) {
  const [addMode, setAddMode] = useState<AddMode>("closed");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<OpenFoodFactsResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<OpenFoodFactsResult | null>(null);
  const [price, setPrice] = useState("");
  const [manualName, setManualName] = useState("");
  const [manualPrice, setManualPrice] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (addMode !== "search" || selected || !query.trim()) return;

    // Liga o indicador de loading antes do fetch assíncrono (debounced) disparar —
    // é side effect de verdade (sincroniza UI com uma busca em andamento), não
    // estado derivado que dê pra calcular sem o setState.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSearching(true);
    const timer = setTimeout(async () => {
      const found = await searchOpenFoodFacts(query.trim());
      setResults(found);
      setSearching(false);
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query, addMode, selected]);

  function resetAddFlow() {
    setAddMode("closed");
    setQuery("");
    setResults([]);
    setSelected(null);
    setPrice("");
    setManualName("");
    setManualPrice("");
  }

  async function confirmCatalogProduct() {
    if (!selected) return;
    const parsedPrice = Number(price.replace(",", "."));
    if (Number.isNaN(parsedPrice) || parsedPrice < 0) return;

    setSaving(true);
    const formData = new FormData();
    formData.set("name", selected.name);
    formData.set("price", String(parsedPrice));
    if (selected.brand) formData.set("brand", selected.brand);
    if (selected.quantity) formData.set("quantity", selected.quantity);
    if (selected.imageUrl) formData.set("imageUrl", selected.imageUrl);
    formData.set("externalId", selected.code);

    await createProduct(formData);
    setSaving(false);
    resetAddFlow();
  }

  async function submitManualProduct(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = manualName.trim();
    const parsedPrice = Number(manualPrice.replace(",", "."));
    if (!trimmedName || Number.isNaN(parsedPrice) || parsedPrice < 0) return;

    setSaving(true);
    const formData = new FormData();
    formData.set("name", trimmedName);
    formData.set("price", String(parsedPrice));
    await createProduct(formData);
    setSaving(false);
    resetAddFlow();
  }

  async function handleDelete(id: string) {
    const formData = new FormData();
    formData.set("id", id);
    await deleteProduct(formData);
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[13px] font-semibold text-fg">Produtos</h2>
        {addMode === "closed" && (
          <button
            onClick={() => setAddMode("search")}
            className="flex h-8 items-center gap-1.5 rounded-md bg-fg px-3 text-[12px] font-medium text-black transition-colors duration-[120ms] hover:bg-white"
          >
            <Plus size={13} strokeWidth={1.5} />
            Adicionar
          </button>
        )}
      </div>

      {addMode === "search" && !selected && (
        <div className="mt-3 rounded-lg border border-border bg-surface-2 p-3">
          <div className="flex items-center justify-between">
            <p className="text-[12px] font-medium text-fg-muted">Buscar no Open Food Facts</p>
            <button
              onClick={resetAddFlow}
              className="flex h-6 w-6 items-center justify-center rounded-md text-fg-subtle hover:text-fg"
              aria-label="Cancelar"
            >
              <X size={13} strokeWidth={1.5} />
            </button>
          </div>
          <div className="relative mt-2">
            <Search
              size={13}
              strokeWidth={1.5}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle"
            />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Nome ou marca do produto..."
              className="h-9 w-full rounded-md border border-border bg-surface pl-8 pr-3 text-[13px] text-fg placeholder:text-fg-subtle outline-none transition-colors duration-[120ms] focus:border-highlight"
            />
          </div>

          {searching && <p className="mt-2 text-[12px] text-fg-subtle">Buscando...</p>}

          {!searching && query.trim() && results.length > 0 && (
            <div className="mt-2 max-h-64 divide-y divide-border overflow-y-auto rounded-md border border-border bg-surface">
              {results.map((result) => (
                <button
                  key={result.code}
                  onClick={() => setSelected(result)}
                  className="flex w-full items-center gap-2.5 p-2 text-left transition-colors duration-[120ms] hover:bg-surface-2"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border-strong bg-surface-2">
                    {result.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- imagem externa (Open Food Facts), não vale a pena otimizar via next/image
                      <img
                        src={result.thumbnailUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="text-[11px] font-semibold text-fg-subtle">
                        {result.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-medium text-fg">{result.name}</p>
                    <p className="truncate text-[11px] text-fg-subtle">
                      {[result.brand, result.quantity].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {!searching && query.trim() && results.length === 0 && (
            <p className="mt-2 text-[12px] text-fg-subtle">Nenhum resultado encontrado.</p>
          )}

          <button
            onClick={() => setAddMode("manual")}
            className="mt-2 text-[12px] font-medium text-highlight hover:underline"
          >
            Não encontrou? Cadastrar manualmente
          </button>
        </div>
      )}

      {addMode === "search" && selected && (
        <div className="mt-3 rounded-lg border border-border bg-surface-2 p-3">
          <div className="flex items-start gap-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border-strong bg-surface">
              {selected.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={selected.imageUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="text-[13px] font-semibold text-fg-subtle">
                  {selected.name.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-fg">{selected.name}</p>
              <p className="truncate text-[12px] text-fg-subtle">
                {[selected.brand, selected.quantity].filter(Boolean).join(" · ") || "—"}
              </p>
            </div>
            <button
              onClick={() => setSelected(null)}
              className="text-[12px] font-medium text-fg-subtle hover:text-fg"
            >
              Trocar
            </button>
          </div>
          <div className="mt-3 flex gap-2">
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="Preço"
              inputMode="decimal"
              autoFocus
              className="h-9 flex-1 rounded-md border border-border bg-surface px-3 text-[13px] text-fg placeholder:text-fg-subtle outline-none transition-colors duration-[120ms] focus:border-highlight"
            />
            <button
              onClick={confirmCatalogProduct}
              disabled={saving || !price.trim()}
              className="flex h-9 items-center gap-1.5 rounded-md bg-fg px-3.5 text-[13px] font-medium text-black transition-colors duration-[120ms] hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus size={14} strokeWidth={1.5} />
              Adicionar
            </button>
          </div>
        </div>
      )}

      {addMode === "manual" && (
        <form onSubmit={submitManualProduct} className="mt-3 flex gap-2">
          <input
            value={manualName}
            onChange={(e) => setManualName(e.target.value)}
            placeholder="Nome"
            autoFocus
            required
            className="h-9 flex-1 rounded-md border border-border bg-surface-2 px-3 text-[13px] text-fg placeholder:text-fg-subtle outline-none transition-colors duration-[120ms] focus:border-highlight"
          />
          <input
            value={manualPrice}
            onChange={(e) => setManualPrice(e.target.value)}
            placeholder="Preço"
            inputMode="decimal"
            required
            className="h-9 w-20 rounded-md border border-border bg-surface-2 px-3 text-[13px] text-fg placeholder:text-fg-subtle outline-none transition-colors duration-[120ms] focus:border-highlight"
          />
          <button
            type="submit"
            disabled={saving}
            className="flex h-9 items-center gap-1.5 rounded-md bg-fg px-3.5 text-[13px] font-medium text-black transition-colors duration-[120ms] hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus size={14} strokeWidth={1.5} />
            Adicionar
          </button>
          <button
            type="button"
            onClick={resetAddFlow}
            className="flex h-9 w-9 items-center justify-center rounded-md text-fg-subtle hover:text-fg"
            aria-label="Cancelar"
          >
            <X size={14} strokeWidth={1.5} />
          </button>
        </form>
      )}

      <ul className="mt-3 divide-y divide-border">
        {products.map((product) => (
          <li key={product.id} className="flex items-center gap-2.5 py-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border-strong bg-surface-2">
              {product.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={product.image_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="text-[11px] font-semibold text-fg-subtle">
                  {product.name.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] text-fg">{product.name}</p>
              {product.brand && (
                <p className="truncate text-[11px] text-fg-subtle">{product.brand}</p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[12px] text-fg-muted">{formatBRL(product.price)}</span>
              <button
                onClick={() => handleDelete(product.id)}
                className="flex h-7 w-7 items-center justify-center rounded-md text-fg-subtle transition-colors duration-[120ms] hover:bg-danger-dim hover:text-danger"
                aria-label={`Remover ${product.name}`}
              >
                <Trash2 size={14} strokeWidth={1.5} />
              </button>
            </div>
          </li>
        ))}
        {products.length === 0 && (
          <p className="py-6 text-center text-[12px] text-fg-subtle">Nenhum produto cadastrado.</p>
        )}
      </ul>
    </section>
  );
}
