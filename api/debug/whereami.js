const { sql } = require("../_lib/db");

module.exports = async (req, res) => {
  try {
    const meta = await sql`
      SELECT
        current_database()    AS db,
        current_user          AS db_user,
        inet_server_addr()    AS server_ip,
        inet_server_port()    AS server_port,
        version()             AS ver
    `;
    // cek apakah tabel-tabel inti sudah ada
    const tables = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema='public' AND table_name IN ('users','ad_sessions','ledger')
      ORDER BY table_name;
    `;
    res.json({
      ok: true,
      using_env: process.env.W2E_DB_URL ? "W2E_DB_URL" : "POSTGRES_URL",
      db_info: meta[0],
      has_tables: tables.map(t => t.table_name)
    });
  } catch (e) {
    res.status(200).json({ ok:false, error: String(e?.message || e) });
  }
};
