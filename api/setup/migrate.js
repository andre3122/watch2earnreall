// api/setup/migrate.js — INFO + MIGRATE + FIX users.id (tanpa nambah file)
const { sql, q } = require("../_lib/db");

module.exports = async (req, res) => {
  try {
    const u = new URL(req.url, "http://local");
    const doMigrate = u.searchParams.get("do") === "1";
    const showInfo  = u.searchParams.get("info") === "1";
    const doFix     = u.searchParams.get("fix") === "1";

    if (showInfo) {
      const meta = await sql`
        SELECT current_database() AS db,
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

    if (doMigrate || doFix) {
      // ===== users (buat kalau belum ada) =====
      await q(`
        CREATE TABLE IF NOT EXISTS public.users (
          id           BIGINT PRIMARY KEY,
          tg_id        TEXT UNIQUE,
          username     TEXT,
          balance      NUMERIC(14,2) NOT NULL DEFAULT 0,
          streak       INT          NOT NULL DEFAULT 0,
          last_checkin TIMESTAMPTZ,
          updated_at   TIMESTAMPTZ
        )
      `);

      // tambah kolom yang mungkin belum ada
      await q(`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS tg_id TEXT`);
      await q(`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS username TEXT`);
      await q(`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS balance NUMERIC(14,2) DEFAULT 0`);
      await q(`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS streak  INT DEFAULT 0`);
      await q(`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_checkin TIMESTAMPTZ`);
      await q(`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS updated_at   TIMESTAMPTZ`);
      await q(`UPDATE public.users SET balance=0 WHERE balance IS NULL`);
      await q(`UPDATE public.users SET streak =0 WHERE streak  IS NULL`);

      // === FIX: jadikan users.id auto-increment kalau belum ada default ===
      await q(`
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name='users' AND column_name='id' AND column_default IS NULL
          ) THEN
            IF NOT EXISTS (
              SELECT 1 FROM pg_class c
                JOIN pg_namespace n ON n.oid=c.relnamespace
              WHERE c.relkind='S' AND c.relname='users_id_seq' AND n.nspname='public'
            ) THEN
              CREATE SEQUENCE public.users_id_seq AS BIGINT START 1;
            END IF;

            ALTER TABLE public.users
              ALTER COLUMN id TYPE BIGINT,
              ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq');

            PERFORM setval('public.users_id_seq',
                           COALESCE((SELECT MAX(id) FROM public.users),0) + 1,
                           false);

            ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;
          END IF;
        END $$;
      `);

      // pastikan PK & unique tg_id ada
      await q(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE table_name='users' AND constraint_type='PRIMARY KEY'
          ) THEN
            ALTER TABLE public.users ADD PRIMARY KEY (id);
          END IF;
        END $$;
      `);
      await q(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE tablename='users' AND indexname='users_tg_id_key'
          ) THEN
            CREATE UNIQUE INDEX users_tg_id_key ON public.users(tg_id);
          END IF;
        END $$;
      `);

      // ===== ad_sessions =====
      await q(`
        CREATE TABLE IF NOT EXISTS public.ad_sessions (
          id           BIGSERIAL PRIMARY KEY,
          user_id      BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
          task_id      TEXT NOT NULL,
          token        TEXT,
          reward       NUMERIC(14,2) NOT NULL DEFAULT 0,
          status       TEXT NOT NULL DEFAULT 'pending',
          created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
          completed_at TIMESTAMPTZ
        )
      `);
      await q(`
        CREATE INDEX IF NOT EXISTS ad_sessions_user_task_time_idx
          ON public.ad_sessions (user_id, task_id, created_at DESC)
      `);

      // ===== ledger =====
      await q(`
        CREATE TABLE IF NOT EXISTS public.ledger (
          id         BIGSERIAL PRIMARY KEY,
          user_id    BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
          amount     NUMERIC(14,2) NOT NULL,
          reason     TEXT NOT NULL,
          ref_id     TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await q(`
        CREATE INDEX IF NOT EXISTS ledger_user_time_idx
          ON public.ledger (user_id, created_at DESC)
      `);

      return res.json({ ok: true, migrated: true, fixed: doFix });
    }

    // default hint
    res.json({ ok:true, hint: "Gunakan ?info=1 untuk info, ?do=1 untuk migrate, ?fix=1 untuk perbaikan id & ledger" });
  } catch (e) {
    return res.status(200).json({ ok:false, error: String(e?.message || e) });
  }
};
