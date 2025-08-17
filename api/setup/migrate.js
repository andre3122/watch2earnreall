// /api/setup/migrate.js
const { sql } = require("../_lib/db");

module.exports = async (req, res) => {
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });

  try {
    // Users (kalau sudah ada di file kamu, bagian ini boleh dibiarkan / digabung)
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
      )`;

    // Referrals (opsional, kalau kamu sudah punya, boleh hapus bagian ini)
    await sql`
      CREATE TABLE IF NOT EXISTS referrals (
        id BIGSERIAL PRIMARY KEY,
        referrer_id BIGINT NOT NULL,
        referred_id BIGINT NOT NULL UNIQUE,
        bonus NUMERIC NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`;

    // ⬇️ BAGIAN YANG DITANYAKAN — ad_sessions untuk verifikasi iklan/postback
    await sql`
      CREATE TABLE IF NOT EXISTS ad_sessions (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL,
        task_id TEXT NOT NULL,
        token TEXT UNIQUE NOT NULL,
        reward NUMERIC NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',  -- pending | credited | rejected
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        completed_at TIMESTAMPTZ
      )`;

    await sql`
      CREATE INDEX IF NOT EXISTS ad_sessions_user_status_idx
      ON ad_sessions (user_id, status)`;

    // Withdraws (opsional, kalau sudah ada di file kamu, boleh hapus bagian ini)
    await sql`
      CREATE TABLE IF NOT EXISTS withdrawals (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL,
        amount NUMERIC NOT NULL,
        address TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected | paid
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`;

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: e.message });
  }
};
