const { sql } = require("../_lib/db");
const { authFromHeader } = require("../_lib/auth");
- const { sql } = require("../_lib/db");
- const { authFromHeader } = require("../_lib/auth");
+ const { sql } = require("./_lib/db");
+ const { authFromHeader } = require("./_lib/auth");

module.exports = async (req, res) => {
  const auth = await authFromHeader(req);
  if (!auth.ok) return res.status(auth.status || 401).json({ ok:false, error: auth.error });

  const uid = BigInt(auth.user.id);
  const { rows } = await sql`SELECT id, balance, streak, last_checkin, address FROM users WHERE id=${uid}`;
  res.json({ ok:true, user: rows[0] || { id: Number(uid), balance: 0 } });
};
