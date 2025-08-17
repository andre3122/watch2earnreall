const { sql, addBalance } = require("../_lib/db");
const { authFromHeader } = require("../_lib/auth");

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") return res.status(405).json({ ok:false, error:"METHOD_NOT_ALLOWED" });
    const a = await authFromHeader(req);
    if (!a.ok) return res.status(a.status || 401).json({ ok:false, error:a.error || "UNAUTHORIZED" });

    const uid = a.user.id;
    const today = new Date().toISOString().slice(0,10);

    await sql`
      CREATE TABLE IF NOT EXISTS checkins (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL,
        date DATE NOT NULL,
        amount NUMERIC NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (user_id, date)
      )
    `;

    const { rows: already } = await sql`
      SELECT 1 FROM checkins WHERE user_id=${uid} AND date=${today}::date
    `;
    if (already.length) return res.status(400).json({ ok:false, error:"ALREADY_CHECKED" });

    const { rows: urows } = await sql`SELECT streak FROM users WHERE id=${uid}`;
    const streak = urows[0]?.streak ?? 0;
    if (streak >= 9) return res.status(400).json({ ok:false, error:"MAX_STREAK" });

    const next = Math.min(streak + 1, 9);
    const amount = Number((next * 0.02).toFixed(2));

    await sql`
      INSERT INTO checkins (user_id, date, amount) VALUES (${uid}, ${today}, ${amount}::numeric)
    `;
    await sql`
      UPDATE users SET streak=${next}, last_checkin=${today}::date, updated_at=now() WHERE id=${uid}
    `;
    const balance = await addBalance(uid, amount);

    return res.json({ ok:true, amount, streak: next, lastCheckin: today, balance });
  } catch (e) {
    console.error("/api/checkin/claim crash:", e);
    return res.status(500).json({ ok:false, error:"ROUTE_CRASH" });
  }
};