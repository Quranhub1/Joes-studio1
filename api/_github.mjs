const OWNER = "Quranhub1";
const REPO = "Joes-studio1";
const BRANCH = "main";
const API = "https://api.github.com";
const ALLOWED_ORIGIN = "https://quranhub1.github.io";

export function corsHeaders(request) {
  const origin = request.headers.get("origin") || "";
  const allowOrigin =
    origin === ALLOWED_ORIGIN || /^https:\/\/[^.]+\.vercel\.app$/.test(origin)
      ? origin
      : ALLOWED_ORIGIN;

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

export function json(data, status = 200, request) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(request),
    },
  });
}

export function options(request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export function githubToken() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("Vercel GITHUB_TOKEN is not configured.");
  return token;
}

export function safeFileName(value, fallback) {
  const cleaned = String(value || "")
    .normalize("NFKC")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^\.+/, "")
    .replace(/_+/g, "_")
    .slice(0, 120)
    .replace(/\.+$/, "");
  return cleaned || fallback;
}

async function github(path, init = {}) {
  const response = await fetch(API + path, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: "Bearer " + githubToken(),
      "X-GitHub-Api-Version": "2026-03-10",
      ...(init.headers || {}),
    },
  });

  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }

  if (!response.ok) {
    const message = body?.message || ("GitHub request failed (" + response.status + ")");
    const error = new Error(message);
    error.status = response.status;
    error.body = body;
    throw error;
  }

  return body;
}

export async function getFile(path) {
  try {
    return await github(
      "/repos/" + OWNER + "/" + REPO + "/contents/" +
      path.split("/").map(encodeURIComponent).join("/") +
      "?ref=" + encodeURIComponent(BRANCH)
    );
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}

export async function listDirectory(path) {
  const result = await getFile(path);
  return Array.isArray(result) ? result : [];
}

export async function putFile(path, contentBase64, message) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await getFile(path);
    const body = {
      message,
      content: contentBase64,
      branch: BRANCH,
      committer: {
        name: "Joes Studio",
        email: "actions@users.noreply.github.com",
      },
    };
    if (current?.sha) body.sha = current.sha;

    try {
      return await github(
        "/repos/" + OWNER + "/" + REPO + "/contents/" +
        path.split("/").map(encodeURIComponent).join("/"),
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
    } catch (error) {
      if (error.status === 409 && attempt < 2) continue;
      throw error;
    }
  }
  throw new Error("Could not update repository file.");
}

export async function deleteFile(path, message) {
  const current = await getFile(path);
  if (!current?.sha) return false;
  await github(
    "/repos/" + OWNER + "/" + REPO + "/contents/" +
    path.split("/").map(encodeURIComponent).join("/"),
    {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        sha: current.sha,
        branch: BRANCH,
        committer: {
          name: "Joes Studio",
          email: "actions@users.noreply.github.com",
        },
      }),
    }
  );
  return true;
}

export function base64Utf8(value) {
  return Buffer.from(String(value), "utf8").toString("base64");
}

export function base64DataUrl(dataUrl) {
  const match = String(dataUrl || "").match(/^data:[^;]+;base64,(.+)$/s);
  if (!match) throw new Error("Badge must be a base64 data URL.");
  return match[1].replace(/\s/g, "");
}

export async function updateTemplateManifest(templatePath) {
  const fileName = String(templatePath || "").split("/").pop() || "";
  const path = "templates/templates.json";
  const current = await getFile(path);
  let entries = [];

  if (current?.content) {
    try {
      entries = JSON.parse(
        Buffer.from(current.content.replace(/\n/g, ""), "base64").toString("utf8")
      );
    } catch {
      entries = [];
    }
  }

  if (!Array.isArray(entries)) entries = [];

  const id = "github-html-" + fileName
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .toLowerCase();

  const entry = {
    id,
    name: fileName,
    type: "html",
    url: "./" + String(templatePath || "").replace(/^\\.?\\//, ""),
    source: "github",
  };

  const index = entries.findIndex(item => item?.id === id || item?.url === entry.url);
  if (index >= 0) entries[index] = { ...entries[index], ...entry };
  else entries.push(entry);

  await putFile(
    path,
    base64Utf8(JSON.stringify(entries, null, 2)),
    "Joes Studio: register HTML template " + fileName
  );

  return entry;
}

export { OWNER, REPO, BRANCH };