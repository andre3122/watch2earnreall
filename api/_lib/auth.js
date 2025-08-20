// api/_lib/auth.js
const crypto = require("crypto");
const { q } = require("./db"); // tetap di folder yang sama (_lib)

/** parse initData string "a=b&c=d" -> Map */
function parseInitData(str) {
  const out = new Map();
  if (!str || typeof str !== "string") return out;
  const sp = new URLSearchParams(str);
  for (const [k, v] of sp.entries()) out.set(k, v);
  return out;
}

/** hitung HMAC sesuai dok TMA */
function isValidInitData(initDataStr, botToken) {
  try {
    if (!initDataStr || !botToken) return false;
    const data = parseInitData(initDataStr);
    const hash = (data.get("hash") || "").toLowerCase();
    if (!hash) return false;

    // build data-check string (urut key asc, tanpa "hash")
    const pairs = [];
    for (const [k, v] of data.entries()) {
      if (k === "hash") continue;
      pairs.push(`${k}=${v}`);
    }
    pairs.sort();
    const check = pairs.join("\n");

    const secret = crypto.createHmac("sha256", "WebAppData")
      .update(botToken)
      .digest();
    const sig = crypto.createHmac("sha256", secret)
      .update(check)
      .digest("hex");

    // timing-safe compare
    const a = Buffer.from(sig, "hex");
    const b = Buffer.from(hash, "hex");
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch (_) {
    return false;
  }
}

/** ambil data user dari initData / header test */
function extractUser(req, { permissive }) {
  // 1) header test (opsional)
  const hTest = req.headers["x-telegram-test-user"];
  if (hTest) {
    try {
      const u = typeof hTest === "string" ? JSON.parse(hTest) : hTest;
      if (u && u.id) return { id: Number(u.id), username: u.username || null };
    } catch {}
  }

  // 2) initData TMA
  const initDataStr = req.headers["x-telegram-init-data"];
  if (initDataStr) {
    const map = parseInitData(initDataStr);
    const raw = map.get("user");
    if (raw) {
      try {
        const u = JSON.parse(raw);
        if (u && u.id) return { id: Number(u.id), username: u.username || null };
      } catch {}
    }
  }

  // 3) fallback permissive -> user tester
  if (permissive) {
    return { id: 999001, username: "tester" };
  }

  return null;
}

/** buat user kalau belum ada */
async function ensureUser(uid, username) {
  // kolom lain di tabel users sebaiknya punya DEFAULT (balance=0, created_at=now(), dll)
  await q(
    `INSERT INTO users (id, username)
     VALUES ($1, $2)
     ON CONFLICT (id) DO UPDATE
       SET username = COALESCE(EXCLUDED.username, users.username),
           updated_at = now()`,
    [uid, username || null]
  );

  const rows = await q(
    `SELECT id, username, balance, address, streak, last_checkin
     FROM users
     WHERE id=$1 LIMIT 1`,
    [uid]
  );
  return rows[0] || { id: uid, username, balance: 0, address: null, streak: 0, last_checkin: null };
}

const permissive = String(process.env.AUTH_PERMISSIVE || "0") === "1";
const BOT_TOKEN = process.env.BOT_TOKEN || "";

async function authFromHeader(req) {
  try {
    const initDataStr = req.headers["x-telegram-init-data"] || "";

    if (!permissive) {
      if (!BOT_TOKEN) {
        console.error("authFromHeader: NO_BOT_TOKEN");
        return { ok: false, status: 500, error: "NO_BOT_TOKEN" };
      }
      if (!initDataStr) {
        console.warn("authFromHeader: NO_INITDATA");
        return { ok: false, status: 401, error: "AUTH_FAILED" };
      }
      const okHmac = isValidInitData(initDataStr, BOT_TOKEN);
      if (!okHmac) {
        console.warn("authFromHeader: BAD_HMAC");
        return { ok: false, status: 401, error: "AUTH_FAILED" };
      }
    }

    const u = extractUser(req, { permissive });
    if (!u || !u.id) {
      console.warn("authFromHeader: NO_USER");
      return { ok: false, status: 401, error: "AUTH_FAILED" };
    }

    const user = await ensureUser(u.id, u.username || null);
    return { ok: true, status: 200, user };
  } catch (e) {
    console.error("authFromHeader crash:", e);
    return { ok: false, status: 500, error: "AUTH_CRASH" };
  }
}

module.exports = { authFromHeader };
