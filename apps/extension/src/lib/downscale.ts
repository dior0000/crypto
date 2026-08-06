import { FRAME_JPEG_QUALITY, FRAME_MAX_DIMENSION_PX } from "@chartmate/shared";

export interface DownscaledFrame {
  base64: string;
  mediaType: "image/jpeg";
}

export async function downscaleToJpeg(dataUrl: string): Promise<DownscaledFrame> {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);

  const scale = Math.min(1, FRAME_MAX_DIMENSION_PX / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("OffscreenCanvas 2D context недоступен");
  }
  ctx.drawImage(bitmap, 0, 0, width, height);

  const jpegBlob = await canvas.convertToBlob({ type: "image/jpeg", quality: FRAME_JPEG_QUALITY });
  const buffer = await jpegBlob.arrayBuffer();
  const base64 = arrayBufferToBase64(buffer);

  return { base64, mediaType: "image/jpeg" };
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}
