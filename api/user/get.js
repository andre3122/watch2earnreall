// api/user/get.js
const { sql } = require('../_lib/db');
const { authFromHeader } = require('../_lib/auth');

module.exports = async (req, res) => {
  const a = await authFromHeader(req);
  if (!a.ok) return res.status(a.status).json({ ok:false, error: a.error });

  const uid = a.user.id;

  const { rows: urows } = await sql`SELECT id, username, balance, address, streak, last_checkin FROM users WHERE id=${uid} LIMIT 1`;
  const user = urows[0] || { id: uid, username: null, balance: 0, address: null, streak: 0, last_checkin: null };

  const { rows: rcount } = await sql`SELECT COUNT(*)::int AS cnt FROM referrals WHERE user_id=${uid}`;
  const { rows: tcount } = await sql`SELECT COALESCE(SUM(amount),0)::numeric AS total FROM task_completions WHERE user_id=${uid}`;

  res.status(200).json({
    ok: true,
    user,
    stats: {
      referred: rcount[0]?.cnt || 0,
      earned_total: String(tcount[0]?.total || 0)
    }
  });
};
