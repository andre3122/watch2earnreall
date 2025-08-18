// api/checkin/claim.js
const { sql } = require("../_lib/db");
const { authFromHeader } = require("../_lib/auth");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ ok:false, error:"METHOD" });
  const a = await authFromHeader(req);
  if (!a.ok) return res.status(a.status || 401).json({ ok:false, error:a.error });

  const uid = BigInt(a.user.id);
  // kredit hanya kalau sudah ada ad_session 'checkin:<day>' yg status=credited (postback)
  const { rows: s } = await sql`
    SELECT reward FROM ad_sessions
    WHERE user_id=${uid} AND task_id LIKE 'checkin:%' AND status='credited'
    ORDER BY completed_at DESC NULLS LAST
    LIMIT 1
  `;
  if (!s.length) return res.status(400).json({ ok:false, error:"WAITING_POSTBACK" });

  // responkan saldo terbaru
  const { rows: u } = await sql`SELECT balance, streak, last_checkin FROM users WHERE id=${uid}`;
  return res.json({ ok:true, balance: Number(u?.[0]?.balance || 0), streak: u?.[0]?.streak || 0, lastCheckin: u?.[0]?.last_checkin || null });
};
