// api/reward/complete.js — task ads + task follow channel + referral bonus (tahan banting)
const { q } = require("../_lib/db");
const { authFromHeader } = require("../_lib/auth");

const MIN_SECONDS = Number(process.env.TASK_MIN_SECONDS || 16);
const SESSION_GRACE_SEC = 600;
const CREDIT_FORCE = String(process.env.CREDIT_FORCE || "0") === "1";

// === Konfigurasi ===
const REF_PERCENT   = Number(process.env.REF_PERCENT || 10);
const FOLLOW_REWARD = Number(process.env.FOLLOW_REWARD || 0.02);
const BOT_TOKEN     = process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
const MAX_ADS_PER_DAY = Number(process.env.MAX_ADS_PER_DAY || 50);

// daftar task iklan (tetap)
const TASKS = { ad1: 0.01, ad2: 0.01 };

// ---- helpers --------------------------------------------------------------
async function isChannelMember(chat, tgId) {
  if (!BOT_TOKEN || !tgId) return false;
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/getChatMember?chat_id=${encodeURIComponent(chat)}&user_id=${encodeURIComponent(tgId)}`;
  try {
    const r = await fetch(url);
    const j = await r.json();
    const st = j?.result?.status;
    return ["member", "administrator", "creator", "restricted"].includes(st);
  } catch { return false; }
}

// Deteksi nama kolom referrer di tabel `referrals`
async function getReferrerId(userId) {
  try {
    const cols = await q(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema='public' AND table_name='referrals'`
    );
    const names = cols.map(r => r.column_name);
    const refCol = ["ref_by", "referrer_id", "referred_by", "referrer"]
      .find(n => names.includes(n));
    if (!refCol) return null;

    const row = (await q(
      `SELECT ${refCol} AS ref_by FROM referrals WHERE user_id=$1 LIMIT 1`,
      [userId]
    ))[0];
    return row?.ref_by || null;
  } catch {
    return null;
  }
}

// --------------------------------------------------------------------------
module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") return res.status(405).json({ ok:false, error:"METHOD_NOT_ALLOWED" });

    // auth
    const { ok, status, user } = await authFromHeader(req);
    if (!ok || !user) return res.status(status || 401).json({ ok:false, error:"AUTH_FAILED" });

    // body
    let body = {};
    try { body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {}); } catch {}
    const { task_id, token } = body || {};
    if (!task_id) return res.status(400).json({ ok:false, error:"BAD_INPUT" });

    // ======================================================================
    // TASK FOLLOW (task_id = "follow:@username" atau "follow:-100xxxx")
    // ======================================================================
    if (String(task_id).startsWith("follow:")) {
      const raw = String(task_id).slice(7).trim();
      if (!raw) return res.json({ ok:false, error:"BAD_INPUT" });

      // jika numeric id (-100...), jangan ditambah '@'
      const isNumericId = /^-?\d+$/.test(raw);
      const chat = isNumericId ? raw : (raw.startsWith("@") ? raw : `@${raw}`);

      // ambil tg_id user dari auth → DB → initData
      let tgId = user.tg_id;
      if (!tgId) {
        tgId = (await q(`SELECT tg_id FROM users WHERE id=$1 LIMIT 1`, [user.id]))[0]?.tg_id;
      }
      if (!tgId) {
        try {
          const init = req.headers["x-telegram-init-data"];
          if (init) {
            const p = new URLSearchParams(init);
            const ujson = p.get("user");
            if (ujson) tgId = JSON.parse(ujson).id;
          }
        } catch {}
      }
      if (!tgId)      return res.json({ ok:false, error:"NO_TG_ID" });
      if (!BOT_TOKEN) return res.json({ ok:false, error:"BOT_TOKEN_MISSING" });

      // sudah pernah dikredit?
      const refId = `follow:${chat}`;
      const exist = await q(
        `SELECT 1 FROM ledger WHERE user_id=$1 AND reason='follow' AND ref_id=$2 LIMIT 1`,
        [user.id, refId]
      );
      if (exist.length) {
        const bal = (await q(`SELECT balance FROM users WHERE id=$1`, [user.id]))[0]?.balance || 0;
        return res.json({ ok:true, credited:false, already:true, balance: bal });
      }

      // cek membership channel
      const okFollow = await isChannelMember(chat, tgId);
      if (!okFollow) {
        const bal = (await q(`SELECT balance FROM users WHERE id=$1`, [user.id]))[0]?.balance || 0;
        return res.json({ ok:false, error:"NOT_MEMBER", credited:false, balance: bal });
      }

      // kredit user + ledger (selalu jalan)
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

      // bonus referral → jangan bikin gagal kalau struktur tabel beda
      try {
        if (REF_PERCENT > 0) {
          const refBy = await getReferrerId(user.id);
          if (refBy) {
            const done = await q(
              `SELECT 1 FROM ledger WHERE reason='ref_bonus' AND ref_id=$1 LIMIT 1`,
              [refId]
            );
            if (!done.length) {
              const bonus = (await q(
                `WITH b AS (SELECT ($1::numeric * $2::numeric / 100.0) AS amt)
                 INSERT INTO ledger (user_id, amount, reason, ref_id)
                 SELECT $3, b.amt, 'ref_bonus', $4 FROM b
                 RETURNING (SELECT amt FROM b) AS amt`,
                [FOLLOW_REWARD, REF_PERCENT, refBy, refId]
              ))[0]?.amt;
              if (Number(bonus) > 0) {
                await q(
                  `UPDATE users SET balance = balance + $1::numeric, updated_at=now()
                   WHERE id=$2`,
                  [bonus, refBy]
                );
              }
            }
          }
        }
      } catch (e) {
        console.warn("referral bonus skipped:", e?.message || e);
      }

      return res.json({ ok:true, credited:true, amount: FOLLOW_REWARD, balance: up?.balance || 0 });
    }

    // ======================================================================
    // TASK IKLAN (tidak diubah)
    // ======================================================================

    // ===== LIMIT HARIAN untuk task iklan (ad_complete) =====
    try {
      const rowCnt = await q(
        `SELECT COUNT(*)::int AS c
           FROM ledger
          WHERE user_id = $1
            AND reason  = 'ad_complete'
            AND created_at::date = CURRENT_DATE`,
        [user.id]
      );
      const doneToday = rowCnt[0]?.c || 0;
      if (doneToday >= MAX_ADS_PER_DAY) {
        return res.json({
          ok: false,
          error: 'DAILY_LIMIT',
          max: MAX_ADS_PER_DAY,
          done_today: doneToday
        });
      }
    } catch {}
    // ===== END LIMIT HARIAN =====

    let text = `
      SELECT id, user_id, reward, status, created_at, token
      FROM ad_sessions
      WHERE user_id=$1 AND task_id=$2`;
    const params = [user.id, task_id];
    if (token) { text += ` AND token=$3`; params.push(token); }
    text += ` ORDER BY created_at DESC LIMIT 1`;
    let rows = await q(text, params);

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

    if (s.status === "credited") {
      const bal = (await q(`SELECT balance FROM users WHERE id=$1`, [user.id]))[0]?.balance || 0;
      return res.json({ ok:true, credited:true, amount:s.reward, balance: bal });
    }

    const waited = await q(`SELECT EXTRACT(EPOCH FROM (now() - $1::timestamptz)) AS sec`, [s.created_at]);
    const sec = Math.floor(Number(waited[0]?.sec || 0));
    if (sec < MIN_SECONDS) {
      return res.json({ ok:true, awaiting:true, wait_seconds: MIN_SECONDS - sec });
    }

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

    if (REF_PERCENT > 0) {
      try {
        const refBy = await getReferrerId(user.id);
        if (refBy) {
          const refId = `ad:${s.id}`;
          const exist = await q(
            `SELECT 1 FROM ledger WHERE reason='ref_bonus' AND ref_id=$1 LIMIT 1`,
            [refId]
          );
          if (!exist.length) {
            const bonus = (await q(
              `WITH b AS (SELECT ($1::numeric * $2::numeric / 100.0) AS amt)
               INSERT INTO ledger (user_id, amount, reason, ref_id)
               SELECT $3, b.amt, 'ref_bonus', $4 FROM b
               RETURNING (SELECT amt FROM b) AS amt`,
              [s.reward, REF_PERCENT, refBy, refId]
            ))[0]?.amt;
            if (Number(bonus) > 0) {
              await q(
                `UPDATE users SET balance = balance + $1::numeric, updated_at=now()
                 WHERE id=$2`,
                [bonus, refBy]
              );
            }
          }
        }
      } catch (e) {
        console.warn("referral bonus (ads) skipped:", e?.message || e);
      }
    }

    return res.json({ ok:true, credited:true, amount:s.reward, balance: up?.balance || 0 });
  } catch (e) {
    console.error("reward/complete crash:", e);
    return res.status(200).json({ ok:false, error:String(e?.message || e) });
  }
};
