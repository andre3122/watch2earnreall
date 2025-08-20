// api/reward/complete.js — kredit task + referral bonus
const { q } = require("../_lib/db");
const { authFromHeader } = require("../_lib/auth");

const MIN_SECONDS = Number(process.env.TASK_MIN_SECONDS || 16);
const SESSION_GRACE_SEC = 600;
const CREDIT_FORCE = String(process.env.CREDIT_FORCE || "0") === "1";
const REF_PERCENT = Number(process.env.REF_PERCENT || 10);
const TASKS = { ad1: 0.01, ad2: 0.01 };

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") return res.status(405).json({ ok:false, error:"METHOD_NOT_ALLOWED" });

    const { ok, status, user } = await authFromHeader(req);
    if (!ok || !user) return res.status(status || 401).json({ ok:false, error:"AUTH_FAILED" });

    let body={}; try{ body=typeof req.body==="string"?JSON.parse(req.body):(req.body||{}) }catch{}
    const { task_id, token } = body || {};
    if (!task_id) return res.status(400).json({ ok:false, error:"BAD_INPUT" });

    // 1) cari sesi user+task
    let text = `
      SELECT id, user_id, reward, status, created_at, token
      FROM ad_sessions
      WHERE user_id=$1 AND task_id=$2`;
    const params = [user.id, task_id];
    if (token) { text += ` AND token=$3`; params.push(token); }
    text += ` ORDER BY created_at DESC LIMIT 1`;
    let rows = await q(text, params);

    // 2) fallback dalam 10 menit
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

    // 3) force create (opsional)
    if (!rows.length && CREDIT_FORCE) {
      const reward = TASKS[task_id];
      if (!reward) return res.status(400).json({ ok:false, error:"UNKNOWN_TASK" });
      await q(
        `INSERT INTO ad_sessions (user_id, task_id, token, reward, status)
         VALUES ($1,$2,$3,$4,'pending')`,
        [user.id, task_id, token || null, reward]
      );
      rows = await q(
        `SELECT id, user_id, reward, status, created_at, token
           FROM ad_sessions
          WHERE user_id=$1 AND task_id=$2
          ORDER BY created_at DESC LIMIT 1`,
        [user.id, task_id]
      );
    }

    if (!rows.length) return res.status(404).json({ ok:false, error:"NO_SESSION" });
    const s = rows[0];

    // sudah credited → balikin balance terbaru
    if (s.status === "credited") {
      const bal = (await q(`SELECT balance FROM users WHERE id=$1`, [user.id]))[0]?.balance || 0;
      return res.json({ ok:true, credited:true, amount:s.reward, balance: bal });
    }

    // tunggu minimal waktu
    const waited = await q(`SELECT EXTRACT(EPOCH FROM (now() - $1::timestamptz)) AS sec`, [s.created_at]);
    const sec = Math.floor(Number(waited[0]?.sec || 0));
    if (sec < MIN_SECONDS) {
      return res.json({ ok:true, awaiting:true, wait_seconds: MIN_SECONDS - sec });
    }

    // kredit user
    const up = (await q(
      `UPDATE users SET balance = balance + $1::numeric, updated_at=now()
         WHERE id=$2 RETURNING balance`,
      [s.reward, user.id]
    ))[0];

    await q(
      `INSERT INTO ledger (user_id, amount, reason, ref_id)
       VALUES ($1,$2::numeric,'ad_complete',$3)`,
      [user.id, s.reward, token || String(s.id)]
    );

    await q(`UPDATE ad_sessions SET status='credited', completed_at=now() WHERE id=$1`, [s.id]);

    // bonus referral (idempoten)
    if (REF_PERCENT > 0) {
      const ref = (await q(`SELECT ref_by FROM referrals WHERE user_id=$1 LIMIT 1`, [user.id]))[0];
      if (ref && ref.ref_by) {
        const refId = `ad:${s.id}`;
        const exist = await q(
          `SELECT 1 FROM ledger WHERE reason='ref_bonus' AND ref_id=$1 LIMIT 1`,
          [refId]
        );
        if (!exist.length) {
          // hitung bonus di SQL (numeric)
          const bonus = (await q(
            `WITH b AS (
               SELECT ($1::numeric * $2::numeric / 100.0) AS amt
             )
             INSERT INTO ledger (user_id, amount, reason, ref_id)
             SELECT $3, b.amt, 'ref_bonus', $4 FROM b
             RETURNING (SELECT amt FROM b) AS amt`,
            [s.reward, REF_PERCENT, ref.ref_by, refId]
          ))[0]?.amt;

          if (bonus && Number(bonus) > 0) {
            await q(
              `UPDATE users SET balance = balance + $1::numeric, updated_at=now()
                 WHERE id=$2`,
              [bonus, ref.ref_by]
            );
          }
        }
      }
    }

    return res.json({ ok:true, credited:true, amount:s.reward, balance: up?.balance || 0 });
  } catch (e) {
    console.error("reward/complete crash:", e);
    return res.status(200).json({ ok:false, error:String(e?.message||e) });
  }
};
