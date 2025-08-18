// api/withdraw.js
const { sql } = require("../_lib/db");
const { authFromHeader } = require("../_lib/auth");
- const { sql } = require("../_lib/db");
- const { authFromHeader } = require("../_lib/auth");
+ const { sql } = require("./_lib/db");
+ const { authFromHeader } = require("./_lib/auth");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ ok:false, error:"METHOD" });
  const a = await authFromHeader(req);
  if (!a.ok) return res.status(a.status || 401).json({ ok:false, error:a.error });

  let body = {};
  try { body = JSON.parse(req.body || "{}"); } catch {}
  const amount = Number(body.amount || 0);
  const address = (body.address || "").trim();
  if (!(amount >= 1)) return res.status(400).json({ ok:false, error:"MIN_1_USD" });
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) return res.status(400).json({ ok:false, error:"BAD_ADDRESS" });

  await sql`
    INSERT INTO withdrawals (user_id, amount, address, status)
    VALUES (${a.user.id}, ${amount}, ${address}, 'pending')
  `;
  res.json({ ok:true });
};
