import { notFound } from "next/navigation";
import { MOCK_PEOPLE } from "@/lib/mock-data";
import { ScanScreen } from "@/components/scan-screen";

export default async function EscanearPage({
  params,
}: {
  params: Promise<{ personId: string }>;
}) {
  const { personId } = await params;
  const person = MOCK_PEOPLE.find((p) => p.id === personId);

  if (!person) notFound();

  return <ScanScreen person={person} />;
}
