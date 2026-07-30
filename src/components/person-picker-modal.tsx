"use client";

import { useState } from "react";
import { Mic, Search, X } from "lucide-react";
import { MOCK_PEOPLE } from "@/lib/mock-data";
import { findBestPersonMatch } from "@/lib/fuzzy-match";
import { formatBRL } from "@/lib/format";
import type { Person } from "@/lib/types";

type VoiceStatus = "idle" | "listening" | "not-found" | "unsupported" | "error";

export function PersonPickerModal({
  total,
  onClose,
  onConfirm,
}: {
  total: number;
  onClose: () => void;
  onConfirm: (person: Person) => void;
}) {
  const [query, setQuery] = useState("");
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>("idle");
  const [heard, setHeard] = useState<string | null>(null);

  const filtered = MOCK_PEOPLE.filter((p) =>
    p.name.toLowerCase().includes(query.trim().toLowerCase())
  );

  function startVoice() {
    const SpeechRecognitionCtor = window.SpeechRecognition ?? window.webkitSpeechRecognition;

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
        onConfirm(match);
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-lg border border-border bg-surface-2 p-6 shadow-2xl sm:rounded-lg">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-fg-subtle">
              Concluir sessão · {formatBRL(total)}
            </p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-fg">Quem é você?</h2>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-fg-subtle transition-colors duration-[120ms] hover:bg-surface-3 hover:text-fg"
            aria-label="Fechar"
          >
            <X size={15} strokeWidth={1.5} />
          </button>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <div className="relative flex-1">
            <Search
              size={14}
              strokeWidth={1.5}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle"
            />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar nome..."
              className="h-10 w-full rounded-md border border-border bg-surface pl-9 pr-3 text-[13px] text-fg placeholder:text-fg-subtle outline-none transition-colors duration-[120ms] focus:border-highlight"
            />
          </div>
          <button
            onClick={startVoice}
            className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-md border transition-colors duration-[120ms] ${
              voiceStatus === "listening"
                ? "border-highlight bg-highlight-dim text-highlight"
                : "border-border bg-surface text-fg-muted hover:border-border-strong hover:text-fg"
            }`}
            aria-label="Identificar por voz"
          >
            <Mic size={15} strokeWidth={1.5} />
            {voiceStatus === "listening" && (
              <span className="absolute right-1 top-1 h-1.5 w-1.5 animate-pulse rounded-full bg-highlight" />
            )}
          </button>
        </div>
        <VoiceHint status={voiceStatus} heard={heard} />

        <div className="mt-4 grid grid-cols-3 gap-2.5 overflow-y-auto">
          {filtered.map((person) => (
            <button
              key={person.id}
              onClick={() => onConfirm(person)}
              className="flex h-20 flex-col items-center justify-center gap-2 rounded-lg border border-border bg-surface text-[13px] font-medium text-fg transition-colors duration-[120ms] hover:border-border-strong hover:bg-surface-3 active:scale-[0.98]"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full border border-border-strong bg-surface-2 text-[11px] font-semibold text-fg-muted">
                {person.name.charAt(0).toUpperCase()}
              </span>
              {person.name}
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="col-span-full py-6 text-center text-[12px] text-fg-subtle">
              Nenhum nome encontrado.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function VoiceHint({ status, heard }: { status: VoiceStatus; heard: string | null }) {
  if (status === "listening")
    return <p className="mt-2 text-[12px] text-fg-muted">Ouvindo...</p>;
  if (status === "not-found")
    return (
      <p className="mt-2 text-[12px] text-warning">
        Não entendi &ldquo;{heard}&rdquo;. Toque no seu nome na lista.
      </p>
    );
  if (status === "unsupported")
    return (
      <p className="mt-2 text-[12px] text-fg-subtle">
        Voz não disponível nesse navegador — toque na lista.
      </p>
    );
  if (status === "error")
    return (
      <p className="mt-2 text-[12px] text-warning">
        Não consegui usar o microfone — toque na lista.
      </p>
    );
  return null;
}
