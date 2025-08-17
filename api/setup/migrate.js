const { sql } = require("@vercel/postgres");

module.exports = async (req, res) => {
  // Optional guard key
  // if (process.env.MIGRATE_KEY && req.query.key !== process.env.MIGRATE_KEY) return res.status(401).json({error:"unauthorized"});

  await sql`CREATE TABLE IF NOT EXISTS users(
    id BIGINT PRIMARY KEY,
    username TEXT,
    first_name TEXT,
    last_name TEXT,
    balance NUMERIC(12,2) NOT NULL DEFAULT 0,
    streak INT NOT NULL DEFAULT 0,
    last_checkin DATE,
    address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;

  await sql`CREATE TABLE IF NOT EXISTS task_completions(
    user_id BIGINT NOT NULL,
    task_id TEXT NOT NULL,
    amount NUMERIC(12,2) NOT NULL,
    completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY(user_id, task_id),
    CONSTRAINT fk_user_task FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  )`;

  await sql`CREATE TABLE IF NOT EXISTS checkins(
    user_id BIGINT NOT NULL,
    date DATE NOT NULL,
    amount NUMERIC(12,2) NOT NULL,
    PRIMARY KEY(user_id, date),
    CONSTRAINT fk_user_checkin FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  )`;

  await sql`CREATE TABLE IF NOT EXISTS referrals(
    user_id BIGINT NOT NULL,            -- referrer
    referred_user_id BIGINT NOT NULL,   -- new user
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY(user_id, referred_user_id)
  )`;

  await sql`CREATE TABLE IF NOT EXISTS withdraw_requests(
    id SERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    amount NUMERIC(12,2) NOT NULL,
    address TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- pending|approved|rejected|paid
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_user_withdraw FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  )`;

  res.json({ ok: true });
};
