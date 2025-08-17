const { sql } = require("../_lib/db");
const { authFromHeader } = require("../_lib/auth");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const a = await authFromHeader(req);
  if (!a.ok) return res.status(a.status).json({ error: a.error });

  let body = {};
  try { body = JSON.parse(req.body || "{}"); } catch {}
  const address = (body.address || "").trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) return res.status(400).json({ error: "INVALID_ADDRESS" });

  await sql`UPDATE users SET address=${address}, updated_at=now() WHERE id=${a.user.id}`;
  res.json({ ok: true });
};
