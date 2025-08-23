// api/_lib/auth.js — validasi TMA + auto link referral
const crypto = require("crypto");
const { q } = require("./db");

function parseInitData(str) {
  const out = new Map();
  if (!str || typeof str !== "string") return out;
  const sp = new URLSearchParams(str);
  for (const [k, v] of sp.entries()) out.set(k, v);
  return out;
}
function isValidInitData(initDataStr, botToken) {
  try {
    if (!initDataStr || !botToken) return false;
    const data = parseInitData(initDataStr);
    const hash = (data.get("hash") || "").toLowerCase();
    if (!hash) return false;
    const pairs = [];
    for (const [k, v] of data.entries()) {
      if (k === "hash") continue;
      pairs.push(`${k}=${v}`);
    }
    pairs.sort();
    const check = pairs.join("\n");
    const secret = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
    const sig = crypto.createHmac("sha256", secret).update(check).digest("hex");
    const a = Buffer.from(sig, "hex");
    const b = Buffer.from(hash, "hex");
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch (_) { return false; }
}
function extractUser(req, { permissive }) {
  const hTest = req.headers["x-telegram-test-user"];
  if (hTest) { try { const u = typeof hTest === "string" ? JSON.parse(hTest) : hTest; if (u && u.id) return { id:+u.id, username:u.username||null }; } catch {} }
  const initDataStr = req.headers["x-telegram-init-data"];
  if (initDataStr) {
    const map = parseInitData(initDataStr);
    const raw = map.get("user");
    if (raw) { try { const u = JSON.parse(raw); if (u && u.id) return { id:+u.id, username:u.username||null, _map: map }; } catch {} }
  }
  if (permissive) return { id:999001, username:"tester" };
  return null;
}
async function ensureUser(uid, username) {
  await q(
    `INSERT INTO users (id, username)
     VALUES ($1, $2)
     ON CONFLICT (id) DO UPDATE
       SET username = COALESCE(EXCLUDED.username, users.username),
           updated_at = now()`,
    [uid, username || null]
  );
  const rows = await q(`SELECT id, username, balance, address, streak, last_checkin FROM users WHERE id=$1`, [uid]);
  return rows[0] || { id: uid, username, balance: 0, address: null, streak: 0, last_checkin: null };
}
// link referral sekali (user baru) dari start_param
async function attachReferralIfAny(uid, map) {
  try {
    if (!map) return;
    // skip jika sudah punya referrer
    const had = await q(`SELECT 1 FROM referrals WHERE referred_id=$1 LIMIT 1`, [uid]);
    if (had.length) return;

    const raw = map.get("start_param") || map.get("tgWebAppStartParam") || "";
    if (!raw) return;
    // izinkan format "ref_12345" atau langsung "12345"
    const m = String(raw).match(/(\d{4,})$/);
    const refId = m ? Number(m[1]) : null;
    if (!refId || refId === uid) return;

    // pastikan referrer ada
    const refU = await q(`SELECT 1 FROM users WHERE id=$1 LIMIT 1`, [refId]);
    if (!refU.length) return;

    await q(
      `INSERT INTO referrals (user_id, referred_id)
       VALUES ($1,$2)
       ON CONFLICT (referred_id) DO NOTHING`,
      [refId, uid]
    );
  } catch (e) { /* ignore */ }
}

const permissive = String(process.env.AUTH_PERMISSIVE || "0") === "1";
const BOT_TOKEN = process.env.BOT_TOKEN || "";

async function authFromHeader(req) {
  try {
    const initDataStr = req.headers["x-telegram-init-data"] || "";

    if (!permissive) {
      if (!BOT_TOKEN) { console.error("authFromHeader: NO_BOT_TOKEN"); return { ok:false, status:500, error:"NO_BOT_TOKEN" }; }
      if (!initDataStr) { console.warn("authFromHeader: NO_INITDATA"); return { ok:false, status:401, error:"AUTH_FAILED" }; }
      const okHmac = isValidInitData(initDataStr, BOT_TOKEN);
      if (!okHmac) { console.warn("authFromHeader: BAD_HMAC"); return { ok:false, status:401, error:"AUTH_FAILED" }; }
    }

    const u = extractUser(req, { permissive });
    if (!u || !u.id) { console.warn("authFromHeader: NO_USER"); return { ok:false, status:401, error:"AUTH_FAILED" }; }

    const user = await ensureUser(u.id, u.username || null);
    await attachReferralIfAny(user.id, u._map); // ⬅️ auto-link referral kalau ada start_param
// --- simpan/refresh tg_id dari initData (jika ada) ---
try{
  const init = req.headers["x-telegram-init-data"];
  if (init){
    const params = new URLSearchParams(init);
    const ujson = params.get("user");
    if (ujson){
      const tg = JSON.parse(ujson);
      if (tg?.id){
        await q(`UPDATE users SET tg_id=$1, username=$2, first_name=$3, last_name=$4, updated_at=now()
                 WHERE id=$5`,
          [Number(tg.id), tg.username||null, tg.first_name||null, tg.last_name||null, user.id]
        );
        user.tg_id = Number(tg.id);
      }
    }
  }
}catch{}

    return { ok:true, status:200, user };
  } catch (e) {
    console.error("authFromHeader crash:", e);
    return { ok:false, status:500, error:"AUTH_CRASH" };
  }
}

module.exports = { authFromHeader };
