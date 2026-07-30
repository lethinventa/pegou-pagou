"use client";

import { useState } from "react";
import { MOCK_PEOPLE, MOCK_PRODUCTS } from "@/lib/mock-data";
import { formatBRL } from "@/lib/format";
import type { Person, Product } from "@/lib/types";

export default function ConfigPage() {
  const [people, setPeople] = useState<Person[]>(MOCK_PEOPLE);
  const [products, setProducts] = useState<Product[]>(MOCK_PRODUCTS);

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
      <h1 className="text-2xl font-semibold">Configurações</h1>
      <p className="mt-1 text-zinc-500">
        Cadastro de pessoas e produtos. Dados de exemplo por enquanto — ainda não conectado ao
        banco.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-2">
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
    <section className="rounded-2xl border border-zinc-200 bg-white p-5">
      <h2 className="text-lg font-semibold">Pessoas</h2>
      <form onSubmit={addPerson} className="mt-4 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome"
          className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 outline-none focus:border-indigo-500"
        />
        <button
          type="submit"
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Adicionar
        </button>
      </form>
      <ul className="mt-4 divide-y divide-zinc-100">
        {people.map((person) => (
          <li key={person.id} className="flex items-center justify-between py-2">
            <span>{person.name}</span>
            <button
              onClick={() => removePerson(person.id)}
              className="text-sm font-medium text-red-500 hover:text-red-600"
            >
              Remover
            </button>
          </li>
        ))}
        {people.length === 0 && (
          <p className="py-4 text-center text-sm text-zinc-400">Nenhuma pessoa cadastrada.</p>
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
    <section className="rounded-2xl border border-zinc-200 bg-white p-5">
      <h2 className="text-lg font-semibold">Produtos</h2>
      <form onSubmit={addProduct} className="mt-4 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome"
          className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 outline-none focus:border-indigo-500"
        />
        <input
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="Preço"
          inputMode="decimal"
          className="w-24 rounded-lg border border-zinc-300 px-3 py-2 outline-none focus:border-indigo-500"
        />
        <button
          type="submit"
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Adicionar
        </button>
      </form>
      <ul className="mt-4 divide-y divide-zinc-100">
        {products.map((product) => (
          <li key={product.id} className="flex items-center justify-between py-2">
            <span>{product.name}</span>
            <div className="flex items-center gap-3">
              <span className="text-zinc-500">{formatBRL(product.price)}</span>
              <button
                onClick={() => removeProduct(product.id)}
                className="text-sm font-medium text-red-500 hover:text-red-600"
              >
                Remover
              </button>
            </div>
          </li>
        ))}
        {products.length === 0 && (
          <p className="py-4 text-center text-sm text-zinc-400">Nenhum produto cadastrado.</p>
        )}
      </ul>
    </section>
  );
}
