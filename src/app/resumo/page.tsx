import { MOCK_LOGS, MOCK_PEOPLE } from "@/lib/mock-data";
import { formatBRL } from "@/lib/format";

function currentMonthKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export default function ResumoPage() {
  const monthKey = currentMonthKey();
  const logsThisMonth = MOCK_LOGS.filter((log) => log.created_at.startsWith(monthKey));

  const byPerson = MOCK_PEOPLE.map((person) => {
    const logs = logsThisMonth.filter((log) => log.person_id === person.id);
    const total = logs.reduce((sum, log) => sum + log.price, 0);

    const itemCounts = new Map<string, { name: string; price: number; qty: number }>();
    for (const entry of logs) {
      const existing = itemCounts.get(entry.product_name);
      if (existing) {
        existing.qty += 1;
      } else {
        itemCounts.set(entry.product_name, {
          name: entry.product_name,
          price: entry.price,
          qty: 1,
        });
      }
    }

    return { person, total, items: Array.from(itemCounts.values()) };
  }).filter((entry) => entry.items.length > 0);

  const monthLabel = new Date().toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
  const grandTotal = byPerson.reduce((sum, entry) => sum + entry.total, 0);

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Resumo de {monthLabel}</h1>
          <p className="mt-1 text-zinc-500">Consumo por pessoa neste mês.</p>
        </div>
        <p className="text-lg font-semibold">{formatBRL(grandTotal)}</p>
      </div>

      <div className="mt-8 flex flex-col gap-4">
        {byPerson.map(({ person, total, items }) => (
          <div key={person.id} className="rounded-2xl border border-zinc-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{person.name}</h2>
              <span className="text-lg font-semibold">{formatBRL(total)}</span>
            </div>
            <ul className="mt-3 space-y-1 text-sm text-zinc-600">
              {items.map((item) => (
                <li key={item.name} className="flex justify-between">
                  <span>
                    {item.qty}x {item.name}
                  </span>
                  <span>{formatBRL(item.price * item.qty)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {byPerson.length === 0 && (
          <p className="text-center text-zinc-400">Nenhum consumo registrado neste mês.</p>
        )}
      </div>
    </div>
  );
}
