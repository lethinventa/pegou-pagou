"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Mic, Search } from "lucide-react";
import { MOCK_PEOPLE } from "@/lib/mock-data";
import { findBestPersonMatch } from "@/lib/fuzzy-match";

type VoiceStatus = "idle" | "listening" | "not-found" | "unsupported" | "error";

export default function IdentifyPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>("idle");
  const [heard, setHeard] = useState<string | null>(null);

  const filteredPeople = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return MOCK_PEOPLE;
    return MOCK_PEOPLE.filter((p) => p.name.toLowerCase().includes(q));
  }, [query]);

  function selectPerson(personId: string) {
    router.push(`/escanear/${personId}`);
  }

  function startVoice() {
    const SpeechRecognitionCtor =
      window.SpeechRecognition ?? window.webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      setVoiceStatus("unsupported");
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "pt-BR";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setVoiceStatus("listening");

    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript ?? "";
      setHeard(transcript);
      const match = findBestPersonMatch(transcript, MOCK_PEOPLE);
      if (match) {
        selectPerson(match.id);
      } else {
        setVoiceStatus("not-found");
      }
    };

    recognition.onerror = () => setVoiceStatus("error");
    recognition.onend = () => {
      setVoiceStatus((current) => (current === "listening" ? "idle" : current));
    };

    recognition.start();
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-12">
      <div className="text-center">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-fg-subtle">
          Identificação
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-fg">Quem é você?</h1>
        <p className="mt-1.5 text-[13px] text-fg-muted">Toque no seu nome ou use a voz.</p>
      </div>

      <div className="flex flex-col items-center gap-3">
        <button
          onClick={startVoice}
          className={`relative flex items-center justify-center rounded-full border transition-colors duration-[120ms] ${
            voiceStatus === "listening"
              ? "border-highlight bg-highlight-dim text-highlight"
              : "border-border bg-surface text-fg-muted hover:border-border-strong hover:text-fg"
          }`}
          style={{ height: "4.5rem", width: "4.5rem" }}
          aria-label="Identificar por voz"
        >
          {voiceStatus === "listening" && (
            <span className="absolute inset-0 animate-pulse rounded-full border border-highlight opacity-40" />
          )}
          <Mic size={26} strokeWidth={1.5} />
        </button>
        <VoiceHint status={voiceStatus} heard={heard} />
      </div>

      <div className="relative">
        <Search
          size={15}
          strokeWidth={1.5}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-subtle"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar nome..."
          className="h-11 w-full rounded-lg border border-border bg-surface pl-10 pr-4 text-[14px] text-fg placeholder:text-fg-subtle outline-none transition-colors duration-[120ms] focus:border-highlight"
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {filteredPeople.map((person) => (
          <button
            key={person.id}
            onClick={() => selectPerson(person.id)}
            className="flex h-28 flex-col items-center justify-center gap-2.5 rounded-lg border border-border bg-surface text-[15px] font-medium text-fg transition-colors duration-[120ms] hover:border-border-strong hover:bg-surface-2 active:scale-[0.98]"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full border border-border-strong bg-surface-2 text-[13px] font-semibold text-fg-muted">
              {person.name.charAt(0).toUpperCase()}
            </span>
            {person.name}
          </button>
        ))}
        {filteredPeople.length === 0 && (
          <p className="col-span-full py-8 text-center text-[13px] text-fg-subtle">
            Nenhum nome encontrado.
          </p>
        )}
      </div>
    </div>
  );
}

function VoiceHint({ status, heard }: { status: VoiceStatus; heard: string | null }) {
  if (status === "listening")
    return <p className="text-[12px] text-fg-muted">Ouvindo...</p>;
  if (status === "not-found")
    return (
      <p className="text-[12px] text-warning">
        Não entendi &ldquo;{heard}&rdquo;. Toque no seu nome na lista.
      </p>
    );
  if (status === "unsupported")
    return (
      <p className="text-[12px] text-fg-subtle">
        Voz não disponível nesse navegador — toque na lista.
      </p>
    );
  if (status === "error")
    return (
      <p className="text-[12px] text-warning">
        Não consegui usar o microfone — toque na lista.
      </p>
    );
  return <p className="text-[12px] text-fg-subtle">Diga seu nome</p>;
}
