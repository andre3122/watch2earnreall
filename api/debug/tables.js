const { sql } = require("../_lib/db");
module.exports = async (req, res) => {
  const { rows } = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' ORDER BY table_name`;
  res.json(rows.map(r => r.table_name));
};
