"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-10">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">Quem é você?</h1>
        <p className="mt-1 text-zinc-500">Toque no seu nome ou use a voz.</p>
      </div>

      <div className="flex flex-col items-center gap-3">
        <button
          onClick={startVoice}
          className={`flex h-16 w-16 items-center justify-center rounded-full text-white shadow-lg transition ${
            voiceStatus === "listening"
              ? "animate-pulse bg-red-500"
              : "bg-indigo-600 hover:bg-indigo-700"
          }`}
          aria-label="Identificar por voz"
        >
          <MicIcon />
        </button>
        <VoiceHint status={voiceStatus} heard={heard} />
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar nome..."
        className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-base outline-none focus:border-indigo-500"
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {filteredPeople.map((person) => (
          <button
            key={person.id}
            onClick={() => selectPerson(person.id)}
            className="flex h-28 flex-col items-center justify-center gap-2 rounded-2xl border border-zinc-200 bg-white text-lg font-medium shadow-sm transition hover:border-indigo-400 hover:shadow-md active:scale-95"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-indigo-700">
              {person.name.charAt(0).toUpperCase()}
            </span>
            {person.name}
          </button>
        ))}
        {filteredPeople.length === 0 && (
          <p className="col-span-full text-center text-zinc-400">
            Nenhum nome encontrado.
          </p>
        )}
      </div>
    </div>
  );
}

function VoiceHint({ status, heard }: { status: VoiceStatus; heard: string | null }) {
  if (status === "listening") return <p className="text-sm text-zinc-500">Ouvindo...</p>;
  if (status === "not-found")
    return (
      <p className="text-sm text-amber-600">
        Não entendi &ldquo;{heard}&rdquo;. Toque no seu nome na lista.
      </p>
    );
  if (status === "unsupported")
    return (
      <p className="text-sm text-zinc-400">
        Voz não disponível nesse navegador — toque na lista.
      </p>
    );
  if (status === "error")
    return (
      <p className="text-sm text-amber-600">
        Não consegui usar o microfone — toque na lista.
      </p>
    );
  return <p className="text-sm text-zinc-400">Diga seu nome</p>;
}

function MicIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="h-7 w-7"
    >
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" strokeLinecap="round" />
      <path d="M12 19v4M8 23h8" strokeLinecap="round" />
    </svg>
  );
}
