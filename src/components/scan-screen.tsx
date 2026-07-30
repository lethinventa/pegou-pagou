"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Check, ListPlus, Search, Sparkles, Trash2, X } from "lucide-react";
import { formatBRL } from "@/lib/format";
import { mockIdentifyProduct } from "@/lib/mock-identify";
import { MOCK_PRODUCTS } from "@/lib/mock-data";
import type { CartItem, Person } from "@/lib/types";

const SCAN_INTERVAL_MS = 3000;
const LOCK_AFTER_ADD_MS = 4000;

type CameraStatus = "starting" | "ready" | "unavailable";
type ScanState = "scanning" | "identifying" | "locked";

export function ScanScreen({ person }: { person: Person }) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanStateRef = useRef<ScanState>("scanning");

  const [cameraStatus, setCameraStatus] = useState<CameraStatus>("starting");
  const [scanState, setScanState] = useState<ScanState>("scanning");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [fallbackMessage, setFallbackMessage] = useState<string | null>(null);

  useEffect(() => {
    scanStateRef.current = scanState;
  }, [scanState]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(timer);
  }, [toast]);

  const total = useMemo(() => cart.reduce((sum, item) => sum + item.price, 0), [cart]);

  const addToCart = useCallback((productId: string) => {
    const product = MOCK_PRODUCTS.find((p) => p.id === productId);
    if (!product) return;
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
    setToast(`Adicionado: ${product.name}`);
  }, []);

  const removeFromCart = useCallback((cartItemId: string) => {
    setCart((prev) => prev.filter((item) => item.id !== cartItemId));
  }, []);

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
      const result = await mockIdentifyProduct(imageBase64);

      if ((result.confidence === "alta" || result.confidence === "media") && result.product_id) {
        addToCart(result.product_id);
        setScanState("locked");
        setTimeout(() => setScanState("scanning"), LOCK_AFTER_ADD_MS);
      } else {
        // confidence "baixa" (ou sem match): não adiciona nada, sem feedback — silencioso.
        setScanState("scanning");
      }
    },
    [addToCart]
  );

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
    if (cameraStatus !== "ready") return;

    const interval = setInterval(() => {
      if (scanStateRef.current !== "scanning") return;
      const frame = captureFrame();
      if (frame) runIdentification(frame);
    }, SCAN_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [cameraStatus, captureFrame, runIdentification]);

  async function handleFallbackPhoto(file: File) {
    setFallbackMessage(null);
    const base64 = await fileToBase64(file);
    const result = await mockIdentifyProduct(base64);

    if ((result.confidence === "alta" || result.confidence === "media") && result.product_id) {
      addToCart(result.product_id);
    } else {
      setFallbackMessage(
        "Não conseguimos identificar o produto. Tire a foto de novo ou escolha da lista."
      );
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-8">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-fg-subtle">
            Escaneando para
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-fg">{person.name}</h1>
        </div>
        <button
          onClick={() => router.push("/")}
          className="rounded-md border border-border bg-surface px-3.5 py-2 text-[13px] font-medium text-fg-muted transition-colors duration-[120ms] hover:border-border-strong hover:text-fg"
        >
          Concluir e trocar pessoa
        </button>
      </div>

      <div className="grid flex-1 grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="relative aspect-video overflow-hidden rounded-lg border border-border bg-black">
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

            {cameraStatus === "starting" && (
              <Overlay>
                <Camera size={18} strokeWidth={1.5} className="text-fg-muted" />
                <span>Ligando a câmera...</span>
              </Overlay>
            )}
            {cameraStatus === "unavailable" && (
              <FallbackCapture onFile={handleFallbackPhoto} message={fallbackMessage} />
            )}
            {cameraStatus === "ready" && scanState === "identifying" && (
              <StatusBadge tone="highlight" icon={<Sparkles size={13} strokeWidth={1.5} />}>
                Identificando
              </StatusBadge>
            )}
            {cameraStatus === "ready" && scanState === "locked" && (
              <StatusBadge tone="success" icon={<Check size={13} strokeWidth={1.5} />}>
                Adicionado! Pode afastar o produto
              </StatusBadge>
            )}
            {toast && <Toast>{toast}</Toast>}
          </div>

          <button
            onClick={() => setPickerOpen(true)}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-surface py-3 text-[14px] font-medium text-fg-muted transition-colors duration-[120ms] hover:border-border-strong hover:text-fg"
          >
            <ListPlus size={16} strokeWidth={1.5} />
            Escolher da lista
          </button>
        </div>

        <CartPanel cart={cart} total={total} onRemove={removeFromCart} />
      </div>

      {pickerOpen && (
        <ProductPicker
          onClose={() => setPickerOpen(false)}
          onPick={(productId) => {
            addToCart(productId);
            setPickerOpen(false);
          }}
        />
      )}
    </div>
  );
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
      <label className="flex cursor-pointer items-center gap-2 rounded-md bg-fg px-4 py-2 text-[13px] font-medium text-black transition-colors duration-[120ms] hover:bg-white">
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
}: {
  cart: CartItem[];
  total: number;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="flex flex-col rounded-lg border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-4 py-3.5">
        <h2 className="text-[13px] font-semibold text-fg">Carrinho da sessão</h2>
        {cart.length > 0 && (
          <span className="rounded-full border border-border-strong bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-fg-muted">
            {cart.length}
          </span>
        )}
      </div>

      <div className="flex-1 divide-y divide-border overflow-y-auto">
        {cart.length === 0 && (
          <p className="px-4 py-10 text-center text-[12px] text-fg-subtle">
            Nenhum item ainda. Mostre um produto para a câmera.
          </p>
        )}
        {cart.map((item) => (
          <div key={item.id} className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-[13px] font-medium text-fg">{item.product_name}</p>
              <p className="text-[12px] text-fg-muted">{formatBRL(item.price)}</p>
            </div>
            <button
              onClick={() => onRemove(item.id)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-fg-subtle transition-colors duration-[120ms] hover:bg-danger-dim hover:text-danger"
              aria-label={`Remover ${item.product_name}`}
            >
              <Trash2 size={14} strokeWidth={1.5} />
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between border-t border-border px-4 py-4">
        <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-fg-subtle">
          Total
        </span>
        <span className="text-lg font-semibold text-fg">{formatBRL(total)}</span>
      </div>
    </div>
  );
}

function ProductPicker({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (productId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = MOCK_PRODUCTS.filter((p) =>
    p.name.toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center">
      <div className="w-full max-w-md rounded-t-lg border border-border bg-surface-2 p-5 shadow-2xl sm:rounded-lg">
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
