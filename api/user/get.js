// api/user/get.js
const { sql } = require("./_lib/db");
const { authFromHeader } = require("./_lib/auth");

module.exports = async (req, res) => {
  const a = await authFromHeader(req);
  if (!a.ok) return res.status(a.status).json({ error: a.error });

  const { rows } = await sql`
    SELECT balance, address FROM users WHERE id=${a.user.id} LIMIT 1
  `;
  const row = rows[0] || {};

  res.status(200).json({
    ok: true,
    balance: Number(row.balance || 0),
    address: row.address || ""
  });
};
