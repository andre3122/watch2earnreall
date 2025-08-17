const { sql, addBalance } = require("../_lib/db");
const { authFromHeader } = require("../_lib/auth");

const TASK_REWARDS = { ad1: 0.02, ad2: 0.02 };

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const a = await authFromHeader(req);
  if (!a.ok) return res.status(a.status).json({ error: a.error });

  let body = {};
  try { body = JSON.parse(req.body || "{}"); } catch {}
  const taskId = String(body.task_id || "");
  if (!TASK_REWARDS[taskId]) return res.status(400).json({ error: "UNKNOWN_TASK" });

  // one-time task per user
  const { rows: done } = await sql`SELECT 1 FROM task_completions WHERE user_id=${a.user.id} AND task_id=${taskId}`;
  if (done.length) return res.status(400).json({ error: "ALREADY_COMPLETED" });

  const amount = TASK_REWARDS[taskId];
  await sql`INSERT INTO task_completions (user_id, task_id, amount) VALUES (${a.user.id}, ${taskId}, ${amount})`;
  const balance = await addBalance(a.user.id, amount);

  res.json({ credited: true, amount, balance: Number(balance) });
};
