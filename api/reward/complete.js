// api/reward/complete.js — server-timer credit (no postback)
const { sql } = require("../_lib/db");
const { authFromHeader } = require("../_lib/auth");

// berapa detik wajib nunggu
const MIN_SECONDS = Number(process.env.TASK_MIN_SECONDS || 16);

module.exports = async (req, res) => {
  if (req.method !== "POST")
    return res.status(405).json({ ok:false, error:"METHOD_NOT_ALLOWED" });

  const { ok, status, user } = await authFromHeader(req);
  if (!ok || !user)
    return res.status(status || 401).json({ ok:false, error:"AUTH_FAILED" });

  let body = {};
  try { body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {}); } catch {}
  const { task_id, token } = body || {};
  if (!task_id || !token) return res.status(400).json({ ok:false, error:"BAD_INPUT" });

  // ambil sesi
  const { rows } = await sql`
    SELECT id, user_id, reward, status, created_at
    FROM ad_sessions
    WHERE token=${token} AND user_id=${user.id} AND task_id=${task_id}
    LIMIT 1
  `;
  if (!rows.length) return res.status(404).json({ ok:false, error:"NO_SESSION" });

  const s = rows[0];
  if (s.status === "credited") {
    const bal = await sql`SELECT balance FROM users WHERE id=${user.id}`;
    return res.json({ ok:true, credited:true, amount: s.reward, balance: bal[0]?.balance });
  }

  // hitung selisih waktu
  const waited = await sql`
    SELECT EXTRACT(EPOCH FROM (now() - ${s.created_at})) AS sec
  `;
  const sec = Math.floor(waited[0].sec || 0);

  if (sec < MIN_SECONDS) {
    return res.json({ ok:true, awaiting:true, wait_seconds: MIN_SECONDS - sec });
  }

  // kredit
  await sql`
    INSERT INTO ledger (user_id, amount, reason, ref_id)
    VALUES (${user.id}, ${s.reward}::numeric, 'ad_complete', ${token})
  `;
  const up = await sql`
    UPDATE users SET balance = balance + ${s.reward}::numeric, updated_at=now()
    WHERE id=${user.id}
    RETURNING balance
  `;
  await sql`
    UPDATE ad_sessions SET status='credited', completed_at=now() WHERE id=${s.id}
  `;

  return res.json({ ok:true, credited:true, amount: s.reward, balance: up[0].balance });
};
