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
  Minus,
  Plus,
  ScanSearch,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { formatBRL } from "@/lib/format";
import { identifyProduct } from "@/lib/identify-product";
import { finalizeSession } from "@/lib/actions/sessions";
import { addReferenceImage, recordRecognitionFeedback } from "@/lib/actions/products";
import { isVoiceEnabled, setVoiceEnabled, speak } from "@/lib/speak";
import {
  hasTrainedExamples,
  loadVisualModel,
  predictProduct,
  trainFromProducts,
} from "@/lib/visual-recognition";
import { PersonPickerModal } from "@/components/person-picker-modal";
import type { CartItem, Person, Product, ReferenceImage } from "@/lib/types";

// A cota gratuita da Gemini é bem curta (20 req/dia no gemini-3.5-flash). Em vez de
// perguntar pra ela em loop o dia inteiro, um detector de presença local decide se tem
// algo prominente na frente da câmera — só aí a gente considera identificar de verdade.
//
// Isso já foi um detector de objetos (COCO-SSD), mas ele só reconhece 80 classes
// genéricas (garrafa, xícara, banana...) — nenhuma é "pacote de salgadinho" ou "barra
// de chocolate", então travava sem nunca detectar presença pra boa parte dos produtos
// reais. Trocado por subtração de fundo (comparar o quadro atual com um "fundo vazio"
// que vai se atualizando devagar): não importa a forma do objeto, só que mudou o
// suficiente de pixels na área central onde o produto deve ficar.
const DETECTION_INTERVAL_MS = 800;
const PROBE_WIDTH = 80;
const PROBE_HEIGHT = 60;
const MOTION_PIXEL_DIFF_THRESHOLD = 28; // diferença de cinza (0-255) pra contar como "mudou"
const MOTION_AREA_FRACTION = 0.12; // fração da área central que precisa mudar pra contar como presença
const CENTRAL_REGION_FRACTION = 0.58; // combina com o guia visual (h-[58%] w-[58%]) na tela
const BASELINE_ADAPT_RATE = 0.08; // o quão rápido o "fundo vazio" se ajusta quando não há presença
// Primeiro tenta reconhecer comparando com as fotos de referência do catálogo
// (MobileNet + similaridade de cosseno, local, de graça). Só chama a Gemini de
// verdade se a comparação local não bater com confiança suficiente — o número
// abaixo é um chute razoável, precisa validar com fotos reais dos produtos.
const LOCAL_MATCH_THRESHOLD = 0.85;
const GEMINI_COOLDOWN_MS = 5000; // no máx. 1 chamada real à Gemini a cada 5s

// Proteção contra reconhecimento duplicado: só confirma um produto depois do MESMO
// resultado aparecer em análises consecutivas seguidas (evita adicionar 2x por causa
// de uma leitura isolada estranha). Depois de confirmado, trava novos reconhecimentos
// até detectar que o produto realmente saiu de cena — nunca um timer cego, porque o
// produto pode continuar na frente da câmera depois que um timer fixo acabaria.
const CONFIRMATION_STREAK_REQUIRED = 2;
const REMOVAL_GRACE_MS = 1000; // tempo sem detectar presença pra considerar "retirado"

// Depois de uma adição confirmada, a captura vira automaticamente uma nova imagem de
// referência do produto — sem pedir confirmação explícita (isso deixaria a compra
// lenta). Em vez disso, oferece uma janela curta pra "corrigir" caso tenha reconhecido
// errado; se ninguém mexer, assume que estava certo e salva a referência normalmente.
const FEEDBACK_WINDOW_MS = 4000;

// Carrinho sem dono até o "Finalizar compra": se ficar parado tempo demais, mais vale
// limpar sozinho do que arriscar misturar o consumo de duas pessoas na mesma sessão.
const INACTIVITY_WARNING_MS = 3 * 60 * 1000;
const INACTIVITY_CLEAR_COUNTDOWN_S = 30;

type CameraStatus = "starting" | "ready" | "unavailable";
type ScanState = "scanning" | "identifying" | "awaiting_removal";

export function ScanScreen({
  people,
  products,
  referenceImages,
}: {
  people: Person[];
  products: Product[];
  referenceImages: ReferenceImage[];
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanStateRef = useRef<ScanState>("scanning");
  // Canvas offscreen (nunca anexado ao DOM) usado só pra amostrar o vídeo em baixa
  // resolução — barato o suficiente pra rodar a cada detecção sem pesar no navegador.
  const probeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  // "Fundo vazio" em tons de cinza (PROBE_WIDTH x PROBE_HEIGHT) pra subtração de fundo.
  // Null até a primeira amostra; se atualiza devagar só quando não há presença.
  const baselineRef = useRef<Uint8ClampedArray | null>(null);
  const lastGeminiCallRef = useRef(0);
  // 0 até a primeira atividade real (addToCart sempre grava o valor antes do
  // carrinho deixar de estar vazio, então o efeito de inatividade nunca lê esse 0).
  const lastActivityRef = useRef(0);
  const hasGreetedRef = useRef(false);
  const sessionStartRef = useRef(0);
  // Candidato a confirmação: mesmo product_id precisa se repetir CONFIRMATION_STREAK_REQUIRED
  // vezes seguidas antes de virar uma adição de verdade no carrinho.
  const candidateRef = useRef<{ productId: string; streak: number }>({ productId: "", streak: 0 });
  // Marca a última vez que algo foi detectado na câmera — usado pra saber quando o
  // produto confirmado realmente saiu de cena (em vez de um timer fixo).
  const lastPresenceAtRef = useRef(0);
  // Fallback só usado se o detector local de presença não estiver disponível: sem ele
  // não dá pra saber se o produto foi retirado, então cai num tempo fixo degradado.
  const awaitingRemovalSinceRef = useRef(0);
  // Reconhecimento aguardando virar referência de treino: guarda o frame já capturado
  // (não dá pra reler o <canvas> depois, ele é reaproveitado a cada detecção) e o timer
  // que confirma como "correto" automaticamente se ninguém corrigir a tempo.
  const pendingFeedbackRef = useRef<{
    productId: string;
    frameBlob: Blob;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);

  // Câmera sempre ligada dá a sensação de que o kiosk nunca "termina". Fica numa tela
  // de repouso até um toque acordar — só aí liga a câmera de verdade.
  const [awake, setAwake] = useState(false);
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>("starting");
  const [visualModelReady, setVisualModelReady] = useState(false);
  const [scanState, setScanState] = useState<ScanState>("scanning");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingCorrection, setPendingCorrection] = useState<{
    productId: string;
    productName: string;
  } | null>(null);
  const [correctionOpen, setCorrectionOpen] = useState(false);
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

  const decreaseQuantity = useCallback((productId: string) => {
    lastActivityRef.current = Date.now();
    setCart((prev) => {
      const index = prev.findIndex((item) => item.product_id === productId);
      if (index === -1) return prev;
      return [...prev.slice(0, index), ...prev.slice(index + 1)];
    });
  }, []);

  const removeProductGroup = useCallback((productId: string) => {
    lastActivityRef.current = Date.now();
    setCart((prev) => prev.filter((item) => item.product_id !== productId));
  }, []);

  // Salva a captura como referência do produto e conta como acerto — usado tanto
  // quando a janela de correção expira sem ninguém mexer, quanto quando alguém usa
  // "Corrigir" só pra confirmar que estava certo mesmo.
  const confirmRecognitionAsCorrect = useCallback(async (productId: string, frameBlob: Blob) => {
    try {
      const formData = new FormData();
      formData.set("productId", productId);
      formData.set("origem", "camera");
      formData.set("file", new File([frameBlob], `captura-${Date.now()}.jpg`, { type: "image/jpeg" }));
      await addReferenceImage(formData);
      await recordRecognitionFeedback(productId, true);
    } catch {
      // Feedback é só pra melhorar o catálogo de referências com o tempo — uma
      // falha aqui não deve incomodar quem já concluiu a compra.
    }
  }, []);

  const flushPendingFeedback = useCallback(() => {
    const pending = pendingFeedbackRef.current;
    if (!pending) return;
    clearTimeout(pending.timer);
    pendingFeedbackRef.current = null;
    setPendingCorrection(null);
    void confirmRecognitionAsCorrect(pending.productId, pending.frameBlob);
  }, [confirmRecognitionAsCorrect]);

  const schedulePendingFeedback = useCallback(
    (productId: string, productName: string, frame: HTMLCanvasElement) => {
      frame.toBlob(
        (blob) => {
          if (!blob) return;
          const timer = setTimeout(() => flushPendingFeedback(), FEEDBACK_WINDOW_MS);
          pendingFeedbackRef.current = { productId, frameBlob: blob, timer };
          setPendingCorrection({ productId, productName });
        },
        "image/jpeg",
        0.8
      );
    },
    [flushPendingFeedback]
  );

  async function handleCorrection(correctProductId: string) {
    const pending = pendingFeedbackRef.current;
    setCorrectionOpen(false);
    if (!pending) return;
    clearTimeout(pending.timer);
    pendingFeedbackRef.current = null;
    setPendingCorrection(null);

    if (correctProductId === pending.productId) {
      void confirmRecognitionAsCorrect(pending.productId, pending.frameBlob);
      return;
    }

    decreaseQuantity(pending.productId);
    addToCart(correctProductId);

    try {
      const formData = new FormData();
      formData.set("productId", correctProductId);
      formData.set("origem", "camera");
      formData.set(
        "file",
        new File([pending.frameBlob], `captura-${Date.now()}.jpg`, { type: "image/jpeg" })
      );
      await addReferenceImage(formData);
      await recordRecognitionFeedback(pending.productId, false);
    } catch {
      // idem — não bloqueia o fluxo de compra, que já foi corrigido na tela.
    }
  }

  useEffect(() => {
    return () => {
      if (pendingFeedbackRef.current) clearTimeout(pendingFeedbackRef.current.timer);
    };
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
    setAwake(false);
    setCameraStatus("starting");
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
      setAwake(false);
      setCameraStatus("starting");
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

  // Retorna true quando esse product_id já se repetiu vezes suficientes seguidas.
  function registerCandidate(productId: string): boolean {
    if (candidateRef.current.productId === productId) {
      candidateRef.current.streak += 1;
    } else {
      candidateRef.current = { productId, streak: 1 };
    }
    return candidateRef.current.streak >= CONFIRMATION_STREAK_REQUIRED;
  }

  function resetCandidate() {
    candidateRef.current = { productId: "", streak: 0 };
  }

  const runIdentification = useCallback(
    async (imageBase64: string, frame: HTMLCanvasElement) => {
      setScanState("identifying");

      function confirmAndAdd(productId: string) {
        // Qualquer feedback anterior ainda pendente (janela de "corrigir" não expirou)
        // vira acerto implícito agora — evita duas capturas em aberto ao mesmo tempo.
        flushPendingFeedback();
        resetCandidate();
        addToCart(productId);
        const now = Date.now();
        lastPresenceAtRef.current = now;
        awaitingRemovalSinceRef.current = now;
        setScanState("awaiting_removal");
        const product = products.find((p) => p.id === productId);
        if (product) schedulePendingFeedback(productId, product.name, frame);
      }

      if (visualModelReady && hasTrainedExamples()) {
        const localMatch = await predictProduct(frame);
        if (localMatch && localMatch.similarity >= LOCAL_MATCH_THRESHOLD) {
          if (registerCandidate(localMatch.productId)) {
            confirmAndAdd(localMatch.productId);
          } else {
            setScanState("scanning");
          }
          return;
        }
      }

      // Fallback: comparação local não teve confiança suficiente (ou não tem
      // modelo/exemplos treinados ainda) — pergunta pra Gemini, respeitando o
      // intervalo mínimo entre chamadas reais (cota diária é bem curta).
      const now = Date.now();
      if (now - lastGeminiCallRef.current < GEMINI_COOLDOWN_MS) {
        // Só pula essa rodada — não reseta o candidato. Como o intervalo de detecção
        // (800ms) é bem menor que o cooldown (5s), o tick logo após uma chamada real
        // sempre cairia aqui; resetar apagaria o streak que acabou de começar.
        setScanState("scanning");
        return;
      }
      lastGeminiCallRef.current = now;

      const result = await identifyProduct(imageBase64, products);

      if ((result.confidence === "alta" || result.confidence === "media") && result.product_id) {
        if (registerCandidate(result.product_id)) {
          confirmAndAdd(result.product_id);
        } else {
          setScanState("scanning");
        }
      } else {
        // confidence "baixa" (ou sem match): não adiciona nada, sem feedback — silencioso.
        resetCandidate();
        setScanState("scanning");
      }
    },
    [addToCart, products, visualModelReady, flushPendingFeedback, schedulePendingFeedback]
  );

  // Uma entrada por imagem de referência (imagem principal + todas as da galeria em
  // /produtos) — quanto mais fotos por produto, melhor o reconhecimento local.
  const trainingImages = useMemo(() => {
    const images: { productId: string; imageUrl: string }[] = [];
    for (const product of products) {
      if (product.image_url) images.push({ productId: product.id, imageUrl: product.image_url });
    }
    for (const ref of referenceImages) {
      if (ref.product_id) images.push({ productId: ref.product_id, imageUrl: ref.image_path });
    }
    return images;
  }, [products, referenceImages]);

  useEffect(() => {
    let cancelled = false;

    async function loadAndTrainVisualModel() {
      try {
        await loadVisualModel();
        await trainFromProducts(trainingImages);
        if (!cancelled) setVisualModelReady(true);
      } catch {
        // Sem modelo visual local, tudo cai direto no fallback da Gemini — sem problema.
      }
    }

    loadAndTrainVisualModel();

    return () => {
      cancelled = true;
    };
  }, [trainingImages]);

  useEffect(() => {
    if (!awake) return;
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
  }, [awake]);

  // Subtração de fundo: compara o quadro atual (numa amostra pequena, em cinza) com um
  // "fundo vazio" que só se atualiza quando NÃO há presença — assim, quando um produto
  // aparece, ele continua "diferente" do fundo até realmente sair de cena, em vez de
  // depender de reconhecer a forma/categoria do objeto.
  const checkPresence = useCallback((): boolean | null => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || video.videoWidth === 0) return null;

    let probeCanvas = probeCanvasRef.current;
    if (!probeCanvas) {
      probeCanvas = document.createElement("canvas");
      probeCanvas.width = PROBE_WIDTH;
      probeCanvas.height = PROBE_HEIGHT;
      probeCanvasRef.current = probeCanvas;
    }
    const ctx = probeCanvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0, PROBE_WIDTH, PROBE_HEIGHT);
    const { data } = ctx.getImageData(0, 0, PROBE_WIDTH, PROBE_HEIGHT);

    const gray = new Uint8ClampedArray(PROBE_WIDTH * PROBE_HEIGHT);
    for (let i = 0; i < gray.length; i++) {
      const o = i * 4;
      gray[i] = (data[o] * 0.299 + data[o + 1] * 0.587 + data[o + 2] * 0.114) | 0;
    }

    const baseline = baselineRef.current;
    if (!baseline) {
      // Primeira amostra: ainda não há fundo pra comparar.
      baselineRef.current = gray;
      return null;
    }

    const marginX = Math.round((PROBE_WIDTH * (1 - CENTRAL_REGION_FRACTION)) / 2);
    const marginY = Math.round((PROBE_HEIGHT * (1 - CENTRAL_REGION_FRACTION)) / 2);

    let changed = 0;
    let total = 0;
    for (let y = marginY; y < PROBE_HEIGHT - marginY; y++) {
      for (let x = marginX; x < PROBE_WIDTH - marginX; x++) {
        const idx = y * PROBE_WIDTH + x;
        total++;
        if (Math.abs(gray[idx] - baseline[idx]) >= MOTION_PIXEL_DIFF_THRESHOLD) changed++;
      }
    }

    const hasPresence = total > 0 && changed / total >= MOTION_AREA_FRACTION;

    if (!hasPresence) {
      for (let i = 0; i < gray.length; i++) {
        baseline[i] = baseline[i] + (gray[i] - baseline[i]) * BASELINE_ADAPT_RATE;
      }
    }

    return hasPresence;
  }, []);

  useEffect(() => {
    if (cameraStatus !== "ready") return;

    const interval = setInterval(async () => {
      if (scanStateRef.current === "identifying") return;

      if (scanStateRef.current === "awaiting_removal") {
        const hasPresence = await checkPresence();
        if (hasPresence) {
          lastPresenceAtRef.current = Date.now();
        } else if (Date.now() - lastPresenceAtRef.current >= REMOVAL_GRACE_MS) {
          setScanState("scanning");
        }
        return;
      }

      // scanState === "scanning"
      const hasPresence = await checkPresence();
      if (!hasPresence) return;

      const frameBase64 = captureFrame();
      const canvas = canvasRef.current;
      if (frameBase64 && canvas) runIdentification(frameBase64, canvas);
    }, DETECTION_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [cameraStatus, captureFrame, runIdentification, checkPresence]);

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
            {!awake && (
              <button
                onClick={() => setAwake(true)}
                className="absolute inset-0 flex w-full flex-col items-center justify-center gap-3 text-fg-subtle transition-colors duration-[120ms] hover:text-fg-muted"
              >
                <Camera size={28} strokeWidth={1.25} />
                <span className="text-[14px] font-medium">Toque para começar</span>
              </button>
            )}
            {awake && cameraStatus !== "unavailable" && (
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

            {awake && cameraStatus === "starting" && (
              <Overlay>
                <Camera size={18} strokeWidth={1.5} className="text-fg-muted" />
                <span>Ligando a câmera...</span>
              </Overlay>
            )}
            {cameraStatus === "unavailable" && (
              <FallbackCapture onFile={handleFallbackPhoto} message={fallbackMessage} />
            )}
            {cameraStatus === "ready" && scanState === "scanning" && (
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
                {!toast && (
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
            {cameraStatus === "ready" && scanState === "awaiting_removal" && (
              <StatusBadge tone="success" icon={<Check size={13} strokeWidth={1.5} />}>
                Produto adicionado. Retire-o da câmera para continuar.
              </StatusBadge>
            )}
            {cameraStatus === "ready" && pendingCorrection && (
              <button
                onClick={() => setCorrectionOpen(true)}
                className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full border border-border bg-black/70 px-4 py-2 text-[12px] font-medium text-fg-muted backdrop-blur-sm transition-colors duration-[120ms] hover:text-fg"
              >
                Não era {pendingCorrection.productName}? <span className="text-highlight">Corrigir</span>
              </button>
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
          <CartPanel
            cart={cart}
            total={total}
            onIncrease={addToCart}
            onDecrease={decreaseQuantity}
            onRemoveProduct={removeProductGroup}
            onFinish={openFinishModal}
          />
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

      {correctionOpen && (
        <ProductPicker
          products={products}
          onClose={() => setCorrectionOpen(false)}
          onPick={handleCorrection}
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
    { key: "awaiting_removal", label: "Pronto!", icon: CheckCircle2 },
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

type GroupedCartItem = {
  productId: string;
  productName: string;
  price: number;
  quantity: number;
};

function groupCart(cart: CartItem[]): GroupedCartItem[] {
  const groups = new Map<string, GroupedCartItem>();
  for (const item of cart) {
    const existing = groups.get(item.product_id);
    if (existing) {
      existing.quantity += 1;
    } else {
      groups.set(item.product_id, {
        productId: item.product_id,
        productName: item.product_name,
        price: item.price,
        quantity: 1,
      });
    }
  }
  return Array.from(groups.values());
}

function CartPanel({
  cart,
  total,
  onIncrease,
  onDecrease,
  onRemoveProduct,
  onFinish,
}: {
  cart: CartItem[];
  total: number;
  onIncrease: (productId: string) => void;
  onDecrease: (productId: string) => void;
  onRemoveProduct: (productId: string) => void;
  onFinish: () => void;
}) {
  const grouped = useMemo(() => groupCart(cart), [cart]);

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
        {grouped.length === 0 && (
          <p className="px-2 py-10 text-center text-[12px] text-fg-subtle">
            Nenhum item ainda. Mostre um produto para a câmera.
          </p>
        )}
        {grouped.map((group) => (
          <div
            key={group.productId}
            className="flex items-center gap-3 rounded-xl border border-border bg-surface-2 p-2.5"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border-strong bg-surface-3 text-[13px] font-semibold text-fg-muted">
              {group.productName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-fg">{group.productName}</p>
              <p className="text-[12px] font-medium text-success">
                {formatBRL(group.price * group.quantity)}
                {group.quantity > 1 && (
                  <span className="text-fg-subtle"> ({formatBRL(group.price)} cada)</span>
                )}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1 rounded-md border border-border bg-surface p-0.5">
              <button
                onClick={() => onDecrease(group.productId)}
                className="flex h-6 w-6 items-center justify-center rounded text-fg-muted transition-colors duration-[120ms] hover:bg-surface-3 hover:text-fg"
                aria-label={`Diminuir quantidade de ${group.productName}`}
              >
                <Minus size={12} strokeWidth={2} />
              </button>
              <span className="w-4 text-center text-[12px] font-medium text-fg">
                {group.quantity}
              </span>
              <button
                onClick={() => onIncrease(group.productId)}
                className="flex h-6 w-6 items-center justify-center rounded text-fg-muted transition-colors duration-[120ms] hover:bg-surface-3 hover:text-fg"
                aria-label={`Aumentar quantidade de ${group.productName}`}
              >
                <Plus size={12} strokeWidth={2} />
              </button>
            </div>
            <button
              onClick={() => onRemoveProduct(group.productId)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-fg-subtle transition-colors duration-[120ms] hover:bg-danger-dim hover:text-danger"
              aria-label={`Remover ${group.productName}`}
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
