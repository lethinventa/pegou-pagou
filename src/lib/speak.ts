const VOICE_PREF_KEY = "pegou-pagou:voice-enabled";

// Opt-in: fica desligada até a pessoa ligar de propósito no botão de som.
export function isVoiceEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(VOICE_PREF_KEY) === "true";
}

export function setVoiceEnabled(enabled: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(VOICE_PREF_KEY, String(enabled));
}

/** Fala em pt-BR se a voz estiver ligada — nunca lança erro (kiosk não pode travar por causa disso). */
export function speak(text: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  if (!isVoiceEnabled()) return;

  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "pt-BR";
    window.speechSynthesis.speak(utterance);
  } catch {
    // Síntese de voz é um extra — falha aqui nunca deve afetar o resto do fluxo.
  }
}
