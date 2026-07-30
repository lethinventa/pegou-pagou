"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Plus, Search, X } from "lucide-react";
import { createProduct } from "@/lib/actions/products";
import { searchOpenFoodFacts } from "@/lib/search-products";
import type { OpenFoodFactsResult } from "@/lib/types";

const SEARCH_DEBOUNCE_MS = 400;

type Mode = "search" | "manual";

export function ProductCreateForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<OpenFoodFactsResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<OpenFoodFactsResult | null>(null);

  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState("");
  const [mainImage, setMainImage] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== "search" || selected || !query.trim()) return;

    // Liga o loading antes do fetch assíncrono (debounced) disparar — sincroniza
    // a UI com uma busca em andamento, não é estado derivado calculável sem setState.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSearching(true);
    const timer = setTimeout(async () => {
      const found = await searchOpenFoodFacts(query.trim());
      setResults(found);
      setSearching(false);
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query, mode, selected]);

  function pickSearchResult(result: OpenFoodFactsResult) {
    setSelected(result);
    setName(result.name);
    setPrice("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    const parsedPrice = Number(price.replace(",", "."));
    if (!trimmedName || Number.isNaN(parsedPrice) || parsedPrice < 0) return;

    setSaving(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("name", trimmedName);
      formData.set("price", String(parsedPrice));
      if (category.trim()) formData.set("category", category.trim());
      if (selected?.brand) formData.set("brand", selected.brand);
      if (selected?.quantity) formData.set("quantity", selected.quantity);
      if (selected?.imageUrl) formData.set("imageUrl", selected.imageUrl);
      if (selected?.code) formData.set("externalId", selected.code);
      if (mainImage) formData.set("mainImageFile", mainImage);

      const created = await createProduct(formData);
      if (created?.id) {
        router.push(`/produtos/${created.id}`);
      } else {
        router.push("/produtos");
      }
    } catch {
      setError("Não foi possível salvar o produto. Verifique a conexão com o Supabase e tente de novo.");
      setSaving(false);
    }
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="flex gap-1 rounded-md border border-border bg-surface p-1">
        <button
          type="button"
          onClick={() => setMode("search")}
          className={`flex-1 rounded px-3 py-1.5 text-[13px] font-medium transition-colors duration-[120ms] ${
            mode === "search" ? "bg-surface-2 text-fg" : "text-fg-subtle hover:text-fg"
          }`}
        >
          Buscar no Open Food Facts
        </button>
        <button
          type="button"
          onClick={() => setMode("manual")}
          className={`flex-1 rounded px-3 py-1.5 text-[13px] font-medium transition-colors duration-[120ms] ${
            mode === "manual" ? "bg-surface-2 text-fg" : "text-fg-subtle hover:text-fg"
          }`}
        >
          Cadastro manual
        </button>
      </div>

      {mode === "search" && !selected && (
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="relative">
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
              className="h-9 w-full rounded-md border border-border bg-surface-2 pl-8 pr-3 text-[13px] text-fg placeholder:text-fg-subtle outline-none transition-colors duration-[120ms] focus:border-highlight"
            />
          </div>

          {searching && <p className="mt-2 text-[12px] text-fg-subtle">Buscando...</p>}

          {!searching && query.trim() && results.length > 0 && (
            <div className="mt-2 max-h-64 divide-y divide-border overflow-y-auto rounded-md border border-border">
              {results.map((result) => (
                <button
                  key={result.code}
                  onClick={() => pickSearchResult(result)}
                  className="flex w-full items-center gap-2.5 p-2 text-left transition-colors duration-[120ms] hover:bg-surface-2"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border-strong bg-surface-2">
                    {result.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- imagem externa (Open Food Facts)
                      <img src={result.thumbnailUrl} alt="" className="h-full w-full object-cover" />
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
        </div>
      )}

      {(mode === "manual" || selected) && (
        <form onSubmit={handleSubmit} className="rounded-lg border border-border bg-surface p-4">
          {selected && (
            <div className="mb-4 flex items-start gap-3 rounded-md border border-border bg-surface-2 p-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border-strong bg-surface">
                {selected.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={selected.imageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-[12px] font-semibold text-fg-subtle">
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
                type="button"
                onClick={() => {
                  setSelected(null);
                  setName("");
                }}
                className="text-[12px] font-medium text-fg-subtle hover:text-fg"
              >
                Trocar
              </button>
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-[12px] font-medium text-fg-muted">Nome</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="h-9 w-full rounded-md border border-border bg-surface-2 px-3 text-[13px] text-fg outline-none transition-colors duration-[120ms] focus:border-highlight"
              />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="mb-1 block text-[12px] font-medium text-fg-muted">Preço</label>
                <input
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="0,00"
                  inputMode="decimal"
                  required
                  className="h-9 w-full rounded-md border border-border bg-surface-2 px-3 text-[13px] text-fg placeholder:text-fg-subtle outline-none transition-colors duration-[120ms] focus:border-highlight"
                />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-[12px] font-medium text-fg-muted">Categoria</label>
                <input
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="Ex.: Bebidas, Salgados..."
                  list="categorias-sugeridas"
                  className="h-9 w-full rounded-md border border-border bg-surface-2 px-3 text-[13px] text-fg placeholder:text-fg-subtle outline-none transition-colors duration-[120ms] focus:border-highlight"
                />
                <datalist id="categorias-sugeridas">
                  <option value="Bebidas" />
                  <option value="Salgados" />
                  <option value="Doces" />
                  <option value="Outros" />
                </datalist>
              </div>
            </div>

            {mode === "manual" && !selected && (
              <div>
                <label className="mb-1 block text-[12px] font-medium text-fg-muted">
                  Imagem principal (opcional)
                </label>
                <label className="flex h-9 w-fit cursor-pointer items-center gap-1.5 rounded-md border border-border bg-surface-2 px-3 text-[13px] text-fg-muted transition-colors duration-[120ms] hover:text-fg">
                  <ImagePlus size={14} strokeWidth={1.5} />
                  {mainImage ? mainImage.name : "Selecionar arquivo"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => setMainImage(e.target.files?.[0] ?? null)}
                  />
                </label>
              </div>
            )}
          </div>

          {error && (
            <p className="mt-3 rounded-md border border-danger/30 bg-danger-dim px-3 py-2 text-[12px] text-danger">
              {error}
            </p>
          )}

          <div className="mt-4 flex items-center gap-2">
            <button
              type="submit"
              disabled={saving}
              className="flex h-9 items-center gap-1.5 rounded-md bg-fg px-3.5 text-[13px] font-medium text-black transition-colors duration-[120ms] hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus size={14} strokeWidth={1.5} />
              {saving ? "Salvando..." : "Salvar produto"}
            </button>
            <button
              type="button"
              onClick={() => router.push("/produtos")}
              className="flex h-9 items-center gap-1 rounded-md px-3 text-[13px] font-medium text-fg-subtle hover:text-fg"
            >
              <X size={14} strokeWidth={1.5} />
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
