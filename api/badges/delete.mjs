import { json, options, deleteFile } from "../_github.mjs";

export async function POST(request) {
  try {
    const body = await request.json();
    const path = String(body?.path || "");

    if (!/^templates\/badges\/[a-zA-Z0-9._-]+\.(png|jpe?g|webp|gif|svg)$/i.test(path)) {
      return json({ ok: false, error: "Invalid badge path." }, 400, request);
    }

    const deleted = await deleteFile(
      path,
      "Joes Studio: delete template badge " + path.split("/").pop()
    );

    return json({ ok: true, deleted }, 200, request);
  } catch (error) {
    console.error("Badge delete failed:", error);
    return json({ ok: false, error: error.message || "Badge could not be deleted." }, 500, request);
  }
}

export async function OPTIONS(request) {
  return options(request);
}