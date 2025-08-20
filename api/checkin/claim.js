// api/checkin/claim.js — Daily Check-in (Day1=0.02 → Day9=0.18) dgn timezone lokal
const { q } = require("../_lib/db");
const { authFromHeader } = require("../_lib/auth");

const SCHEDULE = ["0.02","0.04","0.06","0.08","0.10","0.12","0.14","0.16","0.18"];
const APP_TZ = process.env.APP_TZ || 'Asia/Jakarta';

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ ok:false, error:"METHOD_NOT_ALLOWED" });

  const a = await authFromHeader(req);
  if (!a.ok) return res.status(a.status || 401).json({ ok:false, error:a.error });
  const uid = a.user.id;

  try {
    // tanggal lokal (Asia/Jakarta)
    const d = (await q(
      `SELECT (now() AT TIME ZONE $1)::date AS today,
              ((now() AT TIME ZONE $1)::date - INTERVAL '1 day')::date AS yest`,
      [APP_TZ]
    ))[0];
    const today = d.today, yest = d.yest;

    // ambil user & last_checkin dalam DATE
    const u = (await q(
      `SELECT balance, streak, last_checkin::date AS last_date
         FROM users WHERE id=$1 LIMIT 1`,
      [uid]
    ))[0];
    if (!u) return res.status(404).json({ ok:false, error:"USER_NOT_FOUND" });

    // sudah klaim hari ini?
    if (u.last_date && String(u.last_date) === String(today)) {
      const day = Math.max(1, Math.min(Number(u.streak || 1), 9));
      return res.json({ ok:true, already:true, day, amount:SCHEDULE[day-1], balance:u.balance, streak:u.streak });
    }

    // hitung streak baru (lanjut jika kemarin klaim)
    const newStreak = (u.last_date && String(u.last_date) === String(yest))
      ? Number(u.streak || 0) + 1 : 1;

    const idx = Math.min(newStreak, 9) - 1;
    const amount = SCHEDULE[idx];

    // simpan last_checkin = TANGGAL LOKAL (cast ke date)
    await q(
      `UPDATE users
         SET balance = balance + $2::numeric,
             streak = $3::int,
             last_checkin = (now() AT TIME ZONE $1)::date,
             updated_at = now()
       WHERE id=$4`,
      [APP_TZ, amount, newStreak, uid]
    );

    await q(
      `INSERT INTO ledger (user_id, amount, reason, ref_id)
       VALUES ($1, $2::numeric, 'checkin', to_char((now() AT TIME ZONE $3)::date,'YYYY-MM-DD'))`,
      [uid, amount, APP_TZ]
    );

    const upd = (await q(`SELECT balance FROM users WHERE id=$1`, [uid]))[0];

    return res.json({
      ok:true, claimed:true,
      day:newStreak, amount, balance:upd?.balance, streak:newStreak
    });
  } catch (e) {
    console.error("checkin/claim crash:", e);
    return res.status(200).json({ ok:false, error:String(e?.message||e) });
  }
};
