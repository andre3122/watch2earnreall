// /api/debug/tables.js
const { sql } = require("../_lib/db");
module.exports = async (req, res) => {
  try {
    const { rows } = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema='public' 
      ORDER BY table_name`;
    res.json({ ok:true, tables: rows.map(r => r.table_name) });
  } catch (e) {
    res.status(500).json({ ok:false, error:String(e?.message||e) });
  }
};
