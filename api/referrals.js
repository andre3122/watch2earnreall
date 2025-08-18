const { sql } = require("./_lib/db");
const { authFromHeader } = require("./_lib/auth");

module.exports = async (req, res) => {
  const a = await authFromHeader(req);
  if (!a.ok) return res.status(a.status).json({ error: a.error });

  const { rows: countRows } = await sql`
    SELECT COUNT(*)::int AS cnt FROM referrals WHERE user_id=${a.user.id}
  `;
  const count = countRows[0]?.cnt || 0;

  const { rows: list } = await sql`
    SELECT referred_user_id AS id, to_char(created_at,'YYYY-MM-DD HH24:MI') as at
    FROM referrals WHERE user_id=${a.user.id}
    ORDER BY created_at DESC
    LIMIT 25
  `;
  res.json({
    count,
    list: list.map(r => ({ name: `User ${r.id}`, id: r.id, at: r.at }))
  });
};
