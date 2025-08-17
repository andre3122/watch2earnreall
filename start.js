// api/checkin/start.js
const crypto = require("crypto");
const { sql } = require("../_lib/db");
const { authFromHeader } = require("../_lib/auth");

// reward check-in 9 hari (tetap 0.02..0.18 seperti sebelumnya)
const CHECKIN_REWARDS = [0.02,0.04,0.06,0.08,0.10,0.12,0.14,0.16,0.18];

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ ok:false, error:"METHOD_NOT_ALLOWED" });

  const { ok, status, user } = await authFromHeader(req);
  if (!ok || !user) return res.status(status || 401).json({ ok:false, error:"AUTH_FAILED" });

  // Ambil status check-in user
  const { rows: ur } = await sql`
    SELECT streak, last_checkin FROM users WHERE id=${user.id} LIMIT 1
  `;
  const streak = Number(ur?.[0]?.streak || 0);
  const last   = ur?.[0]?.last_checkin ? String(ur[0].last_checkin).slice(0,10) : null;
  const today  = todayStr();

  if (last === today) return res.status(200).json({ ok:true, allowed:false, reason:"ALREADY_TODAY" });
  if (streak >= 9)    return res.status(200).json({ ok:true, allowed:false, reason:"MAX_REACHED" });

  const day    = streak + 1;                  // 1..9
  const reward = CHECKIN_REWARDS[day-1];      // nominal hari ini
  const token  = crypto.randomBytes(16).toString("hex");
  const taskId = `checkin:${day}`;            // biar dibedakan di postback

  const base = process.env.MONETAG_AD_URL || "";
  const param = process.env.MONETAG_TOKEN_PARAM || "subid";
  const adUrl = base
    ? (base.includes("{TOKEN}") ? base.replace("{TOKEN}", token)
       : `${base}${base.includes("?") ? "&" : "?"}${param}=${token}`)
    : "";

  await sql`
    INSERT INTO ad_sessions (user_id, task_id, token, reward, status)
    VALUES (${user.id}, ${taskId}, ${token}, ${reward}::numeric, 'pending')
  `;

  res.status(200).json({ ok:true, allowed:true, token, day, reward, ad_url: adUrl });
};
