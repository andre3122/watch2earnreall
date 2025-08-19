// api/address/save.js
const { sql } = require('../_lib/db');
const { authFromHeader } = require('../_lib/auth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok:false, error:"METHOD_NOT_ALLOWED" });
  const a = await authFromHeader(req);
  if (!a.ok) return res.status(a.status || 401).json({ ok:false, error:"AUTH_FAILED" });
  const body = req.body || {};
  const address = (body.address || "").trim();
  await sql`UPDATE users SET address=${address} WHERE id=${a.user.id}`;
  res.status(200).json({ ok:true });
};
