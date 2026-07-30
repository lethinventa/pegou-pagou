import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ProductCreateForm } from "@/components/product-create-form";

export default function NovoProdutoPage() {
  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
      <Link
        href="/produtos"
        className="flex items-center gap-1.5 text-[13px] font-medium text-fg-muted hover:text-fg"
      >
        <ArrowLeft size={14} strokeWidth={1.5} />
        Produtos
      </Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-fg">Novo produto</h1>
      <p className="mt-1.5 text-[13px] text-fg-muted">
        Busque no Open Food Facts pra preencher automaticamente, ou cadastre manualmente. Depois
        de salvar, você adiciona as fotos de referência.
      </p>
      <ProductCreateForm />
    </div>
  );
}
