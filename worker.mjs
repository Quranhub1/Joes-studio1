import { Buffer } from "node:buffer";

const HANDLERS = {
  "/api/auth": () => import("./api/auth.js"),
  "/api/admin": () => import("./api/admin.js"),
  "/api/usage": () => import("./api/usage.js"),
  "/api/payments": () => import("./api/payments.js"),
  "/api/subscriptions": () => import("./api/subscriptions.js"),
  "/api/templates/save": () => import("./api/templates/save.mjs"),
  "/api/badges/save": () => import("./api/badges/save.mjs"),
  "/api/badges/delete": () => import("./api/badges/delete.mjs"),
  "/api/fal-enhance": () => import("./api/fal-enhance.mjs"),
};

const ENV_KEYS = [
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "FREE_BATCH_LIMIT",
  "SESSION_TTL_SECONDS",
  "APP_ORIGIN",
  "FRONTEND_ORIGIN",
  "API_ORIGIN",
  "APP_URL",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REDIRECT_URI",
  "ADMIN_USERNAME",
  "ADMIN_PASSWORD",
  "ADMIN_EMAIL",
  "ADMIN_COOKIE_DOMAIN",
  "PAYMENT_METHOD",
  "PAYMENT_ACCOUNT_NAME",
  "PAYMENT_ACCOUNT_NUMBER",
  "PAYMENT_CURRENCY",
  "PRO_PRICE",
  "USER_SESSION_SECRET",
  "FAL_KEY",
  "GITHUB_TOKEN",
  "GITHUB_OWNER",
  "GITHUB_REPO",
  "GITHUB_BRANCH",
];

function configureProcessEnv(env) {
  if (!globalThis.process?.env) return;
  for (const key of ENV_KEYS) {
    const value = env[key];
    if (value !== undefined && value !== null) globalThis.process.env[key] = String(value);
  }
}

function toNodeRequest(request) {
  let body = undefined;
  const method = request.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    body = undefined;
  }

  const headers = {};
  for (const [key, value] of request.headers) headers[key.toLowerCase()] = value;

  return {
    method,
    url: new URL(request.url).pathname + new URL(request.url).search,
    headers,
    body,
    async json() {
      return request.json();
    },
    async text() {
      return request.text();
    },
  };
}

async function prepareBody(request, req) {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD") {
    req.body = undefined;
    return;
  }
  const type = request.headers.get("content-type") || "";
  const raw = await request.text();
  if (!raw) {
    req.body = {};
    return;
  }
  if (type.includes("application/json")) {
    try {
      req.body = JSON.parse(raw);
    } catch {
      req.body = {};
    }
  } else {
    req.body = raw;
  }
}

class NodeResponse {
  constructor() {
    this.statusCode = 200;
    this.headers = new Map();
    this.body = "";
  }
  status(code) {
    this.statusCode = Number(code) || 200;
    return this;
  }
  setHeader(name, value) {
    this.headers.set(String(name).toLowerCase(), value);
    return this;
  }
  getHeader(name) {
    return this.headers.get(String(name).toLowerCase());
  }
  end(body = "") {
    this.body = body == null ? "" : String(body);
    return this;
  }
}

function responseFromNode(res) {
  const headers = new Headers();
  for (const [name, value] of res.headers) {
    if (name === "set-cookie" && Array.isArray(value)) {
      for (const cookie of value) headers.append("Set-Cookie", String(cookie));
    } else if (value !== undefined && value !== null) {
      headers.set(name, Array.isArray(value) ? value.join(", ") : String(value));
    }
  }
  return new Response(res.body, { status: res.statusCode, headers });
}

async function dispatchVercelHandler(request, env, handlerLoader) {
  configureProcessEnv(env);
  const req = toNodeRequest(request);
  await prepareBody(request, req);
  const res = new NodeResponse();
  const mod = await handlerLoader();
  await mod.default(req, res);
  return responseFromNode(res);
}

async function health(request, env) {
  configureProcessEnv(env);
  const mod = await import("./api/health.mjs");
  return mod.GET(request);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return health(request, env);
    }

    const loader = HANDLERS[url.pathname];
    if (loader) {
      try {
        return await dispatchVercelHandler(request, env, loader);
      } catch (error) {
        console.error("Joes Studio API error:", error);
        return new Response(JSON.stringify({
          error: error?.message || "Server error"
        }), {
          status: 500,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store"
          }
        });
      }
    }

    return env.ASSETS.fetch(request);
  }
};
