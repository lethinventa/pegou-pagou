"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
          <p className="text-sm text-zinc-500">Escaneando para</p>
          <h1 className="text-2xl font-semibold">{person.name}</h1>
        </div>
        <button
          onClick={() => router.push("/")}
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100"
        >
          Concluir e trocar pessoa
        </button>
      </div>

      <div className="grid flex-1 grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="relative aspect-video overflow-hidden rounded-2xl bg-black">
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

            {cameraStatus === "starting" && <Overlay>Ligando a câmera...</Overlay>}
            {cameraStatus === "unavailable" && (
              <FallbackCapture onFile={handleFallbackPhoto} message={fallbackMessage} />
            )}
            {cameraStatus === "ready" && scanState === "identifying" && (
              <StatusBadge>Identificando...</StatusBadge>
            )}
            {cameraStatus === "ready" && scanState === "locked" && (
              <StatusBadge tone="success">Adicionado! Pode afastar o produto</StatusBadge>
            )}
            {toast && <Toast>{toast}</Toast>}
          </div>

          <button
            onClick={() => setPickerOpen(true)}
            className="mt-4 w-full rounded-xl border border-zinc-300 bg-white py-3 text-base font-medium text-zinc-700 hover:bg-zinc-50"
          >
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
    <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-white">
      {children}
    </div>
  );
}

function StatusBadge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "success";
}) {
  return (
    <div
      className={`absolute left-1/2 top-4 -translate-x-1/2 rounded-full px-4 py-1.5 text-sm font-medium text-white shadow ${
        tone === "success" ? "bg-emerald-600" : "bg-black/70"
      }`}
    >
      {children}
    </div>
  );
}

function Toast({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-lg">
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
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-zinc-900 p-6 text-center text-white">
      <p className="text-sm text-zinc-300">Câmera indisponível. Tire uma foto do produto.</p>
      <label className="cursor-pointer rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-700">
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
      {message && <p className="max-w-xs text-sm text-amber-400">{message}</p>}
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
    <div className="flex flex-col rounded-2xl border border-zinc-200 bg-white">
      <div className="border-b border-zinc-200 px-5 py-4">
        <h2 className="font-semibold">Carrinho da sessão</h2>
      </div>

      <div className="flex-1 divide-y divide-zinc-100 overflow-y-auto">
        {cart.length === 0 && (
          <p className="px-5 py-8 text-center text-sm text-zinc-400">
            Nenhum item ainda. Mostre um produto para a câmera.
          </p>
        )}
        {cart.map((item) => (
          <div key={item.id} className="flex items-center justify-between px-5 py-3">
            <div>
              <p className="text-sm font-medium">{item.product_name}</p>
              <p className="text-sm text-zinc-500">{formatBRL(item.price)}</p>
            </div>
            <button
              onClick={() => onRemove(item.id)}
              className="text-sm font-medium text-red-500 hover:text-red-600"
            >
              Remover
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between border-t border-zinc-200 px-5 py-4">
        <span className="font-medium">Total</span>
        <span className="text-lg font-semibold">{formatBRL(total)}</span>
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="w-full max-w-md rounded-t-2xl bg-white p-5 sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Escolher produto</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600">
            Fechar
          </button>
        </div>
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar produto..."
          className="mb-3 w-full rounded-lg border border-zinc-300 px-3 py-2 outline-none focus:border-indigo-500"
        />
        <div className="max-h-80 divide-y divide-zinc-100 overflow-y-auto">
          {filtered.map((product) => (
            <button
              key={product.id}
              onClick={() => onPick(product.id)}
              className="flex w-full items-center justify-between py-3 text-left hover:bg-zinc-50"
            >
              <span>{product.name}</span>
              <span className="text-zinc-500">{formatBRL(product.price)}</span>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="py-6 text-center text-sm text-zinc-400">Nenhum produto encontrado.</p>
          )}
        </div>
      </div>
    </div>
  );
}
