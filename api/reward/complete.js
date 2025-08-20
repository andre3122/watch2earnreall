// api/reward/complete.js — kredit reward + referral commission
const { q } = require("../_lib/db");
const { authFromHeader } = require("../_lib/auth");

const MIN_SECONDS = Number(process.env.TASK_MIN_SECONDS || 16);
const SESSION_GRACE_SEC = 600;
const CREDIT_FORCE = String(process.env.CREDIT_FORCE || "0") === "1";
const REF_PERCENT = Number(process.env.REF_PERCENT || 25);       // default 25%
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

    // 1) cari sesi by token
    let text = `
      SELECT id, user_id, reward, status, created_at
      FROM ad_sessions
      WHERE user_id=$1 AND task_id=$2`;
    const params = [user.id, task_id];
    if (token) { text += ` AND token=$3`; params.push(token); }
    text += ` ORDER BY created_at DESC LIMIT 1`;
    let rows = await q(text, params);

    // 2) fallback: 10 menit terakhir
    if (!rows.length) {
      rows = await q(
        `SELECT id, user_id, reward, status, created_at, token
         FROM ad_sessions
         WHERE user_id=$1 AND task_id=$2
           AND created_at >= (now() - ${SESSION_GRACE_SEC} * interval '1 second')
         ORDER BY created_at DESC LIMIT 1`,
        [user.id, task_id]
      );
    }

    // 3) FORCE (opsional) buat sesi
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

    // tunggu minimal
    const waited = await q(`SELECT EXTRACT(EPOCH FROM (now() - $1::timestamptz)) AS sec`, [s.created_at]);
    const sec = Math.floor(Number(waited[0]?.sec || 0));
    if (sec < MIN_SECONDS) {
      return res.json({ ok:true, awaiting:true, wait_seconds: MIN_SECONDS - sec });
    }

    // 4) kredit user
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

    // 5) auto-commission referral (idempoten)
    const ref = await q(
      `SELECT user_id AS referrer_id FROM referrals WHERE referred_id=$1 LIMIT 1`,
      [user.id]
    );
    if (ref.length && REF_PERCENT > 0) {
      const refId = ref[0].referrer_id;
      if (refId && refId !== user.id) {
        // Hitung komisi di SQL (hindari floating error)
        const amtRow = await q(
          `SELECT ($1::numeric * $2::numeric) / 100 AS amt`,
          [REF_PERCENT, s.reward]
        );
        const commission = amtRow[0]?.amt || 0;

        // Cegah double-commission untuk sesi yang sama
        const dupe = await q(
          `SELECT 1 FROM ledger WHERE user_id=$1 AND reason='ref_commission' AND ref_id=$2 LIMIT 1`,
          [refId, String(s.id)]
        );
        if (!dupe.length && Number(commission) > 0) {
          await q(
            `INSERT INTO ledger (user_id, amount, reason, ref_id)
             VALUES ($1, $2, 'ref_commission', $3)`,
            [refId, commission, String(s.id)]
          );
          await q(
            `UPDATE users SET balance = balance + $1, updated_at=now() WHERE id=$2`,
            [commission, refId]
          );
        }
      }
    }

    return res.json({ ok:true, credited:true, amount:s.reward, balance: up[0]?.balance || 0 });
  } catch (e) {
    console.error("reward/complete crash:", e);
    return res.status(200).json({ ok:false, error:String(e?.message||e) });
  }
};
