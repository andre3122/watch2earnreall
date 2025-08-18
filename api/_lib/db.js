// api/_lib/db.js
const { Pool } = require("pg");

// Ambil URL dari env, trimming biar gak ada spasi tak sengaja
function pickUrl(...names) {
  for (const n of names) {
    const v = process.env[n];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

const DB_URL = pickUrl(
  "SUPABASE_DB_URL",        // <-- utamakan ini
  "DATABASE_URL",
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
  "DATABASE_URL_UNPOOLED"
);

if (!DB_URL) throw new Error("No database URL found. Set SUPABASE_DB_URL in Vercel.");

// PARSE manual agar kita bisa set SSL override dengan pasti
const u = new URL(DB_URL);
const pool = new Pool({
  host: u.hostname,
  port: Number(u.port || 5432),
  user: decodeURIComponent(u.username),
  password: decodeURIComponent(u.password),
  database: u.pathname.slice(1),
  max: 1, // aman untuk serverless
  ssl: { rejectUnauthorized: false }, // <-- kunci: jangan verifikasi cert
});

// helper: sql`SELECT ... ${x}`
async function sql(strings, ...values) {
  const text = strings.raw
    ? strings.map((s, i) => s + (i < values.length ? `$${i + 1}` : "")).join("")
    : strings;
  const params = strings.raw ? values : [];
  const { rows } = await pool.query(text, params);
  return { rows };
}

// tambah saldo + catat ke ledger
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
