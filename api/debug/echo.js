// api/debug/echo.js  (satu function untuk echo, auth, tables)
const { authFromHeader } = require("../_lib/auth");
const { sql } = require("../_lib/db");

module.exports = async (req, res) => {
  try {
    const url = new URL(req.url, "http://x");
    const action = (url.searchParams.get("action") || "echo").toLowerCase();

    if (action === "echo") {
      return res.json({
        got_test_header: !!req.headers["x-telegram-test-user"],
        header_value: req.headers["x-telegram-test-user"] || null,
      });
    }

    if (action === "auth") {
      const a = await authFromHeader(req);
      return res.status(a.status || 200).json(a);
    }

    if (action === "tables") {
      const { rows } = await sql`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema='public' ORDER BY 1
      `;
      return res.json(rows.map(r => r.table_name));
    }

    return res.status(400).json({ error: "Unknown action" });
  } catch (e) {
    console.error("debug error:", e);
    return res.status(500).json({ error: "debug_failed" });
  }
};
