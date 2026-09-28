import crypto from "node:crypto";

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin";
const SESSION_SECRET = process.env.USER_SESSION_SECRET || "change-me-in-production";

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

function getCurrentUserId(req) {
  const COOKIE = "joes_user_session";
  const raw = req.headers.cookie || "";
  const hit = raw.split(";").map(x => x.trim()).find(x => x.startsWith(COOKIE + "="));
  const v = hit ? decodeURIComponent(hit.slice(COOKIE.length + 1)) : "";
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
  await redis("sadd", "joes:users", user.id);
}

async function listUsers() {
  const userIds = await redis("smembers", "joes:users") || [];
  const users = await Promise.all(userIds.map(async id => {
    try {
      return await getUser(id);
    } catch (_) {
      return null;
    }
  }));
  return users.filter(Boolean).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export default async function handler(req, res) {
  cors(res);

  try {
    // Admin authentication
    const adminPassword = new URL(req.url, "https://admin.local").searchParams.get("adminPassword");
    const isAdmin = adminPassword && safeEqual(adminPassword, ADMIN_PASSWORD);

    if (!isAdmin) {
      return json(res, 403, { error: "Admin authentication required" });
    }

    // Get all users
    if (req.method === "GET") {
      const users = await listUsers();
      return json(res, 200, { users });
    }

    // Update user subscription/status
    if (req.method === "PUT") {
      const body = req.body || {};
      const userId = String(body.userId || "");
      if (!userId) return json(res, 400, { error: "userId required" });

      const user = await getUser(userId);
      if (!user) return json(res, 404, { error: "User not found" });

      // Update subscription tier
      if (Object.prototype.hasOwnProperty.call(body, "tier")) {
        user.subscription.tier = String(body.tier).toLowerCase();
        if (user.subscription.tier === "pro") {
          user.subscription.batchLimit = 999999;
          if (body.planDuration) {
            const startDate = new Date();
            let endDate = new Date();
            if (body.planDuration === "weekly") {
              endDate.setDate(endDate.getDate() + 7);
            } else if (body.planDuration === "monthly") {
              endDate.setMonth(endDate.getMonth() + 1);
            } else if (body.planDuration === "yearly") {
              endDate.setFullYear(endDate.getFullYear() + 1);
            }
            user.subscription.startDate = startDate.toISOString();
            user.subscription.endDate = endDate.toISOString();
            user.subscription.renewalDate = endDate.toISOString();
          }
        } else if (user.subscription.tier === "free") {
          user.subscription.batchLimit = 3;
          user.subscription.endDate = null;
          user.subscription.renewalDate = null;
        }
      }

      // Update status
      if (Object.prototype.hasOwnProperty.call(body, "status")) {
        user.subscription.status = String(body.status).toLowerCase();
      }

      // Reset batches used
      if (Object.prototype.hasOwnProperty.call(body, "resetBatches")) {
        user.subscription.batchesUsed = 0;
      }

      // Ban/Unban user
      if (Object.prototype.hasOwnProperty.call(body, "banned")) {
        user.banned = !!body.banned;
        if (user.banned) {
          user.bannedAt = new Date().toISOString();
          user.bannedReason = String(body.bannedReason || "");
        } else {
          user.bannedAt = null;
          user.bannedReason = null;
        }
      }

      user.updatedAt = new Date().toISOString();
      await saveUser(user);

      return json(res, 200, { user });
    }

    // Delete user
    if (req.method === "DELETE") {
      const userId = new URL(req.url, "https://admin.local").searchParams.get("userId");
      if (!userId) return json(res, 400, { error: "userId required" });

      await redis("del", "joes:user:" + userId);
      await redis("srem", "joes:users", userId);
      return json(res, 200, { ok: true });
    }

    return json(res, 405, { error: "Method not allowed" });
  } catch (e) {
    console.error("Subscriptions error:", e);
    return json(res, 500, { error: e.message || "Server error" });
  }
}
