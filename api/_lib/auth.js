// api/_lib/auth.js — Telegram auth (strict + permissive fallback)
const { validateInitData } = require("./telegram");
const { getUserOrCreate } = require("./db");

// parse user dari raw initData (URL-encoded query string dari Telegram)
function parseInitUser(raw) {
  try {
    const params = new URLSearchParams(raw);
    const userStr = params.get("user") || params.get("tg_user");
    if (!userStr) return null;
    return JSON.parse(userStr);
  } catch {
    return null;
  }
}

async function authFromHeader(req) {
  const PERMISSIVE = String(process.env.AUTH_PERMISSIVE || "0") === "1";
  const raw = req.headers["x-telegram-init-data"] || "";
  const botToken = process.env.BOT_TOKEN;

  // 1) Ada initData dari Telegram WebApp
  if (raw) {
    if (botToken) {
      const v = validateInitData(raw, botToken, 24 * 3600);
      if (v.ok && v.data?.user) {
        const user = await getUserOrCreate(v.data.user);
        return { ok: true, user, tgUser: v.data.user, source: "initData:strict" };
      }
    }
    // Fallback permissive: terima user tanpa verifikasi hash
    if (PERMISSIVE) {
      const tgUser = parseInitUser(raw);
      if (tgUser?.id) {
        const user = await getUserOrCreate(tgUser);
        return { ok: true, user, tgUser, source: "initData:permissive" };
      }
    }
  }

  // 2) Mode dev: header x-telegram-test-user
  const test = req.headers["x-telegram-test-user"];
  if (test) {
    try {
      const tgUser = JSON.parse(test);
      if (tgUser?.id) {
        const user = await getUserOrCreate(tgUser);
        return { ok: true, user, tgUser, source: "test-header" };
      }
    } catch {}
  }

  // 3) Permissive terakhir: bikin guest dari IP kalau diminta
  if (PERMISSIVE) {
    const ip = (req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "0.0.0.0").split(",")[0].trim();
    const fakeId = Math.abs(ip.split(".").reduce((a, b) => (a * 131 + (+b || 0)) | 0, 7)) + 1000000000;
    const tgUser = { id: fakeId, username: "guest" };
    const user = await getUserOrCreate(tgUser);
    return { ok: true, user, tgUser, source: "ip-guest" };
  }

  // 4) Tidak lolos
  return { ok: false, status: 401, error: "AUTH_FAILED" };
}

module.exports = { authFromHeader };
