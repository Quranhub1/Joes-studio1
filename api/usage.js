import crypto from "node:crypto";

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const SESSION_SECRET = process.env.USER_SESSION_SECRET || process.env.ADMIN_SESSION_SECRET || "change-me-in-production";

const COOKIE = "joes_user_session";

function json(res, status, body) {
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function cors(res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
}

function safeEqual(a, b) {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function sign(value) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(value).digest("base64url");
}

function cookieValue(req) {
  const raw = req.headers.cookie || "";
  const hit = raw.split(";").map(x => x.trim()).find(x => x.startsWith(COOKIE + "="));
  return hit ? decodeURIComponent(hit.slice(COOKIE.length + 1)) : "";
}

function getCurrentUserId(req) {
  const v = cookieValue(req);
  if (!v) return null;
  const [id, exp, sig] = v.split(".");
  if (!id || !exp || !sig || Number(exp) < Date.now()) return null;
  const expected = sign(id + "." + exp);
  return safeEqual(sig, expected) ? id : null;
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

async function getUser(userId) {
  const v = await redis("get", "joes:user:" + userId);
  return v ? (typeof v === "string" ? JSON.parse(v) : v) : null;
}

async function saveUser(user) {
  await redis("set", "joes:user:" + user.id, JSON.stringify(user));
}

export default async function handler(req, res) {
  cors(res);

  try {
    const userId = getCurrentUserId(req);
    if (!userId) {
      return json(res, 401, { error: "Not authenticated" });
    }

    const user = await getUser(userId);
    if (!user || user.banned) {
      return json(res, 403, { error: "Account unavailable" });
    }

    if (req.method === "GET" && new URL(req.url, "https://usage.local").searchParams.get("action") === "stats") {
      return json(res, 200, {
        subscription: user.subscription,
        batchesRemaining: Math.max(0, user.subscription.batchLimit - user.subscription.batchesUsed),
        canProcess: user.subscription.batchesUsed < user.subscription.batchLimit,
        subscriptionActive: user.subscription.status === "active"
      });
    }

    if (req.method === "POST" && new URL(req.url, "https://usage.local").searchParams.get("action") === "incrementBatch") {
      if (user.subscription.batchesUsed >= user.subscription.batchLimit) {
        return json(res, 429, {
          error: "Batch limit reached",
          limitReached: true,
          batchesUsed: user.subscription.batchesUsed,
          batchLimit: user.subscription.batchLimit
        });
      }

      user.subscription.batchesUsed = (user.subscription.batchesUsed || 0) + 1;
      user.updatedAt = new Date().toISOString();
      await saveUser(user);

      return json(res, 200, {
        batchesUsed: user.subscription.batchesUsed,
        batchLimit: user.subscription.batchLimit,
        batchesRemaining: Math.max(0, user.subscription.batchLimit - user.subscription.batchesUsed)
      });
    }

    if (req.method === "GET" && new URL(req.url, "https://usage.local").searchParams.get("action") === "paymentInfo") {
      return json(res, 200, {
        plans: {
          weekly: { price: 5000, currency: "UGX", duration: "7 days" },
          monthly: { price: 15000, currency: "UGX", duration: "30 days" },
          yearly: { price: 360000, currency: "UGX", duration: "365 days" }
        },
        instructions: "Send payment to:\nMTN Mobile Money: +256 (your number)\nAirtel Money: +256 (your number)\nInclude your email and plan type in the message.\nYou will be activated within 24 hours."
      });
    }

    return json(res, 405, { error: "Method not allowed" });
  } catch (e) {
    console.error("Usage tracking error:", e);
    return json(res, 500, { error: e.message || "Server error" });
  }
}
