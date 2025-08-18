// api/_lib/db.js
const { Pool } = require("pg");

const CONN =
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_PRISMA_URL;

if (!CONN) throw new Error("Missing POSTGRES_URL/DATABASE_URL");

if (!global._dbPool) {
  global._dbPool = new Pool({
    connectionString: CONN,
    max: 5,
    idleTimeoutMillis: 30000,
    ssl: { rejectUnauthorized: false },
  });
}
const pool = global._dbPool;

async function query(text, params) {
  return pool.query(text, params);
}

// tagged template: sql`SELECT ... WHERE id=${x}`
function sql(strings, ...values) {
  const text = strings.reduce(
    (acc, s, i) => acc + s + (i < values.length ? `$${i + 1}` : ""),
    ""
  );
  return query(text, values);
}

// === APIs ===
async function getUserOrCreate(tgUser = {}) {
  const id = tgUser.id;
  const username = tgUser.username || null;
  const first = tgUser.first_name || null;
  const last = tgUser.last_name || null;
  if (!id) throw new Error("TG user id missing");

  await sql`
    INSERT INTO users (id, username, first_name, last_name)
    VALUES (${id}, ${username}, ${first}, ${last})
    ON CONFLICT (id) DO UPDATE SET
      username   = COALESCE(EXCLUDED.username, users.username),
      first_name = COALESCE(EXCLUDED.first_name, users.first_name),
      last_name  = COALESCE(EXCLUDED.last_name, users.last_name),
      updated_at = now()
  `;
  const { rows } = await sql`SELECT * FROM users WHERE id=${id} LIMIT 1`;
  return rows[0];
}

async function addBalance(userId, amount, meta = {}) {
  await sql`
    INSERT INTO ledger (user_id, amount, type, meta)
    VALUES (${userId}, ${amount}::numeric, 'credit', ${JSON.stringify(meta)}::jsonb)
  `;
  await sql`
    UPDATE users SET balance = balance + ${amount}::numeric, updated_at=now()
    WHERE id=${userId}
  `;
  return true;
}

module.exports = { sql, getUserOrCreate, addBalance };
