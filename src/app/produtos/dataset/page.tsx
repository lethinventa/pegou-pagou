import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getOrphanImages, getProducts } from "@/lib/actions/products";
import { DatasetGrid } from "@/components/dataset-grid";

export const dynamic = "force-dynamic";

export default async function DatasetPage() {
  const [images, products] = await Promise.all([getOrphanImages(), getProducts()]);

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-6 py-12">
      <Link
        href="/produtos"
        className="flex items-center gap-1.5 text-[13px] font-medium text-fg-muted hover:text-fg"
      >
        <ArrowLeft size={14} strokeWidth={1.5} />
        Produtos
      </Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-fg">Dataset</h1>
      <p className="mt-1.5 text-[13px] text-fg-muted">
        Imagens capturadas pelo sistema que ainda não foram vinculadas a nenhum produto. Revise e
        associe ao produto certo — elas viram novas referências pro reconhecimento.
      </p>
      <DatasetGrid images={images} products={products} />
    </div>
  );
}
