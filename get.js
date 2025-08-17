const { authFromHeader } = require("../_lib/auth");
const { sql } = require("../_lib/db");

module.exports = async (req, res) => {
  try {
    const a = await authFromHeader(req);
    if (!a.ok) return res.status(a.status || 401).json({ ok:false, error:a.error || "UNAUTHORIZED" });
    const { rows } = await sql`
      SELECT balance, streak, last_checkin::text AS lastcheckin, address
      FROM users WHERE id=${a.user.id}
    `;
    const u = rows[0] || {};
    res.json({
      ok: true,
      balance: Number(u.balance || 0),
      streak: u.streak || 0,
      lastCheckin: u.lastcheckin || null,
      address: u.address || null
    });
  } catch (e) {
    console.error("/api/user/get crash:", e);
    res.status(500).json({ ok:false, error:"ROUTE_CRASH" });
  }
};