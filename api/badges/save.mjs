import {
  json,
  options,
  putFile,
  safeFileName,
  base64DataUrl,
} from "../_github.mjs";

const MAX_BADGE = 3 * 1024 * 1024;
const EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif", "svg"]);

export async function POST(request) {
  try {
    const body = await request.json();
    const name = String(body?.name || "").trim();
    const dataUrl = String(body?.dataUrl || "").trim();

    if (!name || !dataUrl) {
      return json({ ok: false, error: "Badge name and image data are required." }, 400, request);
    }

    const base64 = base64DataUrl(dataUrl);
    if (Buffer.byteLength(base64, "base64") > MAX_BADGE) {
      return json({ ok: false, error: "Badge is larger than 3 MB." }, 413, request);
    }

    const match = name.match(/\.([a-z0-9]+)$/i);
    const extension = match && EXTENSIONS.has(match[1].toLowerCase())
      ? match[1].toLowerCase()
      : "png";

    const base = safeFileName(
      name.replace(/\.[^.]+$/, ""),
      "template_badge"
    );

    const fileName = base + "." + extension;
    const path = "templates/badges/" + fileName;

    await putFile(
      path,
      base64,
      "Joes Studio: save template badge " + fileName
    );

    return json({
      ok: true,
      path,
      fileName,
      url: "./templates/badges/" + fileName,
      id: "github-badge-" + fileName,
    }, 200, request);
  } catch (error) {
    console.error("Badge save failed:", error);
    return json(
      { ok: false, error: error.message || "Badge could not be saved." },
      error.status === 413 ? 413 : 500,
      request
    );
  }
}

export async function OPTIONS(request) {
  return options(request);
}