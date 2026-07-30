import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getProduct, updateProduct } from "@/lib/actions/products";

export const dynamic = "force-dynamic";

export default async function EditarProdutoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const product = await getProduct(id);
  if (!product) notFound();

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
      <Link
        href={`/produtos/${id}`}
        className="flex items-center gap-1.5 text-[13px] font-medium text-fg-muted hover:text-fg"
      >
        <ArrowLeft size={14} strokeWidth={1.5} />
        {product.name}
      </Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-fg">Editar produto</h1>

      <form action={updateProduct} className="mt-6 space-y-3 rounded-lg border border-border bg-surface p-4">
        <input type="hidden" name="id" value={product.id} />
        <div>
          <label className="mb-1 block text-[12px] font-medium text-fg-muted">Nome</label>
          <input
            name="name"
            defaultValue={product.name}
            required
            className="h-9 w-full rounded-md border border-border bg-surface-2 px-3 text-[13px] text-fg outline-none transition-colors duration-[120ms] focus:border-highlight"
          />
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="mb-1 block text-[12px] font-medium text-fg-muted">Preço</label>
            <input
              name="price"
              defaultValue={product.price}
              inputMode="decimal"
              required
              className="h-9 w-full rounded-md border border-border bg-surface-2 px-3 text-[13px] text-fg outline-none transition-colors duration-[120ms] focus:border-highlight"
            />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-[12px] font-medium text-fg-muted">Categoria</label>
            <input
              name="category"
              defaultValue={product.category ?? ""}
              list="categorias-sugeridas"
              className="h-9 w-full rounded-md border border-border bg-surface-2 px-3 text-[13px] text-fg outline-none transition-colors duration-[120ms] focus:border-highlight"
            />
            <datalist id="categorias-sugeridas">
              <option value="Bebidas" />
              <option value="Salgados" />
              <option value="Doces" />
              <option value="Outros" />
            </datalist>
          </div>
        </div>
        <p className="text-[12px] text-fg-subtle">
          A imagem principal é trocada pela galeria de referências, na tela de detalhes.
        </p>
        <div className="flex items-center gap-2 pt-1">
          <button
            type="submit"
            className="flex h-9 items-center rounded-md bg-fg px-3.5 text-[13px] font-medium text-black transition-colors duration-[120ms] hover:bg-white"
          >
            Salvar alterações
          </button>
          <Link
            href={`/produtos/${id}`}
            className="flex h-9 items-center rounded-md px-3 text-[13px] font-medium text-fg-subtle hover:text-fg"
          >
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  );
}
