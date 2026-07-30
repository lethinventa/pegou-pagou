import { Plus, Trash2 } from "lucide-react";
import { createPerson, deletePerson, getPeople } from "@/lib/actions/people";

// Cadastro precisa refletir o Supabase em tempo real — sem cache estático.
export const dynamic = "force-dynamic";

export default async function ConfigPage() {
  const people = await getPeople();

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
      <div className="border-b border-border pb-6">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-fg-subtle">
          Cadastro
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-fg">Configurações</h1>
        <p className="mt-1.5 text-[13px] text-fg-muted">
          Pessoas identificadas ao finalizar uma compra no kiosk.
        </p>
      </div>

      <section className="mt-6 rounded-lg border border-border bg-surface p-4">
        <h2 className="text-[13px] font-semibold text-fg">Pessoas</h2>
        <form action={createPerson} className="mt-3 flex gap-2">
          <input
            name="name"
            placeholder="Nome"
            required
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
              <form action={deletePerson}>
                <input type="hidden" name="id" value={person.id} />
                <button
                  type="submit"
                  className="flex h-7 w-7 items-center justify-center rounded-md text-fg-subtle transition-colors duration-[120ms] hover:bg-danger-dim hover:text-danger"
                  aria-label={`Remover ${person.name}`}
                >
                  <Trash2 size={14} strokeWidth={1.5} />
                </button>
              </form>
            </li>
          ))}
          {people.length === 0 && (
            <p className="py-6 text-center text-[12px] text-fg-subtle">
              Nenhuma pessoa cadastrada.
            </p>
          )}
        </ul>
      </section>
    </div>
  );
}
