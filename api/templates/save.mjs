import {
  json,
  options,
  putFile,
  updateTemplateManifest,
  safeFileName,
  base64Utf8,
} from "../_github.mjs";

const MAX_HTML = 1024 * 1024;

export async function POST(request) {
  try {
    const body = await request.json();
    const name = String(body?.name || "").trim();
    const content = String(body?.content || "");

    if (!name || !content.trim()) {
      return json({ ok: false, error: "Template name and HTML content are required." }, 400, request);
    }

    if (content.length > MAX_HTML) {
      return json({ ok: false, error: "Template is larger than 1 MB." }, 413, request);
    }

    const fileName = safeFileName(
      name.replace(/\.(html?|htm)$/i, ""),
      "saved_template"
    ) + ".html";

    const path = "templates/" + fileName;

    await putFile(
      path,
      base64Utf8(content),
      "Joes Studio: save HTML template " + fileName
    );

    const entry = await updateTemplateManifest(fileName);

    return json({ ok: true, path, fileName, entry }, 200, request);
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