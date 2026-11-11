import "server-only";
import { createHash } from "node:crypto";

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
export const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp"]);

export class UploadError extends Error {}

/**
 * Prüft den echten Bildinhalt (nicht nur den MIME-Header), dreht nach EXIF,
 * verkleinert auf max. 1920 px und speichert als WebP – dabei gehen alle
 * Metadaten (GPS, Kamera …) verloren. Ergebnis landet in der Datenbank
 * (Vercel hat kein dauerhaftes Dateisystem).
 */
export async function processImage(input: Buffer) {
  const sharp = (await import("sharp")).default;
  let meta;
  try {
    meta = await sharp(input, { limitInputPixels: 50_000_000 }).metadata();
  } catch {
    throw new UploadError("Die Datei ist kein gültiges Bild.");
  }
  if (!meta.format || !ALLOWED_FORMATS.has(meta.format)) {
    throw new UploadError("Nur JPG, PNG oder WebP sind erlaubt.");
  }
  const { data, info } = await sharp(input, { limitInputPixels: 50_000_000, animated: false })
    .rotate()
    .resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, sha256: createHash("sha256").update(data).digest("hex") };
}
