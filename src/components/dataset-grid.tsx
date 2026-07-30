"use client";

import { useState } from "react";
import { Link2, Trash2 } from "lucide-react";
import { deleteReferenceImage, linkOrphanImage } from "@/lib/actions/products";
import { formatDate } from "@/lib/format";
import type { Product, ReferenceImage } from "@/lib/types";

export function DatasetGrid({
  images,
  products,
}: {
  images: ReferenceImage[];
  products: Product[];
}) {
  const [pending, setPending] = useState<string | null>(null);
  const [linking, setLinking] = useState<string | null>(null);

  async function handleLink(imageId: string, productId: string) {
    if (!productId) return;
    setPending(imageId);
    const formData = new FormData();
    formData.set("id", imageId);
    formData.set("productId", productId);
    await linkOrphanImage(formData);
    setPending(null);
    setLinking(null);
  }

  async function handleDelete(imageId: string) {
    setPending(imageId);
    const formData = new FormData();
    formData.set("id", imageId);
    await deleteReferenceImage(formData);
    setPending(null);
  }

  if (images.length === 0) {
    return (
      <p className="mt-6 rounded-lg border border-border bg-surface px-4 py-10 text-center text-[13px] text-fg-subtle">
        Nenhuma imagem pendente de revisão no momento.
      </p>
    );
  }

  return (
    <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
      {images.map((image) => (
        <div
          key={image.id}
          className="overflow-hidden rounded-lg border border-border bg-surface"
        >
          <div className="aspect-square bg-surface-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- imagem do Supabase Storage */}
            <img src={image.image_path} alt="" className="h-full w-full object-cover" />
          </div>
          <div className="p-2">
            <p className="text-[10px] text-fg-subtle">
              {image.origem === "camera" ? "Câmera" : "Upload"} · {formatDate(image.created_at)}
            </p>
            {linking === image.id ? (
              <div className="mt-1.5 flex items-center gap-1">
                <select
                  autoFocus
                  onChange={(e) => handleLink(image.id, e.target.value)}
                  disabled={pending === image.id}
                  defaultValue=""
                  className="h-7 w-full rounded border border-border bg-surface-2 px-1.5 text-[11px] text-fg outline-none focus:border-highlight"
                >
                  <option value="" disabled>
                    Escolher produto...
                  </option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="mt-1.5 flex items-center gap-1">
                <button
                  onClick={() => setLinking(image.id)}
                  disabled={pending === image.id}
                  className="flex h-7 flex-1 items-center justify-center gap-1 rounded border border-border text-[11px] font-medium text-fg-muted hover:text-fg disabled:opacity-50"
                >
                  <Link2 size={11} strokeWidth={1.5} />
                  Vincular
                </button>
                <button
                  onClick={() => handleDelete(image.id)}
                  disabled={pending === image.id}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-fg-subtle hover:bg-danger-dim hover:text-danger disabled:opacity-50"
                  aria-label="Excluir imagem"
                >
                  <Trash2 size={12} strokeWidth={1.5} />
                </button>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
