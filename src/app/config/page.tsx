"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { MOCK_PEOPLE, MOCK_PRODUCTS } from "@/lib/mock-data";
import { formatBRL } from "@/lib/format";
import type { Person, Product } from "@/lib/types";

export default function ConfigPage() {
  const [people, setPeople] = useState<Person[]>(MOCK_PEOPLE);
  const [products, setProducts] = useState<Product[]>(MOCK_PRODUCTS);

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-6 py-12">
      <div className="border-b border-border pb-6">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-fg-subtle">
          Cadastro
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-fg">Configurações</h1>
        <p className="mt-1.5 text-[13px] text-fg-muted">
          Dados de exemplo por enquanto — ainda não conectado ao banco.
        </p>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <PeopleSection people={people} setPeople={setPeople} />
        <ProductsSection products={products} setProducts={setProducts} />
      </div>
    </div>
  );
}

function PeopleSection({
  people,
  setPeople,
}: {
  people: Person[];
  setPeople: React.Dispatch<React.SetStateAction<Person[]>>;
}) {
  const [name, setName] = useState("");

  function addPerson(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setPeople((prev) => [
      ...prev,
      { id: crypto.randomUUID(), name: trimmed, created_at: new Date().toISOString() },
    ]);
    setName("");
  }

  function removePerson(id: string) {
    setPeople((prev) => prev.filter((p) => p.id !== id));
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <h2 className="text-[13px] font-semibold text-fg">Pessoas</h2>
      <form onSubmit={addPerson} className="mt-3 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome"
          className="h-9 flex-1 rounded-md border border-border bg-surface-2 px-3 text-[13px] text-fg placeholder:text-fg-subtle outline-none transition-colors duration-[120ms] focus:border-highlight"
        />
        <button
          type="submit"
          className="flex h-9 items-center gap-1.5 rounded-md bg-fg px-3.5 text-[13px] font-medium text-black transition-colors duration-[120ms] hover:bg-white"
        >
          <Plus size={14} strokeWidth={1.5} />
          Adicionar
        </button>
      </form>
      <ul className="mt-3 divide-y divide-border">
        {people.map((person) => (
          <li key={person.id} className="flex items-center justify-between py-2.5">
            <span className="text-[13px] text-fg">{person.name}</span>
            <button
              onClick={() => removePerson(person.id)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-fg-subtle transition-colors duration-[120ms] hover:bg-danger-dim hover:text-danger"
              aria-label={`Remover ${person.name}`}
            >
              <Trash2 size={14} strokeWidth={1.5} />
            </button>
          </li>
        ))}
        {people.length === 0 && (
          <p className="py-6 text-center text-[12px] text-fg-subtle">
            Nenhuma pessoa cadastrada.
          </p>
        )}
      </ul>
    </section>
  );
}

function ProductsSection({
  products,
  setProducts,
}: {
  products: Product[];
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
}) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");

  function addProduct(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    const parsedPrice = Number(price.replace(",", "."));
    if (!trimmedName || Number.isNaN(parsedPrice) || parsedPrice < 0) return;

    setProducts((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name: trimmedName,
        price: parsedPrice,
        created_at: new Date().toISOString(),
      },
    ]);
    setName("");
    setPrice("");
  }

  function removeProduct(id: string) {
    setProducts((prev) => prev.filter((p) => p.id !== id));
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <h2 className="text-[13px] font-semibold text-fg">Produtos</h2>
      <form onSubmit={addProduct} className="mt-3 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome"
          className="h-9 flex-1 rounded-md border border-border bg-surface-2 px-3 text-[13px] text-fg placeholder:text-fg-subtle outline-none transition-colors duration-[120ms] focus:border-highlight"
        />
        <input
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="Preço"
          inputMode="decimal"
          className="h-9 w-20 rounded-md border border-border bg-surface-2 px-3 text-[13px] text-fg placeholder:text-fg-subtle outline-none transition-colors duration-[120ms] focus:border-highlight"
        />
        <button
          type="submit"
          className="flex h-9 items-center gap-1.5 rounded-md bg-fg px-3.5 text-[13px] font-medium text-black transition-colors duration-[120ms] hover:bg-white"
        >
          <Plus size={14} strokeWidth={1.5} />
          Adicionar
        </button>
      </form>
      <ul className="mt-3 divide-y divide-border">
        {products.map((product) => (
          <li key={product.id} className="flex items-center justify-between py-2.5">
            <span className="text-[13px] text-fg">{product.name}</span>
            <div className="flex items-center gap-3">
              <span className="text-[12px] text-fg-muted">{formatBRL(product.price)}</span>
              <button
                onClick={() => removeProduct(product.id)}
                className="flex h-7 w-7 items-center justify-center rounded-md text-fg-subtle transition-colors duration-[120ms] hover:bg-danger-dim hover:text-danger"
                aria-label={`Remover ${product.name}`}
              >
                <Trash2 size={14} strokeWidth={1.5} />
              </button>
            </div>
          </li>
        ))}
        {products.length === 0 && (
          <p className="py-6 text-center text-[12px] text-fg-subtle">
            Nenhum produto cadastrado.
          </p>
        )}
      </ul>
    </section>
  );
}
