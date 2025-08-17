const { sql, addBalance } = require("../_lib/db");
const { authFromHeader } = require("../_lib/auth");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const a = await authFromHeader(req);
  if (!a.ok) return res.status(a.status).json({ error: a.error });

  const uid = a.user.id;
  const today = new Date().toISOString().slice(0,10);

  // already checked today?
  const { rows: exists } = await sql`SELECT 1 FROM checkins WHERE user_id=${uid} AND date=${today}::date`;
  if (exists.length) return res.status(400).json({ error: "ALREADY_CHECKED" });

  // get current streak
  const { rows: urows } = await sql`SELECT streak FROM users WHERE id=${uid}`;
  const streak = urows[0]?.streak ?? 0;
  if (streak >= 9) return res.status(400).json({ error: "MAX_STREAK" });

  const nextDay = Math.min(streak + 1, 9);
  const amount = Number((nextDay * 0.02).toFixed(2));

  await sql`INSERT INTO checkins (user_id, date, amount) VALUES (${uid}, ${today}, ${amount})`;
  await sql`UPDATE users SET streak=${nextDay}, last_checkin=${today}::date, updated_at=now() WHERE id=${uid}`;
  const balance = await addBalance(uid, amount);

  res.json({ ok: true, amount, streak: nextDay, lastCheckin: today, balance: Number(balance) });
};
