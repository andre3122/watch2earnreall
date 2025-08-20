// api/user/get.js
const { q } = require('../_lib/db');
const { authFromHeader } = require('../_lib/auth');

const APP_TZ = process.env.APP_TZ || 'Asia/Jakarta';

module.exports = async (req, res) => {
  const a = await authFromHeader(req);
  if (!a.ok) return res.status(a.status || 401).json({ ok:false, error: a.error });

  const uid = a.user.id;

  const u = (await q(
    `SELECT id, username, balance, address, streak, last_checkin,
            (last_checkin IS NOT NULL AND last_checkin::date = (now() AT TIME ZONE $1)::date) AS checkin_today
       FROM users WHERE id=$2 LIMIT 1`,
    [APP_TZ, uid]
  ))[0] || { id: uid, username: null, balance: 0, address: null, streak: 0, last_checkin: null, checkin_today: false };

  let referred = 0, earned_total = "0";
  try { referred = (await q(`SELECT COUNT(*)::int AS cnt FROM referrals WHERE user_id=$1`, [uid]))[0]?.cnt || 0; } catch {}
  try { earned_total = String((await q(`SELECT COALESCE(SUM(amount),0)::numeric AS total FROM task_completions WHERE user_id=$1`, [uid]))[0]?.total || 0); } catch {}

  const ref_percent = Number(process.env.REF_PERCENT || 10);

  res.status(200).json({ ok:true, user: u, stats: { referred, earned_total }, ref_percent });
};
