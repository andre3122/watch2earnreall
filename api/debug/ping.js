// /api/debug/ping.js
const { sql } = require("../_lib/db");

module.exports = async (req, res) => {
  try {
    const r = await sql`select 1 as ok`;
    return res.json({ ok: true, db: r[0]?.ok === 1 });
  } catch (e) {
    console.error("debug/ping:", e);
    return res.status(500).json({ ok:false, where:"db", error: String(e?.message || e) });
  }
};
