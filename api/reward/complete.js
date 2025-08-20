// api/reward/complete.js — FIX: tanpa nested SQL & tanpa "INTERVAL $3"
const { q } = require("../_lib/db");
const { authFromHeader } = require("../_lib/auth");

const MIN_SECONDS = Number(process.env.TASK_MIN_SECONDS || 16);
const SESSION_GRACE_SEC = 600;         // cari sesi <=10 menit
const CREDIT_FORCE = String(process.env.CREDIT_FORCE || "0") === "1";
const TASKS = { ad1: 0.01, ad2: 0.01 };

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST")
      return res.status(405).json({ ok:false, error:"METHOD_NOT_ALLOWED" });

    const { ok, status, user } = await authFromHeader(req);
    if (!ok || !user) return res.status(status || 401).json({ ok:false, error:"AUTH_FAILED" });

    let body={}; try{ body=typeof req.body==="string"?JSON.parse(req.body):(req.body||{}) }catch{}
    const { task_id, token } = body || {};
    if (!task_id) return res.status(400).json({ ok:false, error:"BAD_INPUT" });

    // 1) cari sesi by token (TANPA nested template)
    let text = `
      SELECT id, user_id, reward, status, created_at
      FROM ad_sessions
      WHERE user_id=$1 AND task_id=$2
    `;
    const params = [user.id, task_id];
    if (token) { text += ` AND token=$3`; params.push(token); }
    text += ` ORDER BY created_at DESC LIMIT 1`;

    let rows = await q(text, params);

    // 2) fallback: sesi terbaru user+task dalam 10 menit (interval di-inline, bukan parameter)
    if (!rows.length) {
      const text2 = `
        SELECT id, user_id, reward, status, created_at, token
        FROM ad_sessions
        WHERE user_id=$1 AND task_id=$2
          AND created_at >= (now() - ${SESSION_GRACE_SEC} * interval '1 second')
        ORDER BY created_at DESC
        LIMIT 1
      `;
      rows = await q(text2, [user.id, task_id]);
    }

    // 3) FORCE (opsional): bikin sesi kalau tetap tidak ada
    if (!rows.length && CREDIT_FORCE) {
      const reward = TASKS[task_id];
      if (!reward) return res.status(400).json({ ok:false, error:"UNKNOWN_TASK" });
      await q(
        `INSERT INTO ad_sessions (user_id, task_id, token, reward, status)
         VALUES ($1,$2,$3,$4,'pending')`,
        [user.id, task_id, token || null, reward]
      );
      rows = await q(
        `SELECT id, user_id, reward, status, created_at
         FROM ad_sessions
         WHERE user_id=$1 AND task_id=$2
         ORDER BY created_at DESC LIMIT 1`,
        [user.id, task_id]
      );
    }

    if (!rows.length) return res.status(404).json({ ok:false, error:"NO_SESSION" });
    const s = rows[0];

    // idempoten
    if (s.status === "credited") {
      const bal = await q(`SELECT balance FROM users WHERE id=$1`, [user.id]);
      return res.json({ ok:true, credited:true, amount:s.reward, balance: bal[0]?.balance || 0 });
    }

    // hitung umur sesi (di SQL, aman)
    const waited = await q(`SELECT EXTRACT(EPOCH FROM (now() - $1::timestamptz)) AS sec`, [s.created_at]);
    const sec = Math.floor(Number(waited[0]?.sec || 0));
    if (sec < MIN_SECONDS) {
      return res.json({ ok:true, awaiting:true, wait_seconds: MIN_SECONDS - sec });
    }

    // kredit
    await q(
      `INSERT INTO ledger (user_id, amount, reason, ref_id)
       VALUES ($1,$2,'ad_complete',$3)`,
      [user.id, s.reward, token || String(s.id)]
    );
    const up = await q(
      `UPDATE users SET balance = balance + $1, updated_at=now()
       WHERE id=$2 RETURNING balance`,
      [s.reward, user.id]
    );
    await q(`UPDATE ad_sessions SET status='credited', completed_at=now() WHERE id=$1`, [s.id]);

    return res.json({ ok:true, credited:true, amount:s.reward, balance: up[0]?.balance || 0 });
  } catch (e) {
    console.error("reward/complete crash:", e);
    return res.status(200).json({ ok:false, error:String(e?.message||e) });
  }
};
