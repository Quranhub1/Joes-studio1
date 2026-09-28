import crypto from "node:crypto";

const COOKIE = "joes_admin_session";
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

function json(res, status, body) {
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}
function cors(res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
}
function sign(value) {
  return crypto.createHmac("sha256", process.env.ADMIN_SESSION_SECRET || "").update(value).digest("base64url");
}
function cookieValue(req) {
  const raw = req.headers.cookie || "";
  const hit = raw.split(";").map(x => x.trim()).find(x => x.startsWith(COOKIE + "="));
  return hit ? decodeURIComponent(hit.slice(COOKIE.length + 1)) : "";
}
function authenticated(req) {
  if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD || !process.env.ADMIN_SESSION_SECRET) return false;
  const v = cookieValue(req);
  if (!v) return false;
  const [u, exp, sig] = v.split(".");
  if (!u || !exp || !sig || Number(exp) < Date.now()) return false;
  const expected = sign(u + "." + exp);
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}
async function redis(command, ...args) {
  if (!REDIS_URL || !REDIS_TOKEN) throw new Error("Redis storage is not configured");
  const r = await fetch(REDIS_URL, {
    method: "POST",
    headers: { Authorization: "Bearer " + REDIS_TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify([command, ...args])
  });
  if (!r.ok) throw new Error("Redis request failed");
  const data = await r.json();
  return data.result;
}
async function listSubscriptions() {
  const keys = await redis("smembers", "joes:subscriptions");
  if (!keys?.length) return [];
  const values = await Promise.all(keys.map(k => redis("get", "joes:subscription:" + k)));
  return values.filter(Boolean).map(v => typeof v === "string" ? JSON.parse(v) : v)
    .sort((a,b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
}
async function getSubscription(id) {
  const v = await redis("get", "joes:subscription:" + id);
  return v ? (typeof v === "string" ? JSON.parse(v) : v) : null;
}
function clean(input = {}) {
  const now = new Date().toISOString();
  const id = String(input.id || crypto.randomUUID());
  return {
    id,
    name: String(input.name || "").trim().slice(0,120),
    email: String(input.email || "").trim().toLowerCase().slice(0,200),
    plan: String(input.plan || "monthly").slice(0,40),
    status: ["pending","active","expired","cancelled"].includes(input.status) ? input.status : "pending",
    startAt: input.startAt ? new Date(input.startAt).toISOString() : now,
    endAt: input.endAt ? new Date(input.endAt).toISOString() : null,
    banned: Boolean(input.banned),
    bannedAt: input.banned ? (input.bannedAt || now) : null,
    notes: String(input.notes || "").slice(0,1000),
    updatedAt: now
  };
}
export default async function handler(req, res) {
  cors(res);
  try {
    if (req.method === "POST" && req.url === "/api/admin/login") {
      const body = req.body || {};
      const ok = crypto.timingSafeEqual(Buffer.from(String(body.username || "")), Buffer.from(String(process.env.ADMIN_USERNAME || ""))) &&
        crypto.timingSafeEqual(Buffer.from(String(body.password || "")), Buffer.from(String(process.env.ADMIN_PASSWORD || "")));
      if (!ok) return json(res, 401, { error: "Invalid admin credentials" });
      const exp = Date.now() + 8 * 60 * 60 * 1000;
      const value = process.env.ADMIN_USERNAME + "." + exp;
      const token = value + "." + sign(value);
      res.setHeader("Set-Cookie", `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`);
      return json(res, 200, { ok: true });
    }
    if (req.method === "POST" && req.url === "/api/admin/logout") {
      res.setHeader("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
      return json(res, 200, { ok: true });
    }
    if (!authenticated(req)) return json(res, 401, { error: "Unauthorized" });

    if (req.method === "GET") return json(res, 200, { subscriptions: await listSubscriptions() });

    if (req.method === "PUT" || req.method === "POST") {
      const item = clean(req.body || {});
      await redis("set", "joes:subscription:" + item.id, JSON.stringify(item));
      await redis("sadd", "joes:subscriptions", item.id);
      return json(res, 200, item);
    }

    if (req.method === "DELETE") {
      const id = new URL(req.url, "https://admin.local").searchParams.get("id");
      if (!id) return json(res, 400, { error: "Missing id" });
      await redis("del", "joes:subscription:" + id);
      await redis("srem", "joes:subscriptions", id);
      return json(res, 200, { ok: true });
    }
    return json(res, 405, { error: "Method not allowed" });
  } catch (e) {
    return json(res, 500, { error: e.message || "Server error" });
  }
}
