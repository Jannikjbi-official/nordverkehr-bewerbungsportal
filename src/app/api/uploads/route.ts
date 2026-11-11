import { db } from "@/lib/db";
import { accessErrorResponse, assertUserApi } from "@/lib/auth/session";
import { rateLimit } from "@/lib/rate-limit";
import { forbiddenOrigin, isSameOrigin } from "@/lib/security";
import { ALLOWED_MIME, MAX_UPLOAD_BYTES, UploadError, processImage } from "@/lib/uploads/storage";

/** Bild-Upload für Bewerbungsfragen vom Typ FILE. */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return forbiddenOrigin();
  let user;
  try {
    user = await assertUserApi();
  } catch (err) {
    return accessErrorResponse(err);
  }

  const rl = await rateLimit(`upload:${user.id}`, 30, 3600);
  if (!rl.ok) return Response.json({ error: "Zu viele Uploads. Versuch es später nochmal." }, { status: 429 });

  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_UPLOAD_BYTES + 64 * 1024) return Response.json({ error: "Die Datei ist zu groß (max. 8 MB)." }, { status: 413 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }
  const file = form.get("file");
  const questionId = String(form.get("questionId") ?? "");
  if (!(file instanceof File)) return Response.json({ error: "Keine Datei." }, { status: 400 });
  if (!ALLOWED_MIME.has(file.type)) return Response.json({ error: "Nur JPG, PNG oder WebP." }, { status: 415 });
  if (file.size > MAX_UPLOAD_BYTES) return Response.json({ error: "Die Datei ist zu groß (max. 8 MB)." }, { status: 413 });
  if (!/^[a-z0-9]{10,40}$/i.test(questionId)) return Response.json({ error: "Ungültige Frage." }, { status: 400 });

  const pending = await db.upload.count({ where: { ownerId: user.id, applicationId: null } });
  if (pending >= 25) return Response.json({ error: "Zu viele nicht verwendete Bilder. Entferne erst welche." }, { status: 429 });

  try {
    const processed = await processImage(Buffer.from(await file.arrayBuffer()));
    const upload = await db.upload.create({
      data: {
        ownerId: user.id,
        questionId,
        fileName: file.name.replace(/[^\w.\- ]/g, "_").slice(0, 120) || "bild",
        mime: "image/webp",
        size: processed.data.length,
        width: processed.width,
        height: processed.height,
        sha256: processed.sha256,
        data: new Uint8Array(processed.data),
      },
      select: { id: true, fileName: true, width: true, height: true },
    });
    return Response.json({ upload });
  } catch (err) {
    if (err instanceof UploadError) return Response.json({ error: err.message }, { status: 422 });
    console.error("[upload]", err);
    return Response.json({ error: "Upload fehlgeschlagen." }, { status: 500 });
  }
}
