const { sql } = require("@vercel/postgres");

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
      updated_at = now();
  `;

  const { rows } = await sql`SELECT id, balance, streak, last_checkin::text, address FROM users WHERE id=${id}`;
  return rows[0];
}

async function addBalance(userId, amount) {
  const { rows } = await sql`
    UPDATE users SET balance = balance + ${amount}::numeric, updated_at = now()
    WHERE id = ${userId}
    RETURNING balance;
  `;
  return rows[0]?.balance || 0;
}

module.exports = { sql, getUserOrCreate, addBalance };
