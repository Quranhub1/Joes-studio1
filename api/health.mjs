import { json, options } from "./_github.mjs";

export async function GET(request) {
  return json({ ok: true, service: "joes-studio-template-writer" }, 200, request);
}

export async function OPTIONS(request) {
  return options(request);
}