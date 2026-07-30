// Reconhecimento visual local: MobileNet extrai um "vetor de características" de
// cada imagem (referência do Open Food Facts vs. frame capturado da câmera) e a
// gente compara por similaridade de cosseno — tudo no navegador, sem custo, sem
// cota. Só cai na Gemini (fallback) quando a confiança local é baixa ou o produto
// não tem imagem de referência cadastrada.
//
// Deliberadamente não usa @tensorflow-models/knn-classifier: com só 1 foto de
// referência por produto, a "confidence" por proporção de vizinhos daquele pacote
// não é muito informativa (com k=1 sempre dá 1.0). Similaridade de cosseno direta
// dá um número mais honesto pra usar como limiar.

type MobileNetModel = {
  infer: (
    img: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement,
    embedding?: boolean
  ) => { data: () => Promise<Float32Array>; dispose: () => void };
};

type TrainedExample = {
  productId: string;
  embedding: number[];
};

let model: MobileNetModel | null = null;
let trainedExamples: TrainedExample[] = [];

export async function loadVisualModel(): Promise<void> {
  const tf = await import("@tensorflow/tfjs");
  await tf.ready();
  const mobilenet = await import("@tensorflow-models/mobilenet");
  model = (await mobilenet.load({ version: 2, alpha: 1.0 })) as unknown as MobileNetModel;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Falha ao carregar imagem: ${src}`));
    img.src = src;
  });
}

async function embedImage(
  source: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement
): Promise<number[] | null> {
  if (!model) return null;

  const tensor = model.infer(source, true);
  const data = await tensor.data();
  tensor.dispose();

  let norm = 0;
  for (let i = 0; i < data.length; i++) norm += data[i] * data[i];
  norm = Math.sqrt(norm) || 1;

  return Array.from(data, (value) => value / norm);
}

/**
 * Recalcula os exemplos de referência — uma entrada por imagem, podendo haver
 * várias por produto (imagem principal + galeria de referências em /produtos).
 * Mais fotos = mais chance de bater com ângulos/iluminação diferentes na câmera.
 */
export async function trainFromProducts(
  images: { productId: string; imageUrl: string }[]
): Promise<void> {
  if (!model) return;

  const examples: TrainedExample[] = [];
  for (const image of images) {
    try {
      const img = await loadImage(image.imageUrl);
      const embedding = await embedImage(img);
      if (embedding) examples.push({ productId: image.productId, embedding });
    } catch {
      // Imagem falhou (CORS, 404, etc.) — essa referência fica de fora do treino.
    }
  }

  trainedExamples = examples;
}

export function hasTrainedExamples(): boolean {
  return trainedExamples.length > 0;
}

export async function predictProduct(
  frame: HTMLCanvasElement | HTMLVideoElement
): Promise<{ productId: string; similarity: number } | null> {
  if (!model || trainedExamples.length === 0) return null;

  const embedding = await embedImage(frame);
  if (!embedding) return null;

  let best: { productId: string; similarity: number } | null = null;
  for (const example of trainedExamples) {
    let dot = 0;
    for (let i = 0; i < embedding.length; i++) dot += embedding[i] * example.embedding[i];
    if (!best || dot > best.similarity) {
      best = { productId: example.productId, similarity: dot };
    }
  }

  return best;
}
