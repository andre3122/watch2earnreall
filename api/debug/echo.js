// /api/debug/echo.js
const { sql } = require("../_lib/db");

module.exports = async (req, res) => {
  try {
    const action = String(req.query.action || "echo");

    if (action === "tables") {
      const { rows } = await sql`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        ORDER BY table_name
      `;
      return res.json(rows.map(r => r.table_name));
    }

    if (action === "dbinfo") {
      const { rows } = await sql`
        SELECT current_database() AS db,
               inet_server_addr() AS host,
               inet_server_port() AS port,
               current_user AS user,
               version() AS version
      `;
      return res.json(rows[0]);
    }

    if (action === "fix-ledger") {
      await sql`ALTER TABLE public.users
        ADD COLUMN IF NOT EXISTS balance numeric NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()`;

      await sql`CREATE TABLE IF NOT EXISTS public.ledger (
        id bigserial PRIMARY KEY,
        user_id bigint NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
        amount numeric NOT NULL,
        kind text,
        ref text,
        note text,
        created_at timestamptz NOT NULL DEFAULT now()
      )`;

      await sql`CREATE INDEX IF NOT EXISTS idx_ledger_user_created
        ON public.ledger (user_id, created_at DESC)`;

      return res.json({ ok: true, message: "ledger ensured" });
    }

    // default biar gak 400 kalau lupa param
    return res.json({ ok: true, action, header_value: req.headers["x-telegram-test-user"] || null });
  } catch (e) {
    console.error("debug/echo crash:", e);
    return res.status(500).json({ ok:false, error:String(e.message||e) });
  }
};
