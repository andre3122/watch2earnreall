// api/reward/complete.js — task ads + task follow channel + referral bonus
const { q } = require("../_lib/db");
const { authFromHeader } = require("../_lib/auth");

const MIN_SECONDS = Number(process.env.TASK_MIN_SECONDS || 16);
const SESSION_GRACE_SEC = 600;
const CREDIT_FORCE = String(process.env.CREDIT_FORCE || "0") === "1";

// === Konfigurasi ===
const REF_PERCENT   = Number(process.env.REF_PERCENT || 10);
const FOLLOW_REWARD = Number(process.env.FOLLOW_REWARD || 0.02);
const BOT_TOKEN     = process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;

// daftar task iklan (tetap)
const TASKS = { ad1: 0.01, ad2: 0.01 };

// helper: cek membership via Bot API
async function isChannelMember(chat, tgId){
  if (!BOT_TOKEN || !tgId) return false;
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/getChatMember?chat_id=${encodeURIComponent(chat)}&user_id=${encodeURIComponent(tgId)}`;
  try{
    const r = await fetch(url);
    const j = await r.json();
    const st = j?.result?.status;
    return ["member","administrator","creator","restricted"].includes(st);
  }catch{ return false; }
}

module.exports = async (req, res) => {
  try{
    if (req.method !== "POST") return res.status(405).json({ ok:false, error:"METHOD_NOT_ALLOWED" });

    // --- auth
    const { ok, status, user } = await authFromHeader(req);
    if (!ok || !user) return res.status(status || 401).json({ ok:false, error:"AUTH_FAILED" });

    // --- body
    let body={}; try{ body = typeof req.body==="string" ? JSON.parse(req.body) : (req.body||{});}catch{}
    const { task_id, token } = body || {};
    if (!task_id) return res.status(400).json({ ok:false, error:"BAD_INPUT" });

    // ======================================================================
    // BRANCH: TASK FOLLOW (task_id = "follow:@username" atau "follow:-100xxxx")
    // ======================================================================
    if (String(task_id).startsWith("follow:")){
      const raw  = String(task_id).split(":")[1] || "";
      const chat = raw.startsWith("@") ? raw : `@${raw}`;

      // dapatkan tg_id user (1) dari auth, (2) dari DB, (3) dari initData header
      let tgId = user.tg_id;
      if (!tgId){
        const row = (await q(`SELECT tg_id FROM users WHERE id=$1 LIMIT 1`, [user.id]))[0];
        tgId = row?.tg_id;
      }
      if (!tgId){
        try{
          const init = req.headers["x-telegram-init-data"];
          if (init){
            const params = new URLSearchParams(init);
            const ujson = params.get("user");
            if (ujson) tgId = JSON.parse(ujson).id;
          }
        }catch{}
      }
      if (!tgId) return res.status(400).json({ ok:false, error:"NO_TG_ID" });
      if (!BOT_TOKEN) return res.status(500).json({ ok:false, error:"BOT_TOKEN_MISSING" });

      // sudah pernah dikasih?
      const refId = `follow:${raw}`;
      const exist = await q(
        `SELECT 1 FROM ledger WHERE user_id=$1 AND reason='follow' AND ref_id=$2 LIMIT 1`,
        [user.id, refId]
      );
      if (exist.length){
        const bal = (await q(`SELECT balance FROM users WHERE id=$1`, [user.id]))[0]?.balance || 0;
        return res.json({ ok:true, credited:false, already:true, balance: bal });
      }

      // cek membership
      const okFollow = await isChannelMember(chat, tgId);
      if (!okFollow){
        const bal = (await q(`SELECT balance FROM users WHERE id=$1`, [user.id]))[0]?.balance || 0;
        return res.json({ ok:false, credited:false, reason:"NOT_MEMBER", balance: bal });
      }

      // kredit user + ledger
      const up = (await q(
        `UPDATE users SET balance = balance + $1::numeric, updated_at=now()
         WHERE id=$2 RETURNING balance`,
        [FOLLOW_REWARD, user.id]
      ))[0];

      await q(
        `INSERT INTO ledger (user_id, amount, reason, ref_id)
         VALUES ($1,$2::numeric,'follow',$3)`,
        [user.id, FOLLOW_REWARD, refId]
      );

      // referral bonus (idempoten)
      if (REF_PERCENT > 0){
        const ref = (await q(`SELECT ref_by FROM referrals WHERE user_id=$1 LIMIT 1`, [user.id]))[0];
        if (ref && ref.ref_by){
          const done = await q(
            `SELECT 1 FROM ledger WHERE reason='ref_bonus' AND ref_id=$1 LIMIT 1`,
            [refId]
          );
          if (!done.length){
            const bonus = (await q(
              `WITH b AS (SELECT ($1::numeric * $2::numeric / 100.0) AS amt)
               INSERT INTO ledger (user_id, amount, reason, ref_id)
               SELECT $3, b.amt, 'ref_bonus', $4 FROM b
               RETURNING (SELECT amt FROM b) AS amt`,
              [FOLLOW_REWARD, REF_PERCENT, ref.ref_by, refId]
            ))[0]?.amt;
            if (bonus && Number(bonus) > 0){
              await q(
                `UPDATE users SET balance = balance + $1::numeric, updated_at=now()
                 WHERE id=$2`,
                [bonus, ref.ref_by]
              );
            }
          }
        }
      }

      return res.json({ ok:true, credited:true, amount: FOLLOW_REWARD, balance: up?.balance || 0 });
    }

    // ======================================================================
    // BRANCH: TASK IKLAN (punyamu — tidak diubah)
    // ======================================================================
    // 1) cari sesi
    let text = `
      SELECT id, user_id, reward, status, created_at, token
      FROM ad_sessions
      WHERE user_id=$1 AND task_id=$2`;
    const params = [user.id, task_id];
    if (token){ text += ` AND token=$3`; params.push(token); }
    text += ` ORDER BY created_at DESC LIMIT 1`;
    let rows = await q(text, params);

    // 2) fallback 10 menit
    if (!rows.length){
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
    if (!rows.length && CREDIT_FORCE){
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

    // sudah credited
    if (s.status === "credited"){
      const bal = (await q(`SELECT balance FROM users WHERE id=$1`, [user.id]))[0]?.balance || 0;
      return res.json({ ok:true, credited:true, amount:s.reward, balance: bal });
    }

    // tunggu minimal waktu
    const waited = await q(`SELECT EXTRACT(EPOCH FROM (now() - $1::timestamptz)) AS sec`, [s.created_at]);
    const sec = Math.floor(Number(waited[0]?.sec || 0));
    if (sec < MIN_SECONDS){
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

    // referral bonus
    if (REF_PERCENT > 0){
      const ref = (await q(`SELECT ref_by FROM referrals WHERE user_id=$1 LIMIT 1`, [user.id]))[0];
      if (ref && ref.ref_by){
        const refId = `ad:${s.id}`;
        const exist = await q(
          `SELECT 1 FROM ledger WHERE reason='ref_bonus' AND ref_id=$1 LIMIT 1`,
          [refId]
        );
        if (!exist.length){
          const bonus = (await q(
            `WITH b AS (SELECT ($1::numeric * $2::numeric / 100.0) AS amt)
             INSERT INTO ledger (user_id, amount, reason, ref_id)
             SELECT $3, b.amt, 'ref_bonus', $4 FROM b
             RETURNING (SELECT amt FROM b) AS amt`,
            [s.reward, REF_PERCENT, ref.ref_by, refId]
          ))[0]?.amt;
          if (bonus && Number(bonus) > 0){
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
  }catch(e){
    console.error("reward/complete crash:", e);
    return res.status(200).json({ ok:false, error:String(e?.message||e) });
  }
};
