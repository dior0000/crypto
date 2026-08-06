const HASH_SIZE = 8;

async function decodeToImageBitmap(dataUrl: string): Promise<ImageBitmap> {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return createImageBitmap(blob);
}

async function toGrayscaleSamples(bitmap: ImageBitmap, size: number): Promise<Uint8ClampedArray> {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("OffscreenCanvas 2D context недоступен");
  }
  ctx.drawImage(bitmap, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);

  const gray = new Uint8ClampedArray(size * size);
  for (let i = 0; i < gray.length; i++) {
    const r = data[i * 4] ?? 0;
    const g = data[i * 4 + 1] ?? 0;
    const b = data[i * 4 + 2] ?? 0;
    gray[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }
  return gray;
}

/** Average hash (aHash): каждый бит — выше ли яркость пикселя среднего значения. */
export async function computePHash(dataUrl: string): Promise<string> {
  const bitmap = await decodeToImageBitmap(dataUrl);
  const gray = await toGrayscaleSamples(bitmap, HASH_SIZE);

  const mean = gray.reduce((sum, value) => sum + value, 0) / gray.length;

  let bits = "";
  for (const value of gray) {
    bits += value >= mean ? "1" : "0";
  }
  return bits;
}

/** Доля различающихся бит между двумя хэшами одинаковой длины, от 0 до 1. */
export function phashDiffRatio(a: string, b: string): number {
  if (a.length !== b.length) {
    return 1;
  }
  let diffCount = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      diffCount++;
    }
  }
  return diffCount / a.length;
}
