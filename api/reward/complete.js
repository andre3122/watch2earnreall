// api/reward/complete.js — server-timer (NO postback) + interval FIX
const { sql } = require("../_lib/db");
const { authFromHeader } = require("../_lib/auth");

const MIN_SECONDS = Number(process.env.TASK_MIN_SECONDS || 16);
const SESSION_GRACE_SEC = 600;                                 // cari sesi <=10 menit
const CREDIT_FORCE = String(process.env.CREDIT_FORCE || "0") === "1";
const TASKS = { ad1: 0.01, ad2: 0.01 };

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") return res.status(405).json({ ok:false, error:"METHOD_NOT_ALLOWED" });

    const { ok, status, user } = await authFromHeader(req);
    if (!ok || !user) return res.status(status || 401).json({ ok:false, error:"AUTH_FAILED" });

    let body={}; try{ body=typeof req.body==="string"?JSON.parse(req.body):(req.body||{}) }catch{}
    const { task_id, token } = body || {};
    if (!task_id) return res.status(400).json({ ok:false, error:"BAD_INPUT" });

    // 1) cari sesi by token
    let { rows } = await sql`
      SELECT id, user_id, reward, status, created_at
      FROM ad_sessions
      WHERE user_id=${user.id} AND task_id=${task_id}
        ${token ? sql`AND token=${token}` : sql``}
      ORDER BY created_at DESC
      LIMIT 1
    `;

    // 2) fallback: sesi terbaru dalam 10 menit TERAKHIR (interval FIX)
    if (!rows.length) {
      rows = await sql`
        SELECT id, user_id, reward, status, created_at, token
        FROM ad_sessions
        WHERE user_id=${user.id} AND task_id=${task_id}
          AND created_at >= (now() - ${SESSION_GRACE_SEC} * interval '1 second')
        ORDER BY created_at DESC
        LIMIT 1
      `;
    }

    // 3) FORCE (opsional): bikin sesi kalau tetap nggak ada
    if (!rows.length && CREDIT_FORCE) {
      const reward = TASKS[task_id];
      if (!reward) return res.status(400).json({ ok:false, error:"UNKNOWN_TASK" });
      const ins = await sql`
        INSERT INTO ad_sessions (user_id, task_id, token, reward, status)
        VALUES (${user.id}, ${task_id}, ${token || null}, ${reward}::numeric, 'pending')
        RETURNING id, user_id, reward, status, created_at
      `;
      rows = ins.rows || ins;
    }

    if (!rows.length) return res.status(404).json({ ok:false, error:"NO_SESSION" });
    const s = rows[0];

    // idempoten: kalau sudah credited
    if (s.status === "credited") {
      const bal = await sql`SELECT balance FROM users WHERE id=${user.id}`;
      const balance = (bal.rows?.[0]?.balance ?? bal[0]?.balance);
      return res.json({ ok:true, credited:true, amount:s.reward, balance });
    }

    // hitung waktu tunggu
    const waited = await sql`SELECT EXTRACT(EPOCH FROM (now() - ${s.created_at})) AS sec`;
    const sec = Math.floor((waited.rows?.[0]?.sec ?? waited[0]?.sec) || 0);
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

    const balance = (up.rows?.[0]?.balance ?? up[0]?.balance);
    return res.json({ ok:true, credited:true, amount:s.reward, balance });
  } catch (e) {
    console.error("reward/complete crash:", e);
    // balikin detail supaya ga "Failed to reach server" gelap
    return res.status(200).json({ ok:false, error:String(e?.message||e) });
  }
};
