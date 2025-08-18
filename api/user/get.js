const { sql } = require("../_lib/db");
const { authFromHeader } = require("../_lib/auth");

module.exports = async (req, res) => {
  const a = await authFromHeader(req);
  if (!a.ok) return res.status(a.status).json({ error: a.error });

  const { rows } = await sql`
    SELECT id, username, first_name, last_name, balance, streak, address
    FROM users WHERE id=${a.user.id} LIMIT 1
  `;
  res.json({ ok: true, user: rows[0] || null });
};
