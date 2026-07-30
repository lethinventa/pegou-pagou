import Link from "next/link";
import { Eye, Package, Pencil, Plus, Trash2 } from "lucide-react";
import { deleteProduct, getProductsWithStats } from "@/lib/actions/products";
import { formatBRL, formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ProdutosPage() {
  const products = await getProductsWithStats();

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-12">
      <div className="flex items-end justify-between border-b border-border pb-6">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-fg-subtle">
            Catálogo
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-fg">Produtos</h1>
          <p className="mt-1.5 text-[13px] text-fg-muted">
            Cadastro, preços e imagens de referência usadas no reconhecimento.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/produtos/dataset"
            className="rounded-md px-3 py-2 text-[13px] font-medium text-fg-muted transition-colors duration-[120ms] hover:bg-surface hover:text-fg"
          >
            Dataset
          </Link>
          <Link
            href="/produtos/novo"
            className="flex h-9 items-center gap-1.5 rounded-md bg-fg px-3.5 text-[13px] font-medium text-black transition-colors duration-[120ms] hover:bg-white"
          >
            <Plus size={14} strokeWidth={1.5} />
            Novo produto
          </Link>
        </div>
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-border text-[11px] uppercase tracking-wide text-fg-subtle">
              <th className="px-4 py-3 font-medium">Produto</th>
              <th className="px-4 py-3 font-medium">Categoria</th>
              <th className="px-4 py-3 font-medium">Preço</th>
              <th className="px-4 py-3 font-medium">Referências</th>
              <th className="px-4 py-3 font-medium">Acertos</th>
              <th className="px-4 py-3 font-medium">Erros</th>
              <th className="px-4 py-3 font-medium">Criado em</th>
              <th className="px-4 py-3 font-medium text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {products.map((product) => (
              <tr key={product.id} className="transition-colors duration-[120ms] hover:bg-surface-2">
                <td className="px-4 py-3">
                  <Link href={`/produtos/${product.id}`} className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border-strong bg-surface-2">
                      {product.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element -- imagem vem de URL externa (Open Food Facts ou Supabase Storage)
                        <img
                          src={product.image_url}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="text-[11px] font-semibold text-fg-subtle">
                          {product.name.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <span className="font-medium text-fg hover:text-highlight">{product.name}</span>
                  </Link>
                </td>
                <td className="px-4 py-3 text-fg-muted">{product.category ?? "—"}</td>
                <td className="px-4 py-3 text-fg-muted">{formatBRL(product.price)}</td>
                <td className="px-4 py-3 text-fg-muted">{product.reference_count}</td>
                <td className="px-4 py-3 text-success">{product.correct_recognitions}</td>
                <td className="px-4 py-3 text-danger">{product.incorrect_recognitions}</td>
                <td className="px-4 py-3 text-fg-muted">{formatDate(product.created_at)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <Link
                      href={`/produtos/${product.id}`}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-fg-subtle transition-colors duration-[120ms] hover:bg-surface-3 hover:text-fg"
                      aria-label={`Detalhes de ${product.name}`}
                    >
                      <Eye size={14} strokeWidth={1.5} />
                    </Link>
                    <Link
                      href={`/produtos/${product.id}/editar`}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-fg-subtle transition-colors duration-[120ms] hover:bg-surface-3 hover:text-fg"
                      aria-label={`Editar ${product.name}`}
                    >
                      <Pencil size={14} strokeWidth={1.5} />
                    </Link>
                    <form action={deleteProduct}>
                      <input type="hidden" name="id" value={product.id} />
                      <button
                        type="submit"
                        className="flex h-7 w-7 items-center justify-center rounded-md text-fg-subtle transition-colors duration-[120ms] hover:bg-danger-dim hover:text-danger"
                        aria-label={`Excluir ${product.name}`}
                      >
                        <Trash2 size={14} strokeWidth={1.5} />
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {products.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <Package size={20} strokeWidth={1.5} className="text-fg-subtle" />
            <p className="text-[13px] text-fg-subtle">Nenhum produto cadastrado ainda.</p>
          </div>
        )}
      </div>
    </div>
  );
}
