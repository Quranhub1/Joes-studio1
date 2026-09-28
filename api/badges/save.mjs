import {
  json,
  options,
  putFile,
  getFile,
  listDirectory,
  safeFileName,
  base64DataUrl,
} from "../_github.mjs";
import { createHash } from "node:crypto";

const MAX_BADGE = 3 * 1024 * 1024;
const EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif", "svg"]);

function gitBlobShaFromBase64(base64) {
  const bytes = Buffer.from(base64, "base64");
  const header = Buffer.from("blob " + bytes.length + "\0", "utf8");
  return createHash("sha1").update(Buffer.concat([header, bytes])).digest("hex");
}

function splitExtension(fileName) {
  const match = String(fileName || "").match(/^(.*?)(\.[^.]+)?$/);
  return { base: match?.[1] || "template_badge", extension: match?.[2] || ".png" };
}

async function findExistingBadge(base64) {
  const files = await listDirectory("templates/badges");
  const wantedSha = gitBlobShaFromBase64(base64);
  const candidates = Array.isArray(files)
    ? files.filter(file => file?.type === "file" && /\.(?:png|jpe?g|webp|gif|svg)$/i.test(file.name || ""))
    : [];

  return candidates.find(file => file.sha === wantedSha) || null;
}

async function chooseSafePath(fileName, contentSha) {
  const directPath = "templates/badges/" + fileName;
  const current = await getFile(directPath);
  if (!current) return directPath;
  if (current.sha === contentSha) return directPath;

  const { base, extension } = splitExtension(fileName);
  for (let n = 2; n <= 999; n++) {
    const candidate = "templates/badges/" + base + "-" + n + extension;
    const existing = await getFile(candidate);
    if (!existing) return candidate;
    if (existing.sha === contentSha) return candidate;
  }
  throw new Error("Could not allocate a unique badge filename.");
}

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

    const duplicate = await findExistingBadge(base64);
    if (duplicate) {
      return json({
        ok: true,
        duplicate: true,
        path: duplicate.path,
        fileName: duplicate.name,
        url: "./templates/badges/" + duplicate.name,
        id: "github-badge-" + duplicate.name
      }, 200, request);
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
    const contentSha = gitBlobShaFromBase64(base64);
    const path = await chooseSafePath(fileName, contentSha);

    await putFile(
      path,
      base64,
      "Joes Studio: save template badge " + path.split("/").pop()
    );

    const savedName = path.split("/").pop();
    return json({
      ok: true,
      duplicate: false,
      path,
      fileName: savedName,
      url: "./templates/badges/" + savedName,
      id: "github-badge-" + savedName,
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
