// api/reward/complete.js — server-timer credit (robust + fallback)
const { sql } = require("../_lib/db");
const { authFromHeader } = require("../_lib/auth");

const MIN_SECONDS = Number(process.env.TASK_MIN_SECONDS || 16);
const SESSION_GRACE_SEC = 600; // 10 menit: fallback cari sesi terakhir jika token tidak cocok

module.exports = async (req, res) => {
  if (req.method !== "POST")
    return res.status(405).json({ ok:false, error:"METHOD_NOT_ALLOWED" });

  const { ok, status, user } = await authFromHeader(req);
  if (!ok || !user)
    return res.status(status || 401).json({ ok:false, error:"AUTH_FAILED" });

  // parse body
  let body = {};
  try { body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {}); } catch {}
  const { task_id, token } = body || {};
  if (!task_id) return res.status(400).json({ ok:false, error:"BAD_INPUT" });

  // 1) coba pakai token
  let { rows } = await sql`
    SELECT id, user_id, reward, status, created_at
    FROM ad_sessions
    WHERE user_id=${user.id} AND task_id=${task_id}
      ${token ? sql`AND token=${token}` : sql``}
    ORDER BY created_at DESC
    LIMIT 1
  `;

  // 2) fallback kalau gak ketemu: ambil sesi terbaru user+task dalam 10 menit terakhir
  if (!rows.length) {
    rows = await sql`
      SELECT id, user_id, reward, status, created_at, token
      FROM ad_sessions
      WHERE user_id=${user.id} AND task_id=${task_id}
        AND created_at >= (now() - interval '${SESSION_GRACE_SEC} seconds')
      ORDER BY created_at DESC
      LIMIT 1
    `;
    if (!rows.length) return res.status(404).json({ ok:false, error:"NO_SESSION" });
  }

  const s = rows[0];

  if (s.status === "credited") {
    const bal = await sql`SELECT balance FROM users WHERE id=${user.id}`;
    return res.json({ ok:true, credited:true, amount: s.reward, balance: bal[0]?.balance });
  }

  // cek waktu
  const waited = await sql`SELECT EXTRACT(EPOCH FROM (now() - ${s.created_at})) AS sec`;
  const sec = Math.floor(waited[0].sec || 0);
  if (sec < MIN_SECONDS) {
    return res.json({ ok:true, awaiting:true, wait_seconds: MIN_SECONDS - sec });
  }

  // kredit
  await sql`
    INSERT INTO ledger (user_id, amount, reason, ref_id)
    VALUES (${user.id}, ${s.reward}::numeric, 'ad_complete', ${token || String(s.id)})
  `;
  const up = await sql`
    UPDATE users SET balance = balance + ${s.reward}::numeric, updated_at=now()
    WHERE id=${user.id}
    RETURNING balance
  `;
  await sql`UPDATE ad_sessions SET status='credited', completed_at=now() WHERE id=${s.id}`;

  return res.json({ ok:true, credited:true, amount: s.reward, balance: up[0].balance });
};
