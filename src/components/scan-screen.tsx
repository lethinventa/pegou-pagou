"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Camera,
  Check,
  CheckCircle2,
  Clock,
  HelpCircle,
  LogOut,
  ScanSearch,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import type { ObjectDetection } from "@tensorflow-models/coco-ssd";
import { formatBRL } from "@/lib/format";
import { identifyProduct } from "@/lib/identify-product";
import { finalizeSession } from "@/lib/actions/sessions";
import { isVoiceEnabled, setVoiceEnabled, speak } from "@/lib/speak";
import { PersonPickerModal } from "@/components/person-picker-modal";
import type { CartItem, Person, Product } from "@/lib/types";

// A cota gratuita da Gemini é bem curta (20 req/dia no gemini-3.5-flash). Em vez de
// perguntar pra ela em loop o dia inteiro, um detector de objetos local (TensorFlow.js
// + COCO-SSD, roda no navegador, de graça, sem cota) decide se tem algo prominente na
// frente da câmera — só aí a gente gasta 1 chamada real pra saber QUAL produto é.
const DETECTION_INTERVAL_MS = 800;
const FALLBACK_INTERVAL_MS = 25000; // usado só se o detector local falhar ao carregar
// O detector (COCO-SSD) só conhece 80 classes genéricas (garrafa, xícara, banana...) —
// nenhuma é "pacote de salgadinho". Pra objetos fora desse vocabulário ele ainda desenha
// uma caixa em volta, só que com confiança mais baixa — por isso o threshold é frouxo:
// não importa qual classe ele "acha" que é, só que tem algo grande e sólido na frente.
const PRESENCE_SCORE_THRESHOLD = 0.25;
const PRESENCE_AREA_FRACTION = 0.06;
const GEMINI_COOLDOWN_MS = 5000; // no máx. 1 chamada real à Gemini a cada 5s
const LOCK_AFTER_ADD_MS = 4000;

// Carrinho sem dono até o "Finalizar compra": se ficar parado tempo demais, mais vale
// limpar sozinho do que arriscar misturar o consumo de duas pessoas na mesma sessão.
const INACTIVITY_WARNING_MS = 3 * 60 * 1000;
const INACTIVITY_CLEAR_COUNTDOWN_S = 30;

type CameraStatus = "starting" | "ready" | "unavailable";
type ScanState = "scanning" | "identifying" | "locked";
type ModelStatus = "loading" | "ready" | "error";

export function ScanScreen({ people, products }: { people: Person[]; products: Product[] }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanStateRef = useRef<ScanState>("scanning");
  const modelRef = useRef<ObjectDetection | null>(null);
  const lastGeminiCallRef = useRef(0);
  // 0 até a primeira atividade real (addToCart sempre grava o valor antes do
  // carrinho deixar de estar vazio, então o efeito de inatividade nunca lê esse 0).
  const lastActivityRef = useRef(0);
  const hasGreetedRef = useRef(false);
  const sessionStartRef = useRef(0);

  const [cameraStatus, setCameraStatus] = useState<CameraStatus>("starting");
  const [modelStatus, setModelStatus] = useState<ModelStatus>("loading");
  const [scanState, setScanState] = useState<ScanState>("scanning");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [fallbackMessage, setFallbackMessage] = useState<string | null>(null);
  // Mesmo motivo do sessionNumber: ler localStorage direto no useState quebraria a
  // hidratação pra quem já tinha ligado a voz antes (server sempre acha que é false).
  const [voiceEnabled, setVoiceEnabledState] = useState(false);
  const [secondsUntilClear, setSecondsUntilClear] = useState<number | null>(null);
  const [confirmation, setConfirmation] = useState<{ name: string; total: number } | null>(null);
  // null até montar no client — gerar com Math.random() direto no useState quebraria
  // a hidratação (servidor e client sorteando números diferentes pro mesmo render).
  const [sessionNumber, setSessionNumber] = useState<number | null>(null);
  const [sessionSeconds, setSessionSeconds] = useState(0);

  useEffect(() => {
    scanStateRef.current = scanState;
  }, [scanState]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!confirmation) return;
    const timer = setTimeout(() => setConfirmation(null), 4500);
    return () => clearTimeout(timer);
  }, [confirmation]);

  useEffect(() => {
    if (cameraStatus === "ready" && !hasGreetedRef.current) {
      hasGreetedRef.current = true;
      speak("Mostre o produto para a câmera.");
    }
  }, [cameraStatus]);

  useEffect(() => {
    sessionStartRef.current = Date.now();
    // Só dá pra sortear/ler localStorage depois de montar no client — fazer isso
    // direto no useState quebraria a hidratação (servidor não tem Math.random nem
    // localStorage reais). Esse é o jeito recomendado pelo React de evitar isso.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSessionNumber(Math.floor(100 + Math.random() * 900));
    setVoiceEnabledState(isVoiceEnabled());
    const interval = setInterval(() => {
      setSessionSeconds(Math.floor((Date.now() - sessionStartRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const total = useMemo(() => cart.reduce((sum, item) => sum + item.price, 0), [cart]);

  const addToCart = useCallback(
    (productId: string) => {
      const product = products.find((p) => p.id === productId);
      if (!product) return;
      lastActivityRef.current = Date.now();
      setCart((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          product_id: product.id,
          product_name: product.name,
          price: product.price,
          added_at: new Date().toISOString(),
        },
      ]);
      setToast(`Produto reconhecido — adicionado: ${product.name}`);
      speak(`${product.name} adicionado.`);
    },
    [products]
  );

  const removeFromCart = useCallback((cartItemId: string) => {
    lastActivityRef.current = Date.now();
    setCart((prev) => prev.filter((item) => item.id !== cartItemId));
  }, []);

  function openFinishModal() {
    lastActivityRef.current = Date.now();
    speak("Diga seu nome, ou toque na lista, para concluir.");
    setFinishOpen(true);
  }

  function resetSession() {
    sessionStartRef.current = Date.now();
    setSessionSeconds(0);
    setSessionNumber(Math.floor(100 + Math.random() * 900));
  }

  function handleExitSession() {
    if (cart.length > 0) {
      const confirmed = window.confirm(
        "Sair agora descarta os itens dessa sessão sem registrar pra ninguém. Continuar?"
      );
      if (!confirmed) return;
    }
    lastActivityRef.current = Date.now();
    setCart([]);
    setToast(null);
    resetSession();
  }

  function toggleVoice() {
    const next = !voiceEnabled;
    setVoiceEnabledState(next);
    setVoiceEnabled(next);
    if (!next) window.speechSynthesis?.cancel();
  }

  function dismissInactivityWarning() {
    lastActivityRef.current = Date.now();
    setSecondsUntilClear(null);
  }

  async function handleConfirmPerson(person: Person) {
    try {
      await finalizeSession(
        person.id,
        cart.map((item) => ({
          productId: item.product_id,
          productName: item.product_name,
          price: item.price,
        }))
      );
      setConfirmation({ name: person.name, total });
      speak(`Registrado para ${person.name}, ${formatBRL(total)}.`);
      setCart([]);
      setFinishOpen(false);
      lastActivityRef.current = Date.now();
      resetSession();
    } catch {
      setToast("Erro ao registrar a sessão. Tente de novo.");
    }
  }

  const captureFrame = useCallback((): string | null => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) return null;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.8).split(",")[1] ?? null;
  }, []);

  const runIdentification = useCallback(
    async (imageBase64: string) => {
      setScanState("identifying");
      const result = await identifyProduct(imageBase64, products);

      if ((result.confidence === "alta" || result.confidence === "media") && result.product_id) {
        addToCart(result.product_id);
        setScanState("locked");
        setTimeout(() => setScanState("scanning"), LOCK_AFTER_ADD_MS);
      } else {
        // confidence "baixa" (ou sem match): não adiciona nada, sem feedback — silencioso.
        setScanState("scanning");
      }
    },
    [addToCart, products]
  );

  useEffect(() => {
    let cancelled = false;

    async function loadModel() {
      try {
        const tf = await import("@tensorflow/tfjs");
        await tf.ready();
        const cocoSsd = await import("@tensorflow-models/coco-ssd");
        const model = await cocoSsd.load({ base: "lite_mobilenet_v2" });
        if (cancelled) return;
        modelRef.current = model;
        setModelStatus("ready");
      } catch {
        if (!cancelled) setModelStatus("error");
      }
    }

    loadModel();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setCameraStatus("ready");
      } catch {
        if (!cancelled) setCameraStatus("unavailable");
      }
    }

    startCamera();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (cameraStatus !== "ready" || modelStatus === "loading") return;

    const usingLocalGate = modelStatus === "ready";
    const intervalMs = usingLocalGate ? DETECTION_INTERVAL_MS : FALLBACK_INTERVAL_MS;

    const interval = setInterval(async () => {
      if (scanStateRef.current !== "scanning") return;

      if (usingLocalGate) {
        const video = videoRef.current;
        const model = modelRef.current;
        if (!video || !model || video.readyState < 2) return;

        const frameArea = video.videoWidth * video.videoHeight;
        if (frameArea === 0) return;

        const predictions = await model.detect(video);
        const hasPresence = predictions.some((prediction) => {
          const [, , boxWidth, boxHeight] = prediction.bbox;
          const areaFraction = (boxWidth * boxHeight) / frameArea;
          return (
            prediction.score >= PRESENCE_SCORE_THRESHOLD && areaFraction >= PRESENCE_AREA_FRACTION
          );
        });

        if (!hasPresence) return;
      }

      const now = Date.now();
      if (now - lastGeminiCallRef.current < GEMINI_COOLDOWN_MS) return;
      lastGeminiCallRef.current = now;

      const frame = captureFrame();
      if (frame) runIdentification(frame);
    }, intervalMs);

    return () => clearInterval(interval);
  }, [cameraStatus, modelStatus, captureFrame, runIdentification]);

  // Zera o carrinho sozinho se ficar muito tempo parado — evita que a próxima
  // pessoa a usar o kiosk herde sem querer itens de quem esqueceu de concluir.
  useEffect(() => {
    if (cart.length === 0 || finishOpen) return;

    const interval = setInterval(() => {
      const elapsed = Date.now() - lastActivityRef.current;
      if (elapsed < INACTIVITY_WARNING_MS) {
        setSecondsUntilClear(null);
        return;
      }

      const remaining = Math.max(
        0,
        INACTIVITY_CLEAR_COUNTDOWN_S - Math.floor((elapsed - INACTIVITY_WARNING_MS) / 1000)
      );
      setSecondsUntilClear(remaining);

      if (remaining === 0) {
        setCart([]);
        setToast("Carrinho esvaziado por inatividade");
        speak("Carrinho esvaziado por inatividade.");
        lastActivityRef.current = Date.now();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [cart.length, finishOpen]);

  async function handleFallbackPhoto(file: File) {
    setFallbackMessage(null);
    const base64 = await fileToBase64(file);
    const result = await identifyProduct(base64, products);

    if ((result.confidence === "alta" || result.confidence === "media") && result.product_id) {
      addToCart(result.product_id);
    } else {
      setFallbackMessage(
        "Não conseguimos identificar o produto. Tire a foto de novo ou escolha da lista."
      );
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-fg-muted">
          <span className="font-medium text-fg">Sessão #{sessionNumber ?? "—"}</span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            {cart.length} {cart.length === 1 ? "produto" : "produtos"}
          </span>
          <span className="flex items-center gap-1.5">
            <Clock size={13} strokeWidth={1.5} />
            {formatDuration(sessionSeconds)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleVoice}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface text-fg-subtle transition-colors duration-[120ms] hover:border-border-strong hover:text-fg-muted"
            aria-label={voiceEnabled ? "Desligar voz" : "Ligar voz"}
          >
            {voiceEnabled ? (
              <Volume2 size={14} strokeWidth={1.5} />
            ) : (
              <VolumeX size={14} strokeWidth={1.5} />
            )}
          </button>
          <button
            onClick={handleExitSession}
            className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-2 text-[13px] font-medium text-fg-muted transition-colors duration-[120ms] hover:border-border-strong hover:text-fg"
          >
            <LogOut size={14} strokeWidth={1.5} />
            Sair da sessão
          </button>
        </div>
      </div>

      <div className="grid flex-1 grid-cols-1 gap-6 lg:grid-cols-10">
        <div className="lg:col-span-7">
          <div className="relative aspect-video overflow-hidden rounded-2xl border border-border bg-black">
            {cameraStatus !== "unavailable" && (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="h-full w-full object-cover"
              />
            )}
            <canvas ref={canvasRef} className="hidden" />

            {cameraStatus === "ready" && (
              <div className="absolute left-4 top-4 flex items-center gap-1.5 rounded-full border border-border bg-black/60 px-2.5 py-1 text-[11px] font-medium text-fg-muted backdrop-blur-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-success" />
                Câmera ativa
              </div>
            )}

            {cameraStatus === "starting" && (
              <Overlay>
                <Camera size={18} strokeWidth={1.5} className="text-fg-muted" />
                <span>Ligando a câmera...</span>
              </Overlay>
            )}
            {cameraStatus === "unavailable" && (
              <FallbackCapture onFile={handleFallbackPhoto} message={fallbackMessage} />
            )}
            {cameraStatus === "ready" && modelStatus !== "loading" && scanState !== "identifying" && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="relative h-[58%] w-[58%] max-w-sm">
                  <span
                    className="absolute left-0 top-0 h-9 w-9 rounded-tl-lg border-l-2 border-t-2 border-success"
                    style={{ filter: "drop-shadow(0 0 6px var(--color-success))" }}
                  />
                  <span
                    className="absolute right-0 top-0 h-9 w-9 rounded-tr-lg border-r-2 border-t-2 border-success"
                    style={{ filter: "drop-shadow(0 0 6px var(--color-success))" }}
                  />
                  <span
                    className="absolute bottom-0 left-0 h-9 w-9 rounded-bl-lg border-b-2 border-l-2 border-success"
                    style={{ filter: "drop-shadow(0 0 6px var(--color-success))" }}
                  />
                  <span
                    className="absolute bottom-0 right-0 h-9 w-9 rounded-br-lg border-b-2 border-r-2 border-success"
                    style={{ filter: "drop-shadow(0 0 6px var(--color-success))" }}
                  />
                </div>
                {scanState === "scanning" && !toast && (
                  <p className="absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-black/70 px-4 py-2 text-[12px] font-medium text-fg-muted backdrop-blur-sm">
                    <ScanSearch size={14} strokeWidth={1.5} className="text-success" />
                    Posicione o produto no centro da área e segure por 1 segundo
                  </p>
                )}
              </div>
            )}
            {cameraStatus === "ready" && scanState === "identifying" && (
              <StatusBadge tone="highlight" icon={<Sparkles size={13} strokeWidth={1.5} />}>
                Identificando
              </StatusBadge>
            )}
            {cameraStatus === "ready" && scanState === "locked" && (
              <StatusBadge tone="success" icon={<Check size={13} strokeWidth={1.5} />}>
                Produto adicionado ao carrinho
              </StatusBadge>
            )}
            {cameraStatus === "ready" && modelStatus === "loading" && (
              <StatusBadge tone="highlight" icon={<Sparkles size={13} strokeWidth={1.5} />}>
                Carregando detector...
              </StatusBadge>
            )}
            {secondsUntilClear !== null && cart.length > 0 && !finishOpen && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/85 p-6 text-center">
                <p className="text-[14px] font-medium text-fg">Ainda está aí?</p>
                <p className="max-w-xs text-[13px] text-fg-muted">
                  O carrinho vai ser esvaziado por inatividade em {secondsUntilClear}s.
                </p>
                <button
                  onClick={dismissInactivityWarning}
                  className="rounded-md bg-success px-4 py-2 text-[13px] font-medium text-black transition-colors duration-[120ms] hover:brightness-110"
                >
                  Ainda estou aqui
                </button>
              </div>
            )}
            {toast && <Toast>{toast}</Toast>}
          </div>

          <RecognitionStepper scanState={scanState} />

          <button
            onClick={() => setPickerOpen(true)}
            className="mt-3 flex w-full items-center justify-between gap-2 rounded-2xl border border-border bg-surface px-4 py-3.5 text-[14px] font-medium text-fg-muted transition-colors duration-[120ms] hover:border-border-strong hover:text-fg"
          >
            <span className="flex items-center gap-2">
              <Search size={16} strokeWidth={1.5} />
              Não encontrou? <span className="text-success">Escolher manualmente</span>
            </span>
            <ArrowRight size={15} strokeWidth={1.5} />
          </button>
        </div>

        <div className="lg:col-span-3">
          <CartPanel cart={cart} total={total} onRemove={removeFromCart} onFinish={openFinishModal} />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-5 py-4">
        <div className="flex items-start gap-3">
          <ShieldCheck size={18} strokeWidth={1.5} className="mt-0.5 shrink-0 text-success" />
          <div>
            <p className="text-[13px] font-medium text-fg">Boa iluminação ajuda na identificação</p>
            <p className="text-[12px] text-fg-subtle">
              Evite luz forte atrás do produto e mantenha a câmera limpa.
            </p>
          </div>
        </div>
        <button className="flex shrink-0 items-center gap-1.5 rounded-md border border-border px-3 py-2 text-[12px] font-medium text-fg-muted transition-colors duration-[120ms] hover:border-border-strong hover:text-fg">
          <HelpCircle size={14} strokeWidth={1.5} />
          Precisa de ajuda?
        </button>
      </div>

      {pickerOpen && (
        <ProductPicker
          products={products}
          onClose={() => setPickerOpen(false)}
          onPick={(productId) => {
            addToCart(productId);
            setPickerOpen(false);
          }}
        />
      )}

      {finishOpen && (
        <PersonPickerModal
          people={people}
          total={total}
          onClose={() => setFinishOpen(false)}
          onConfirm={handleConfirmPerson}
        />
      )}

      {confirmation && (
        <FinalizeConfirmation
          name={confirmation.name}
          total={confirmation.total}
          onDismiss={() => setConfirmation(null)}
        />
      )}
    </div>
  );
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 text-[13px] text-fg-muted">
      {children}
    </div>
  );
}

function RecognitionStepper({ scanState }: { scanState: ScanState }) {
  const steps: { key: ScanState; label: string; icon: typeof ScanSearch }[] = [
    { key: "scanning", label: "Procurando produto", icon: ScanSearch },
    { key: "identifying", label: "Identificando...", icon: Sparkles },
    { key: "locked", label: "Pronto!", icon: CheckCircle2 },
  ];

  return (
    <div className="mt-4 flex items-center justify-center gap-2.5 rounded-2xl border border-border bg-surface px-4 py-3 sm:gap-4">
      {steps.map((step, index) => {
        const isActive = step.key === scanState;
        const Icon = step.icon;
        return (
          <div key={step.key} className="flex items-center gap-2.5 sm:gap-4">
            <div
              className={`flex items-center gap-1.5 text-[12px] font-medium sm:text-[13px] ${
                isActive ? "text-success" : "text-fg-subtle"
              }`}
            >
              <Icon size={15} strokeWidth={1.5} />
              <span className="whitespace-nowrap">{step.label}</span>
            </div>
            {index < steps.length - 1 && (
              <ArrowRight size={13} strokeWidth={1.5} className="text-fg-subtle" />
            )}
          </div>
        );
      })}
    </div>
  );
}

function StatusBadge({
  children,
  tone,
  icon,
}: {
  children: React.ReactNode;
  tone: "highlight" | "success";
  icon: React.ReactNode;
}) {
  const toneClass =
    tone === "success"
      ? "border-success/40 bg-success-dim text-success"
      : "border-highlight/40 bg-highlight-dim text-highlight";

  return (
    <div
      className={`absolute left-1/2 top-4 flex -translate-x-1/2 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium backdrop-blur-sm ${toneClass}`}
    >
      {icon}
      {children}
    </div>
  );
}

function Toast({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-success/40 bg-success-dim px-3.5 py-2 text-[12px] font-medium text-success shadow-lg">
      <Check size={13} strokeWidth={1.5} />
      {children}
    </div>
  );
}

function FinalizeConfirmation({
  name,
  total,
  onDismiss,
}: {
  name: string;
  total: number;
  onDismiss: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-success/40 bg-surface-2 px-10 py-8 text-center shadow-2xl">
        <span className="flex h-14 w-14 items-center justify-center rounded-full border border-success/40 bg-success-dim text-success">
          <Check size={28} strokeWidth={1.5} />
        </span>
        <div>
          <p className="text-lg font-semibold text-fg">Registrado para {name}</p>
          <p className="mt-1 text-2xl font-semibold text-success">{formatBRL(total)}</p>
        </div>
        <button
          onClick={onDismiss}
          className="mt-2 rounded-md border border-border bg-surface px-4 py-2 text-[13px] font-medium text-fg-muted transition-colors duration-[120ms] hover:border-border-strong hover:text-fg"
        >
          OK
        </button>
      </div>
    </div>
  );
}

function FallbackCapture({
  onFile,
  message,
}: {
  onFile: (file: File) => void;
  message: string | null;
}) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
      <Camera size={22} strokeWidth={1.5} className="text-fg-subtle" />
      <p className="text-[13px] text-fg-muted">Câmera indisponível. Tire uma foto do produto.</p>
      <label className="flex cursor-pointer items-center gap-2 rounded-md bg-success px-4 py-2 text-[13px] font-medium text-black transition-colors duration-[120ms] hover:brightness-110">
        <Camera size={15} strokeWidth={1.5} />
        Tirar foto
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
            e.target.value = "";
          }}
        />
      </label>
      {message && <p className="max-w-xs text-[12px] text-warning">{message}</p>}
    </div>
  );
}

function CartPanel({
  cart,
  total,
  onRemove,
  onFinish,
}: {
  cart: CartItem[];
  total: number;
  onRemove: (id: string) => void;
  onFinish: () => void;
}) {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-4 py-3.5">
        <h2 className="text-[14px] font-semibold text-fg">Carrinho</h2>
        {cart.length > 0 && (
          <span className="rounded-full bg-success-dim px-2 py-0.5 text-[11px] font-semibold text-success">
            {cart.length}
          </span>
        )}
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {cart.length === 0 && (
          <p className="px-2 py-10 text-center text-[12px] text-fg-subtle">
            Nenhum item ainda. Mostre um produto para a câmera.
          </p>
        )}
        {cart.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-3 rounded-xl border border-border bg-surface-2 p-2.5"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border-strong bg-surface-3 text-[13px] font-semibold text-fg-muted">
              {item.product_name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-fg">{item.product_name}</p>
              <p className="text-[12px] font-medium text-success">{formatBRL(item.price)}</p>
            </div>
            <button
              onClick={() => onRemove(item.id)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-fg-subtle transition-colors duration-[120ms] hover:bg-danger-dim hover:text-danger"
              aria-label={`Remover ${item.product_name}`}
            >
              <Trash2 size={14} strokeWidth={1.5} />
            </button>
          </div>
        ))}
      </div>

      <div className="border-t border-border p-4">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-fg-subtle">
              Total
            </p>
            <p className="text-[12px] text-fg-subtle">
              {cart.length} {cart.length === 1 ? "item" : "itens"}
            </p>
          </div>
          <span className="text-2xl font-semibold text-success">{formatBRL(total)}</span>
        </div>
        <button
          onClick={onFinish}
          disabled={cart.length === 0}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-success py-3.5 text-[14px] font-semibold text-black transition-colors duration-[120ms] hover:brightness-110 disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-fg-subtle disabled:hover:brightness-100"
        >
          <Check size={16} strokeWidth={2} />
          Finalizar compra
        </button>
        {cart.length === 0 && (
          <p className="mt-2 text-center text-[11px] text-fg-subtle">Adicione ao menos 1 item</p>
        )}
      </div>
    </div>
  );
}

function ProductPicker({
  products,
  onClose,
  onPick,
}: {
  products: Product[];
  onClose: () => void;
  onPick: (productId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = products.filter((p) =>
    p.name.toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center">
      <div className="w-full max-w-md rounded-t-2xl border border-border bg-surface-2 p-5 shadow-2xl sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[14px] font-semibold text-fg">Escolher produto</h2>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-fg-subtle transition-colors duration-[120ms] hover:bg-surface-3 hover:text-fg"
            aria-label="Fechar"
          >
            <X size={15} strokeWidth={1.5} />
          </button>
        </div>
        <div className="relative mb-3">
          <Search
            size={14}
            strokeWidth={1.5}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle"
          />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar produto..."
            className="h-10 w-full rounded-md border border-border bg-surface pl-9 pr-3 text-[13px] text-fg placeholder:text-fg-subtle outline-none transition-colors duration-[120ms] focus:border-highlight"
          />
        </div>
        <div className="max-h-80 divide-y divide-border overflow-y-auto">
          {filtered.map((product) => (
            <button
              key={product.id}
              onClick={() => onPick(product.id)}
              className="flex w-full items-center justify-between py-3 text-left text-[13px] transition-colors duration-[120ms] hover:text-highlight"
            >
              <span className="text-fg">{product.name}</span>
              <span className="text-fg-muted">{formatBRL(product.price)}</span>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="py-6 text-center text-[12px] text-fg-subtle">
              Nenhum produto encontrado.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
