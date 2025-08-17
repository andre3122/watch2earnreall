// /api/setup/migrate.js
const { sql } = require("../_lib/db");

module.exports = async (req, res) => {
  if (req.method !== "GET") return res.status(405).json({ ok:false, error:"METHOD_NOT_ALLOWED" });
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id BIGINT PRIMARY KEY,
        username TEXT,
        first_name TEXT,
        last_name TEXT,
        balance NUMERIC NOT NULL DEFAULT 0,
        streak INT NOT NULL DEFAULT 0,
        last_checkin DATE,
        address TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS checkins (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL,
        date DATE NOT NULL,
        amount NUMERIC NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (user_id, date)
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS task_completions (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL,
        task_id TEXT NOT NULL,
        date DATE NOT NULL,
        amount NUMERIC NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (user_id, task_id, date)
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS ad_sessions (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL,
        task_id TEXT NOT NULL,
        token TEXT NOT NULL UNIQUE,
        reward NUMERIC NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        completed_at TIMESTAMPTZ
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS transactions (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL,
        type TEXT NOT NULL,
        amount NUMERIC NOT NULL,
        meta JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS referrals (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL,
        referred_user_id BIGINT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS withdraw_requests (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL,
        amount NUMERIC NOT NULL,
        address TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;

    return res.status(200).json({ ok:true });
  } catch (e) {
    console.error("migrate crash:", e);
    return res.status(500).json({ ok:false, error: e.message || String(e) });
  }
};