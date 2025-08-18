// api/_lib/db.js
const { Pool } = require("pg");

// PRIORITAS URL DB: pakai punyamu sendiri dulu
const DB_URL =
  process.env.SUPABASE_DB_URL ||         // <-- set ini di Vercel
  process.env.DATABASE_URL ||            // fallback
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.DATABASE_URL_UNPOOLED;

if (!DB_URL) {
  throw new Error("No database URL found. Set SUPABASE_DB_URL in Vercel.");
}

// Pool aman untuk serverless + pgbouncer
const pool = new Pool({
  connectionString: DB_URL,
  max: 1,
  ssl: { rejectUnauthorized: false },
});

// Helper template literal: sql`SELECT ... ${x}`
async function sql(strings, ...values) {
  const text = strings.raw
    ? strings.map((s, i) => s + (i < values.length ? `$${i + 1}` : "")).join("")
    : strings;
  const params = strings.raw ? values : [];
  const { rows } = await pool.query(text, params);
  return { rows };
}

// Kredit/debit saldo + catat ke ledger
async function addBalance(userId, amount, reason = "manual", refId = null) {
  await pool.query(
    "INSERT INTO ledger (user_id, amount, reason, ref_id) VALUES ($1,$2,$3,$4)",
    [userId, amount, reason, refId]
  );
  const q = await pool.query(
    "UPDATE users SET balance = balance + $1::numeric, updated_at=now() WHERE id=$2 RETURNING balance",
    [amount, userId]
  );
  return Number(q.rows[0].balance);
}

module.exports = { sql, addBalance };
