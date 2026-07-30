"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, Star, Trash2, X } from "lucide-react";
import {
  addReferenceImage,
  deleteReferenceImage,
  setMainReferenceImage,
} from "@/lib/actions/products";
import { formatDate } from "@/lib/format";
import type { ReferenceImage } from "@/lib/types";

export function ReferenceImageManager({
  productId,
  images,
  mainImageUrl,
}: {
  productId: string;
  images: ReferenceImage[];
  mainImageUrl: string | null;
}) {
  const [cameraOpen, setCameraOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleUpload(file: File) {
    setPending("upload");
    const formData = new FormData();
    formData.set("productId", productId);
    formData.set("origem", "upload");
    formData.set("file", file);
    await addReferenceImage(formData);
    setPending(null);
  }

  async function handleCameraCapture(file: File) {
    setPending("camera");
    const formData = new FormData();
    formData.set("productId", productId);
    formData.set("origem", "camera");
    formData.set("file", file);
    await addReferenceImage(formData);
    setPending(null);
    setCameraOpen(false);
  }

  async function handleDelete(id: string) {
    setPending(id);
    const formData = new FormData();
    formData.set("id", id);
    formData.set("productId", productId);
    await deleteReferenceImage(formData);
    setPending(null);
  }

  async function handleSetMain(id: string) {
    setPending(id);
    const formData = new FormData();
    formData.set("id", id);
    formData.set("productId", productId);
    await setMainReferenceImage(formData);
    setPending(null);
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => setCameraOpen(true)}
          className="flex h-9 items-center gap-1.5 rounded-md bg-fg px-3.5 text-[13px] font-medium text-black transition-colors duration-[120ms] hover:bg-white"
        >
          <Camera size={14} strokeWidth={1.5} />
          Tirar foto
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={pending === "upload"}
          className="flex h-9 items-center gap-1.5 rounded-md border border-border px-3.5 text-[13px] font-medium text-fg-muted transition-colors duration-[120ms] hover:text-fg disabled:opacity-50"
        >
          <ImagePlus size={14} strokeWidth={1.5} />
          {pending === "upload" ? "Enviando..." : "Upload"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleUpload(file);
            e.target.value = "";
          }}
        />
      </div>

      {images.length === 0 ? (
        <p className="mt-4 text-[13px] text-fg-subtle">
          Nenhuma imagem de referência ainda. Tire uma foto ou envie um arquivo.
        </p>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {images.map((image) => {
            const isMain = image.image_path === mainImageUrl;
            return (
              <div
                key={image.id}
                className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-surface-2"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- imagem do Supabase Storage */}
                <img src={image.image_path} alt="" className="h-full w-full object-cover" />
                {isMain && (
                  <span className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded-full bg-success px-2 py-0.5 text-[10px] font-medium text-black">
                    <Star size={10} strokeWidth={2} fill="currentColor" />
                    Principal
                  </span>
                )}
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-black/70 p-1.5 opacity-0 transition-opacity duration-[120ms] group-hover:opacity-100">
                  <span className="truncate px-0.5 text-[10px] text-fg-subtle">
                    {formatDate(image.created_at)}
                  </span>
                  <div className="flex shrink-0 items-center gap-1">
                    {!isMain && (
                      <button
                        onClick={() => handleSetMain(image.id)}
                        disabled={pending === image.id}
                        className="flex h-6 w-6 items-center justify-center rounded text-fg-subtle hover:bg-surface-3 hover:text-fg disabled:opacity-50"
                        aria-label="Definir como principal"
                      >
                        <Star size={12} strokeWidth={1.5} />
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(image.id)}
                      disabled={pending === image.id}
                      className="flex h-6 w-6 items-center justify-center rounded text-fg-subtle hover:bg-danger-dim hover:text-danger disabled:opacity-50"
                      aria-label="Excluir referência"
                    >
                      <Trash2 size={12} strokeWidth={1.5} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {cameraOpen && (
        <CameraCaptureModal
          onClose={() => setCameraOpen(false)}
          onCapture={handleCameraCapture}
          pending={pending === "camera"}
        />
      )}
    </div>
  );
}

function CameraCaptureModal({
  onClose,
  onCapture,
  pending,
}: {
  onClose: () => void;
  onCapture: (file: File) => void;
  pending: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<"starting" | "ready" | "unavailable">("starting");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("unavailable");
      }
    }

    start();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  function capture() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        setPreviewBlob(blob);
        setPreviewUrl(URL.createObjectURL(blob));
      },
      "image/jpeg",
      0.85
    );
  }

  function retake() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreviewBlob(null);
  }

  function confirm() {
    if (!previewBlob) return;
    onCapture(new File([previewBlob], `referencia-${Date.now()}.jpg`, { type: "image/jpeg" }));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface-2 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[14px] font-semibold text-fg">Tirar foto de referência</h2>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-fg-subtle hover:bg-surface-3 hover:text-fg"
            aria-label="Fechar"
          >
            <X size={15} strokeWidth={1.5} />
          </button>
        </div>

        <div className="relative aspect-video overflow-hidden rounded-lg border border-border bg-black">
          {status === "unavailable" && (
            <div className="flex h-full items-center justify-center text-[12px] text-fg-subtle">
              Câmera indisponível.
            </div>
          )}
          {status === "starting" && (
            <div className="flex h-full items-center justify-center text-[12px] text-fg-subtle">
              Ligando a câmera...
            </div>
          )}
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- preview local (object URL), não externo
            <img src={previewUrl} alt="Prévia da foto" className="h-full w-full object-cover" />
          ) : (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`h-full w-full object-cover ${status === "ready" ? "" : "invisible"}`}
            />
          )}
        </div>

        <div className="mt-3 flex justify-end gap-2">
          {previewUrl ? (
            <>
              <button
                onClick={retake}
                className="flex h-9 items-center rounded-md px-3.5 text-[13px] font-medium text-fg-subtle hover:text-fg"
              >
                Tirar de novo
              </button>
              <button
                onClick={confirm}
                disabled={pending}
                className="flex h-9 items-center rounded-md bg-success px-3.5 text-[13px] font-medium text-black transition-colors duration-[120ms] hover:brightness-110 disabled:opacity-50"
              >
                {pending ? "Salvando..." : "Usar esta foto"}
              </button>
            </>
          ) : (
            <button
              onClick={capture}
              disabled={status !== "ready"}
              className="flex h-9 items-center gap-1.5 rounded-md bg-fg px-3.5 text-[13px] font-medium text-black transition-colors duration-[120ms] hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Camera size={14} strokeWidth={1.5} />
              Capturar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
