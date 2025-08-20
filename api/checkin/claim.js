// api/checkin/claim.js — Daily Check-in (Day1=0.02 → Day9=0.18)
const { q } = require("../_lib/db");
const { authFromHeader } = require("../_lib/auth");

// Jadwal reward per hari (sesudah Day9 tetap pakai Day9)
const SCHEDULE = ["0.02","0.04","0.06","0.08","0.10","0.12","0.14","0.16","0.18"];

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ ok:false, error:"METHOD_NOT_ALLOWED" });
  }

  const a = await authFromHeader(req);
  if (!a.ok) return res.status(a.status || 401).json({ ok:false, error: a.error });
  const uid = a.user.id;

  try {
    // Ambil user + tanggal terakhir claim (sebagai DATE)
    const u = (await q(
      `SELECT balance, streak, last_checkin::date AS last_date
         FROM users WHERE id=$1 LIMIT 1`,
      [uid]
    ))[0];

    if (!u) return res.status(404).json({ ok:false, error:"USER_NOT_FOUND" });

    const today = (await q(`SELECT CURRENT_DATE AS d`))[0].d;
    const yest  = (await q(`SELECT (CURRENT_DATE - INTERVAL '1 day')::date AS d`))[0].d;

    // Sudah claim hari ini?
    if (u.last_date && String(u.last_date) === String(today)) {
      const day   = Math.max(1, Math.min(Number(u.streak || 1), 9));
      const amt   = SCHEDULE[day - 1];
      return res.json({
        ok:true, already:true,
        day, amount: amt,
        streak: u.streak,
        balance: u.balance,
        today: String(today)
      });
    }

    // Hitung streak baru (lanjut kalau kemarin claim; kalau tidak, reset ke 1)
    const newStreak = (u.last_date && String(u.last_date) === String(yest))
      ? Number(u.streak || 0) + 1
      : 1;

    // Reward hari ini (cap ke Day9)
    const idx = Math.min(newStreak, 9) - 1;
    const amount = SCHEDULE[idx];            // string, aman untuk NUMERIC

    // Update saldo + streak + last_checkin
    await q(
      `UPDATE users
         SET balance = balance + $2::numeric,
             streak = $3::int,
             last_checkin = CURRENT_DATE,
             updated_at = now()
       WHERE id=$1`,
      [uid, amount, newStreak]
    );

    // Catat ke ledger (ref_id = YYYY-MM-DD biar mudah audit)
    await q(
      `INSERT INTO ledger (user_id, amount, reason, ref_id)
       VALUES ($1, $2::numeric, 'checkin', to_char(CURRENT_DATE,'YYYY-MM-DD'))`,
      [uid, amount]
    );

    const upd = (await q(`SELECT balance FROM users WHERE id=$1`, [uid]))[0];

    return res.json({
      ok:true,
      claimed:true,
      day: newStreak,
      amount,
      balance: upd?.balance,
      streak: newStreak,
      today: String(today),
      next_day: Math.min(newStreak + 1, 9),
      next_amount: SCHEDULE[Math.min(newStreak + 1, 9) - 1]
    });
  } catch (e) {
    console.error("checkin/claim crash:", e);
    return res.status(200).json({ ok:false, error:String(e?.message||e) });
  }
};
