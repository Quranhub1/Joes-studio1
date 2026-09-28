import crypto from "node:crypto";

const COOKIE = "joes_user_session";
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
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

function cookieValue(req) {
  const raw = req.headers.cookie || "";
  const hit = raw.split(";").map(x => x.trim()).find(x => x.startsWith(COOKIE + "="));
  return hit ? decodeURIComponent(hit.slice(COOKIE.length + 1)) : "";
}

function authenticated(req) {
  if (!SESSION_SECRET) return false;
  const v = cookieValue(req);
  if (!v) return false;
  const [id, exp, sig] = v.split(".");
  if (!id || !exp || !sig || Number(exp) < Date.now()) return false;
  const expected = sign(id + "." + exp);
  return safeEqual(sig, expected);
}

function getCurrentUserId(req) {
  if (!SESSION_SECRET) return null;
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
  await redis("sadd", "joes:users", user.id);
}

async function createUser(userData) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const user = {
    id,
    email: String(userData.email || "").trim().toLowerCase(),
    name: String(userData.name || "").trim().slice(0, 120),
    googleId: userData.googleId || null,
    avatar: userData.avatar || null,
    subscription: {
      tier: "free",
      status: "active",
      batchesUsed: 0,
      batchLimit: 3,
      startDate: now,
      endDate: null,
      renewalDate: null
    },
    banned: false,
    bannedAt: null,
    bannedReason: null,
    createdAt: now,
    updatedAt: now
  };
  await saveUser(user);
  return user;
}

export default async function handler(req, res) {
  cors(res);

  try {
    // Sign up with email/password
    if (req.method === "POST" && new URL(req.url, "https://auth.local").searchParams.get("action") === "signup") {
      const body = req.body || {};
      const email = String(body.email || "").trim().toLowerCase();
      const name = String(body.name || "").trim();
      const password = String(body.password || "");

      if (!email || !name || !password) {
        return json(res, 400, { error: "Email, name, and password are required" });
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return json(res, 400, { error: "Invalid email format" });
      }

      if (password.length < 6) {
        return json(res, 400, { error: "Password must be at least 6 characters" });
      }

      // Check if user exists
      const existing = await redis("get", "joes:user:email:" + email);
      if (existing) {
        return json(res, 400, { error: "Email already registered" });
      }

      const user = await createUser({ email, name });
      const hashedPassword = crypto.createHash("sha256").update(password).digest("hex");
      await redis("set", "joes:user:password:" + email, hashedPassword);
      await redis("set", "joes:user:email:" + email, user.id);

      const exp = Date.now() + 30 * 24 * 60 * 60 * 1000;
      const value = user.id + "." + exp;
      const token = value + "." + sign(value);
      res.setHeader("Set-Cookie", `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000`);

      return json(res, 201, { 
        ok: true, 
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          subscription: user.subscription
        }
      });
    }

    // Login with email/password
    if (req.method === "POST" && new URL(req.url, "https://auth.local").searchParams.get("action") === "login") {
      const body = req.body || {};
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");

      if (!email || !password) {
        return json(res, 400, { error: "Email and password are required" });
      }

      const userId = await redis("get", "joes:user:email:" + email);
      if (!userId) {
        return json(res, 401, { error: "Invalid email or password" });
      }

      const storedHash = await redis("get", "joes:user:password:" + email);
      const inputHash = crypto.createHash("sha256").update(password).digest("hex");
      
      if (!storedHash || storedHash !== inputHash) {
        return json(res, 401, { error: "Invalid email or password" });
      }

      const user = await getUser(userId);
      if (!user || user.banned) {
        return json(res, 403, { error: "Account is unavailable" });
      }

      const exp = Date.now() + 30 * 24 * 60 * 60 * 1000;
      const value = user.id + "." + exp;
      const token = value + "." + sign(value);
      res.setHeader("Set-Cookie", `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000`);

      return json(res, 200, { 
        ok: true, 
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          subscription: user.subscription
        }
      });
    }

    // Google OAuth callback
    if (req.method === "POST" && new URL(req.url, "https://auth.local").searchParams.get("action") === "google") {
      if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
        return json(res, 500, { error: "Google authentication not configured" });
      }

      const body = req.body || {};
      const token = body.token;

      if (!token) {
        return json(res, 400, { error: "Google token required" });
      }

      try {
        const response = await fetch("https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=" + token);
        if (!response.ok) {
          return json(res, 401, { error: "Invalid Google token" });
        }

        const tokenInfo = await response.json();
        if (tokenInfo.issued_to !== GOOGLE_CLIENT_ID) {
          return json(res, 401, { error: "Token mismatch" });
        }

        const userResponse = await fetch("https://www.googleapis.com/oauth2/v1/userinfo?access_token=" + token);
        const googleUser = await userResponse.json();

        const email = String(googleUser.email || "").trim().toLowerCase();
        let userId = await redis("get", "joes:user:email:" + email);
        let user;

        if (userId) {
          user = await getUser(userId);
          if (!user) {
            return json(res, 500, { error: "User data corrupted" });
          }
          if (user.banned) {
            return json(res, 403, { error: "Account is banned" });
          }
          if (!user.googleId) {
            user.googleId = googleUser.id;
            user.updatedAt = new Date().toISOString();
            await saveUser(user);
          }
        } else {
          user = await createUser({
            email,
            name: googleUser.name,
            googleId: googleUser.id,
            avatar: googleUser.picture
          });
          await redis("set", "joes:user:email:" + email, user.id);
        }

        const exp = Date.now() + 30 * 24 * 60 * 60 * 1000;
        const value = user.id + "." + exp;
        const sessionToken = value + "." + sign(value);
        res.setHeader("Set-Cookie", `${COOKIE}=${encodeURIComponent(sessionToken)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000`);

        return json(res, 200, { 
          ok: true, 
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            avatar: user.avatar,
            subscription: user.subscription
          }
        });
      } catch (error) {
        console.error("Google auth error:", error);
        return json(res, 500, { error: "Google authentication failed" });
      }
    }

    // Get current user
    if (req.method === "GET" && new URL(req.url, "https://auth.local").searchParams.get("action") === "me") {
      const userId = getCurrentUserId(req);
      if (!userId) {
        return json(res, 401, { error: "Not authenticated" });
      }

      const user = await getUser(userId);
      if (!user || user.banned) {
        return json(res, 403, { error: "Account unavailable" });
      }

      return json(res, 200, { 
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          avatar: user.avatar,
          subscription: user.subscription
        }
      });
    }

    // Logout
    if (req.method === "POST" && new URL(req.url, "https://auth.local").searchParams.get("action") === "logout") {
      res.setHeader("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
      return json(res, 200, { ok: true });
    }

    return json(res, 405, { error: "Method not allowed" });
  } catch (e) {
    console.error("Auth error:", e);
    return json(res, 500, { error: e.message || "Server error" });
  }
}
