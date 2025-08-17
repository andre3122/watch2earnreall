// api/reward/complete.js (MODE 1 - SDK)
// Credits user immediately on server after basic constraints
const { sql, addBalance } = require("../_lib/db");
const { authFromHeader } = require("../_lib/auth");

const TASK_REWARD = { ad1: 0.01, ad2: 0.01 };

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") return res.status(405).json({ ok:false, error:"METHOD_NOT_ALLOWED" });

    const a = await authFromHeader(req);
    if (!a.ok) return res.status(a.status || 401).json({ ok:false, error:a.error || "UNAUTHORIZED" });

    // Normalize body
    let body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body || "{}"); } catch { body = {}; } }
    if (!body || typeof body !== "object") body = {};
    const taskId = String(body.task_id || "").trim();
    if (!TASK_REWARD[taskId]) return res.status(400).json({ ok:false, error:"BAD_TASK" });

    const uid = a.user.id;
    const amount = TASK_REWARD[taskId];
    const today = new Date().toISOString().slice(0,10);

    // Prevent double credit same task per day
    await sql`
      CREATE TABLE IF NOT EXISTS task_completions (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL,
        task_id TEXT NOT NULL,
        date DATE NOT NULL,
        amount NUMERIC NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (user_id, task_id, date)
      )
    `;

    const { rows: exists } = await sql`
      SELECT 1 FROM task_completions WHERE user_id=${uid} AND task_id=${taskId} AND date=${today}::date
    `;
    if (exists.length) {
      // Already credited today
      return res.status(200).json({ ok:true, credited:false, reason:"ALREADY_DONE" });
    }

    // Credit
    await sql`
      INSERT INTO task_completions (user_id, task_id, date, amount)
      VALUES (${uid}, ${taskId}, ${today}, ${amount}::numeric)
    `;
    const balance = await addBalance(uid, amount);

    // Optional: log transaction
    await sql`
      CREATE TABLE IF NOT EXISTS transactions (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL,
        type TEXT NOT NULL,
        amount NUMERIC NOT NULL,
        meta JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
    await sql`
      INSERT INTO transactions (user_id, type, amount, meta)
      VALUES (${uid}, 'task', ${amount}::numeric, ${JSON.stringify({ taskId })}::jsonb)
    `;

    return res.json({ ok:true, credited:true, amount, balance: Number(balance) });
  } catch (e) {
    console.error("/api/reward/complete crash:", e);
    return res.status(500).json({ ok:false, error:"ROUTE_CRASH" });
  }
};