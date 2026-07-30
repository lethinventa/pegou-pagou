import { getCurrentMonthLogs } from "@/lib/actions/logs";
import { getPeople } from "@/lib/actions/people";
import { formatBRL } from "@/lib/format";

// Resumo do mês corrente — sempre calculado na hora, nunca cacheado.
export const dynamic = "force-dynamic";

export default async function ResumoPage() {
  const [logs, people] = await Promise.all([getCurrentMonthLogs(), getPeople()]);

  const byPerson = people
    .map((person) => {
      const personLogs = logs.filter((log) => log.person_id === person.id);
      const total = personLogs.reduce((sum, log) => sum + Number(log.price), 0);

      const itemCounts = new Map<string, { name: string; price: number; qty: number }>();
      for (const entry of personLogs) {
        const existing = itemCounts.get(entry.product_name);
        if (existing) {
          existing.qty += 1;
        } else {
          itemCounts.set(entry.product_name, {
            name: entry.product_name,
            price: Number(entry.price),
            qty: 1,
          });
        }
      }

      return { person, total, items: Array.from(itemCounts.values()) };
    })
    .filter((entry) => entry.items.length > 0);

  const monthLabel = new Date().toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
  const grandTotal = byPerson.reduce((sum, entry) => sum + entry.total, 0);

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-6 py-12">
      <div className="flex items-end justify-between border-b border-border pb-6">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-fg-subtle">
            Resumo mensal
          </p>
          <h1 className="mt-2 text-2xl font-semibold capitalize tracking-tight text-fg">
            {monthLabel}
          </h1>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-fg-subtle">
            Total
          </p>
          <p className="mt-1 text-2xl font-semibold text-fg">{formatBRL(grandTotal)}</p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {byPerson.map(({ person, total, items }) => (
          <div key={person.id} className="rounded-lg border border-border bg-surface p-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-full border border-border-strong bg-surface-2 text-[12px] font-semibold text-fg-muted">
                  {person.name.charAt(0).toUpperCase()}
                </span>
                <h2 className="text-[14px] font-semibold text-fg">{person.name}</h2>
              </div>
              <span className="text-[15px] font-semibold text-fg">{formatBRL(total)}</span>
            </div>
            <ul className="mt-3 flex flex-col gap-1.5">
              {items.map((item) => (
                <li
                  key={item.name}
                  className="flex justify-between text-[12px] text-fg-muted"
                >
                  <span>
                    {item.qty}x {item.name}
                  </span>
                  <span className="text-fg-subtle">{formatBRL(item.price * item.qty)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {byPerson.length === 0 && (
          <p className="col-span-full py-10 text-center text-[13px] text-fg-subtle">
            Nenhum consumo registrado neste mês.
          </p>
        )}
      </div>
    </div>
  );
}
