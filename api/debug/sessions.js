// api/debug/sessions.js — list last sessions for current user (DEV ONLY!)
const { sql } = require("../_lib/db");
const { authFromHeader } = require("../_lib/auth");

module.exports = async (req, res) => {
  const { ok, status, user } = await authFromHeader(req);
  if (!ok || !user) return res.status(status || 401).json({ ok:false, error:"AUTH_FAILED" });

  const taskId = (req.query?.task_id || req.body?.task_id || "").toString() || null;
  const rows = await sql`
    SELECT id, task_id, token, status, reward, created_at, completed_at
    FROM ad_sessions
    WHERE user_id=${user.id} ${taskId ? sql`AND task_id=${taskId}` : sql``}
    ORDER BY created_at DESC
    LIMIT 10
  `;
  res.json({ ok:true, user_id: user.id, count: rows.length, rows });
};
