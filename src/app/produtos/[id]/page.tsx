import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { getProduct, getReferenceImages } from "@/lib/actions/products";
import { formatBRL, formatDate } from "@/lib/format";
import { ReferenceImageManager } from "@/components/reference-image-manager";

export const dynamic = "force-dynamic";

export default async function ProdutoDetalhesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [product, images] = await Promise.all([getProduct(id), getReferenceImages(id)]);
  if (!product) notFound();

  const totalRecognitions = product.correct_recognitions + product.incorrect_recognitions;
  const accuracyRate =
    totalRecognitions > 0
      ? `${Math.round((product.correct_recognitions / totalRecognitions) * 100)}%`
      : "—";

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-6 py-12">
      <Link
        href="/produtos"
        className="flex items-center gap-1.5 text-[13px] font-medium text-fg-muted hover:text-fg"
      >
        <ArrowLeft size={14} strokeWidth={1.5} />
        Produtos
      </Link>

      <div className="mt-4 flex items-start justify-between gap-4 border-b border-border pb-6">
        <div className="flex items-start gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border-strong bg-surface-2">
            {product.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- imagem externa (Open Food Facts ou Supabase Storage)
              <img src={product.image_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="text-[18px] font-semibold text-fg-subtle">
                {product.name.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-fg">{product.name}</h1>
            <p className="mt-1 text-[13px] text-fg-muted">
              {formatBRL(product.price)}
              {product.category && <> · {product.category}</>}
            </p>
            <p className="mt-1 text-[12px] text-fg-subtle">
              Criado em {formatDate(product.created_at)} · Atualizado em{" "}
              {formatDate(product.updated_at)}
            </p>
          </div>
        </div>
        <Link
          href={`/produtos/${id}/editar`}
          className="flex h-9 items-center gap-1.5 rounded-md border border-border px-3.5 text-[13px] font-medium text-fg-muted transition-colors duration-[120ms] hover:text-fg"
        >
          <Pencil size={14} strokeWidth={1.5} />
          Editar
        </Link>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-3">
        <StatCard label="Referências" value={String(images.length)} />
        <StatCard label="Reconhecimentos" value={String(totalRecognitions)} />
        <StatCard label="Taxa de acerto" value={accuracyRate} />
      </div>

      <div className="mt-6">
        <h2 className="text-[13px] font-semibold text-fg">Imagens de referência</h2>
        <p className="mt-1 text-[12px] text-fg-subtle">
          Usadas como base pro reconhecimento visual local. Quanto mais fotos reais, melhor.
        </p>
        <div className="mt-3">
          <ReferenceImageManager productId={id} images={images} mainImageUrl={product.image_url} />
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="text-[11px] font-medium uppercase tracking-wide text-fg-subtle">{label}</p>
      <p className="mt-1 text-xl font-semibold text-fg">{value}</p>
    </div>
  );
}
