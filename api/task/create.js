// api/task/create.js
const crypto = require("crypto");
const { sql } = require("../_lib/db");
const { authFromHeader } = require("../_lib/auth");

// ==> Reward per task iklan
const TASKS = { ad1: 0.01, ad2: 0.01 };

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ ok:false, error:"METHOD_NOT_ALLOWED" });

  const { ok, status, user } = await authFromHeader(req);
  if (!ok || !user) return res.status(status || 401).json({ ok:false, error:"AUTH_FAILED" });

  const { task_id } = req.body || {};
  const reward = TASKS?.[task_id];
  if (!reward) return res.status(400).json({ ok:false, error:"UNKNOWN_TASK" });

  const token = crypto.randomBytes(16).toString("hex");

  const base = process.env.MONETAG_AD_URL || "";
  const param = process.env.MONETAG_TOKEN_PARAM || "subid";
  const adUrl = base
    ? (base.includes("{TOKEN}") ? base.replace("{TOKEN}", token)
       : `${base}${base.includes("?") ? "&" : "?"}${param}=${token}`)
    : "";

  await sql`
    INSERT INTO ad_sessions (user_id, task_id, token, reward, status)
    VALUES (${user.id}, ${task_id}, ${token}, ${reward}::numeric, 'pending')
  `;

  res.status(200).json({ ok:true, token, ad_url: adUrl });
};
