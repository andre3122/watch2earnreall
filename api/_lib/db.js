// api/_lib/db.js
const { Pool } = require('pg');

const CONN =
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.DATABASE_URL ||
  process.env.SUPABASE_DB_URL ||
  "";

if (!CONN) {
  throw new Error("Database URL is not set. Please set POSTGRES_URL (or POSTGRES_PRISMA_URL / DATABASE_URL_UNPOOLED).");
}

// one global pool (ok for Vercel serverless)
let _pool = global.__W2E_POOL__;
if (!_pool) {
  _pool = new Pool({
    connectionString: CONN,
    max: 1,
    ssl: { rejectUnauthorized: false },
  });
  global.__W2E_POOL__ = _pool;
}
const pool = _pool;

// tagged template -> ({text, values})
function buildQuery(strings, values) {
  let text = "";
  const vals = [];
  for (let i = 0; i < strings.length; i++) {
    text += strings[i];
    if (i < values.length) {
      vals.push(values[i]);
      text += `$${vals.length}`;
    }
  }
  return { text, values: vals };
}

async function sql(strings, ...values) {
  const q = buildQuery(strings, values);
  const client = await pool.connect();
  try {
    const res = await client.query(q);
    return { rows: res.rows };
  } finally {
    client.release();
  }
}

// Basic safe helpers
async function getUserOrCreate({ id, username }) {
  if (!id) throw new Error("Missing id");
  await ensureTables();
  const q = await sql`
    INSERT INTO users (id, username)
    VALUES (${id}, ${username || null})
    ON CONFLICT (id) DO UPDATE SET username = COALESCE(EXCLUDED.username, users.username)
    RETURNING id, username, balance, address, streak, last_checkin, created_at;`;
  return q.rows[0];
}

async function addBalance(userId, amount, meta = {}, source = "task", taskId = null) {
  await ensureTables();
  // Insert into task_completions as our "ledger"
  await sql`
    INSERT INTO task_completions (user_id, task_id, amount, source, meta)
    VALUES (${userId}, ${taskId}, ${amount}, ${source}, ${JSON.stringify(meta)})`;
  // Update running balance on users
  await sql`UPDATE users SET balance = COALESCE(balance,0) + ${amount} WHERE id=${userId}`;
}

async function ensureTables() {
  if (global.__W2E_TABLES_READY__) return;
  // create minimal tables (idempotent)
  await sql`CREATE TABLE IF NOT EXISTS users (
    id BIGINT PRIMARY KEY,
    username TEXT,
    balance NUMERIC DEFAULT 0 NOT NULL,
    address TEXT,
    streak INT DEFAULT 0 NOT NULL,
    last_checkin DATE,
    created_at TIMESTAMPTZ DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS referrals (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    referred_user_id BIGINT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS ad_sessions (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    task_id TEXT NOT NULL,
    token TEXT UNIQUE NOT NULL,
    reward NUMERIC NOT NULL,
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS checkins (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    day INT NOT NULL,
    amount NUMERIC NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS withdraw_requests (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    amount NUMERIC NOT NULL,
    address TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS withdrawals (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    amount NUMERIC NOT NULL,
    txid TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS task_completions (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    task_id TEXT,
    amount NUMERIC NOT NULL,
    source TEXT,
    meta JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
  )`;
  global.__W2E_TABLES_READY__ = true;
}

module.exports = { sql, addBalance, getUserOrCreate, ensureTables };
