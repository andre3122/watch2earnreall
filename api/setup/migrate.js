// api/setup/migrate.js — MIGRATE + INFO (gabungan, tanpa tambah file)
const { sql } = require("../_lib/db");

module.exports = async (req, res) => {
  try {
    // parse query (?do=1 / ?info=1)
    const u = new URL(req.url, "http://local");
    const doMigrate = u.searchParams.get("do") === "1";
    const showInfo  = u.searchParams.get("info") === "1";

    // mode INFO: cek DB yang dipakai + tabel yang ada
    if (showInfo) {
      const meta = await sql`
        SELECT
          current_database() AS db,
          current_user       AS db_user,
          inet_server_addr() AS server_ip,
          inet_server_port() AS server_port,
          version()          AS ver
      `;
      const tables = await sql`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema='public'
          AND table_name IN ('users','ad_sessions','ledger')
        ORDER BY table_name
      `;
      return res.json({
        ok: true,
        using_env: process.env.W2E_DB_URL ? "W2E_DB_URL" : "POSTGRES_URL",
        db_info: meta[0],
        has_tables: tables.map(t => t.table_name)
      });
    }

    // mode MIGRATE: jalankan schema (idempotent, aman diulang)
    if (doMigrate || req.method === "POST" || req.method === "GET") {
      await sql`CREATE TABLE IF NOT EXISTS public.users (
        id           BIGSERIAL PRIMARY KEY,
        tg_id        TEXT UNIQUE NOT NULL,
        username     TEXT,
        balance      NUMERIC(14,2) NOT NULL DEFAULT 0,
        streak       INT NOT NULL DEFAULT 0,
        last_checkin TIMESTAMPTZ,
        updated_at   TIMESTAMPTZ
      )`;

      // jaga2 kalau ada kolom yang belum ada
      await sql`DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_name='users' AND column_name='updated_at') THEN
          ALTER TABLE public.users ADD COLUMN updated_at TIMESTAMPTZ;
        END IF;
      END $$;`;

      await sql`CREATE TABLE IF NOT EXISTS public.ad_sessions (
        id           BIGSERIAL PRIMARY KEY,
        user_id      BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
        task_id      TEXT NOT NULL,
        token        TEXT,
        reward       NUMERIC(14,2) NOT NULL DEFAULT 0,
        status       TEXT NOT NULL DEFAULT 'pending',
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        completed_at TIMESTAMPTZ
      )`;

      await sql`CREATE INDEX IF NOT EXISTS ad_sessions_user_task_time_idx
        ON public.ad_sessions (user_id, task_id, created_at DESC)`;

      await sql`CREATE TABLE IF NOT EXISTS public.ledger (
        id         BIGSERIAL PRIMARY KEY,
        user_id    BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
        amount     NUMERIC(14,2) NOT NULL,
        reason     TEXT NOT NULL,
        ref_id     TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`;

      await sql`CREATE INDEX IF NOT EXISTS ledger_user_time_idx
        ON public.ledger (user_id, created_at DESC)`;

      return res.json({ ok: true, migrated: true });
    }

    // default: kasih petunjuk
    res.json({
      ok: true,
      hint: "Tambahkan ?do=1 untuk migrate, atau ?info=1 untuk info DB"
    });
  } catch (e) {
    return res.status(200).json({ ok:false, error: String(e?.message || e) });
  }
};
