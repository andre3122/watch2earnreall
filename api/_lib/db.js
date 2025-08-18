// api/_lib/db.js — Supabase (pgbouncer) via 'pg' with tiny sql`` helper
const { Pool } = require('pg');

// Gunakan Supabase pooled connection (port 6543) + pgbouncer params:
// postgresql://postgres:<PASSWORD>@<HOST>.supabase.co:6543/postgres?pgbouncer=true&connection_limit=1&sslmode=require
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Template tag sederhana mirip `sql` dari @vercel/postgres
function sql(strings, ...values) {
  const text = strings.reduce((acc, s, i) => acc + s + (i < values.length ? `$${i + 1}` : ''), '');
  return pool.query(text, values);
}

// === Helpers dengan signature sama seperti sebelumnya ===
async function getUserOrCreate(tgUser) {
  const id = BigInt(tgUser.id);
  const username = tgUser.username || null;
  const first = tgUser.first_name || null;
  const last = tgUser.last_name || null;

  await sql`
    INSERT INTO users (id, username, first_name, last_name)
    VALUES (${id}, ${username}, ${first}, ${last})
    ON CONFLICT (id) DO UPDATE SET
      username = EXCLUDED.username,
      first_name = EXCLUDED.first_name,
      last_name = EXCLUDED.last_name,
      updated_at = now()
  `;

  const { rows } = await sql`SELECT id, balance, streak, last_checkin::text, address FROM users WHERE id=${id}`;
  return rows[0];
}

async function addBalance(userId, amount) {
  const { rows } = await sql`
    UPDATE users
    SET balance = balance + ${amount}::numeric, updated_at = now()
    WHERE id = ${userId}
    RETURNING balance;
  `;
  const val = rows[0]?.balance;
  return typeof val === 'string' ? Number(val) : Number(val || 0);
}

module.exports = { sql, getUserOrCreate, addBalance };
