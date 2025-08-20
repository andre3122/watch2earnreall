// api/task/create.js — bikin sesi + token, kasih wait_seconds
const crypto = require("crypto");
const { sql } = require("../_lib/db");     // asumsi helper Postgres kamu
const { authFromHeader } = require("../_lib/auth");

const TASKS = { ad1: 0.01, ad2: 0.01 };

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ ok:false, error:"METHOD_NOT_ALLOWED" });

  const { ok, status, user } = await authFromHeader(req);
  if (!ok || !user) return res.status(status || 401).json({ ok:false, error:"AUTH_FAILED" });

  let body={}; try{ body=typeof req.body==="string"?JSON.parse(req.body):(req.body||{}) }catch{}
  const { task_id } = body || {};
  const reward = TASKS[task_id];
  if (!task_id || !reward) return res.status(400).json({ ok:false, error:"BAD_TASK" });

  const token = crypto.randomBytes(16).toString("hex");

  await sql`
    INSERT INTO ad_sessions (user_id, task_id, token, reward, status)
    VALUES (${user.id}, ${task_id}, ${token}, ${reward}::numeric, 'pending')
  `;

  const MIN_SECONDS = Number(process.env.TASK_MIN_SECONDS || 16);
  res.json({ ok:true, token, wait_seconds: MIN_SECONDS });
};
