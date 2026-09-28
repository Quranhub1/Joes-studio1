import {
  json,
  options,
  putFile,
  getFile,
  listDirectory,
  updateTemplateManifest,
  safeFileName,
  base64Utf8,
} from "../_github.mjs";
import { createHash } from "node:crypto";

const MAX_HTML = 1024 * 1024;

function blobSha(content) {
  const bytes = Buffer.from(String(content), "utf8");
  const header = Buffer.from("blob " + bytes.length + "\0", "utf8");
  return createHash("sha1").update(Buffer.concat([header, bytes])).digest("hex");
}

function safeTemplatePath(value) {
  const raw = String(value || "").trim();
  if (!raw || raw.includes("..") || !/^templates\/[a-zA-Z0-9._-]+\.html$/i.test(raw)) return "";
  return raw;
}

async function findIdenticalTemplate(content) {
  const wanted = blobSha(content);
  const files = await listDirectory("templates");
  if (!Array.isArray(files)) return null;
  return files.find(file =>
    file?.type === "file" &&
    /\.html$/i.test(file.name || "") &&
    file.sha === wanted
  ) || null;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const name = String(body?.name || "").trim();
    const content = String(body?.content || "");
    const existingPath = safeTemplatePath(body?.existingPath);

    if (!name || !content.trim()) {
      return json({ ok: false, error: "Template name and HTML content are required." }, 400, request);
    }

    if (Buffer.byteLength(content, "utf8") > MAX_HTML) {
      return json({ ok: false, error: "Template is larger than 1 MB." }, 413, request);
    }

    const contentSha = blobSha(content);

    // An explicit existingPath means the user is updating that template.
    if (existingPath) {
      const current = await getFile(existingPath);
      if (!current) {
        // The file disappeared between reads. Treat it as a new save instead
        // of failing the user's upload.
      } else if (current.sha === contentSha) {
        const fileName = existingPath.split("/").pop();
        const entry = await updateTemplateManifest(fileName);
        return json({ ok: true, updated: false, duplicate: true, path: existingPath, fileName, entry }, 200, request);
      } else {
        const fileName = existingPath.split("/").pop();
        await putFile(existingPath, base64Utf8(content), "Joes Studio: update HTML template " + fileName);
        const entry = await updateTemplateManifest(fileName);
        return json({ ok: true, updated: true, duplicate: false, path: existingPath, fileName, entry }, 200, request);
      }
    }

    // If this exact HTML already exists under another filename, reuse it.
    const duplicate = await findIdenticalTemplate(content);
    if (duplicate) {
      const entry = await updateTemplateManifest(duplicate.name);
      return json({
        ok: true,
        updated: false,
        duplicate: true,
        path: duplicate.path,
        fileName: duplicate.name,
        entry
      }, 200, request);
    }

    const fileName = safeFileName(
      name.replace(/\.(html?|htm)$/i, ""),
      "saved_template"
    ) + ".html";

    const requestedPath = "templates/" + fileName;
    const current = await getFile(requestedPath);

    // Never overwrite a different template just because two users chose the
    // same filename. Allocate a unique filename instead.
    let path = requestedPath;
    if (current && current.sha !== contentSha) {
      const base = fileName.replace(/\.html$/i, "");
      for (let n = 2; n <= 999; n++) {
        const candidate = "templates/" + base + "-" + n + ".html";
        const existing = await getFile(candidate);
        if (!existing || existing.sha === contentSha) {
          path = candidate;
          break;
        }
      }
    }

    const finalName = path.split("/").pop();
    await putFile(path, base64Utf8(content), "Joes Studio: save HTML template " + finalName);
    const entry = await updateTemplateManifest(finalName);

    return json({
      ok: true,
      updated: false,
      duplicate: false,
      path,
      fileName: finalName,
      entry
    }, 200, request);
  } catch (error) {
    console.error("Template save failed:", error);
    return json(
      { ok: false, error: error.message || "Template could not be saved." },
      error.status === 413 ? 413 : 500,
      request
    );
  }
}

export async function OPTIONS(request) {
  return options(request);
}
