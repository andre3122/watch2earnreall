// api/_lib/db.js  (Postgres via pg + pooled URL)
const { Pool } = require("pg");

// PRIORITAS: pakai W2E_DB_URL (buatan kita), kalau kosong baru POSTGRES_URL (Neon pooled)
const connStr = process.env.W2E_DB_URL || process.env.POSTGRES_URL;
if (!connStr) {
  throw new Error("[db] Missing W2E_DB_URL/POSTGRES_URL");
}

const pool = new Pool({
  connectionString: connStr,
  ssl: { rejectUnauthorized: false }, // aman untuk Neon pooled
});

// query biasa
async function q(text, params = []) {
  const client = await pool.connect();
  try {
    const result = await client.query(text, params);
    const arr = result.rows;
    arr.rows = result.rows; // compat
    return arr;
  } finally {
    client.release();
  }
}

// tagged template: sql`SELECT * FROM t WHERE x=${1}`
function sql(strings, ...values) {
  const params = [];
  let text = "";
  strings.forEach((s, i) => {
    text += s;
    if (i < values.length) {
      params.push(values[i]);
      text += `$${params.length}`;
    }
  });
  return q(text, params);
}

// contoh util yang dipakai auth
async function getUserOrCreate(tgUser) {
  if (!tgUser || !tgUser.id) throw new Error("NO_TG_USER");
  const tgId = String(tgUser.id);
  const username = tgUser.username || null;

  let rows = await sql`SELECT id, tg_id, username, balance, streak, last_checkin FROM users WHERE tg_id=${tgId}`;
  if (!rows.length) {
    rows = await sql`
      INSERT INTO users (tg_id, username)
      VALUES (${tgId}, ${username})
      RETURNING id, tg_id, username, balance, streak, last_checkin
    `;
  }
  return rows[0];
}

module.exports = { sql, q, getUserOrCreate };
