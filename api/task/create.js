// api/task/create.js — bikin sesi + token, kasih wait_seconds
const crypto = require("crypto");
const { q } = require("../_lib/db");
const { authFromHeader } = require("../_lib/auth");

const TASKS = { ad1: 0.01, ad2: 0.01 };
const MAX_ADS_PER_DAY = Number(process.env.MAX_ADS_PER_DAY || 50);
const MIN_SECONDS = Number(process.env.TASK_MIN_SECONDS || 16);

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ ok:false, error:"METHOD_NOT_ALLOWED" });
  }

  const { ok, status, user } = await authFromHeader(req);
  if (!ok || !user) {
    return res.status(status || 401).json({ ok:false, error:"AUTH_FAILED" });
  }

  // LIMIT HARIAN: blokir start kalau sudah 50x hari ini
  const cnt = (await q(
    `SELECT COUNT(*)::int AS c
       FROM ledger
      WHERE user_id=$1
        AND reason='ad_complete'
        AND created_at::date=CURRENT_DATE`,
    [user.id]
  ))[0]?.c || 0;

  if (cnt >= MAX_ADS_PER_DAY) {
    return res.json({ ok:false, error:'DAILY_LIMIT', max: MAX_ADS_PER_DAY, done_today: cnt });
  }

  let body = {};
  try { body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {}); } catch {}
  const { task_id } = body || {};
  const reward = TASKS[task_id];
  if (!task_id || !reward) {
    return res.status(400).json({ ok:false, error:"BAD_TASK" });
  }

  const token = crypto.randomBytes(16).toString("hex");

  await q(
    `INSERT INTO ad_sessions (user_id, task_id, token, reward, status)
     VALUES ($1,$2,$3,$4,'pending')`,
    [user.id, task_id, token, reward]
  );

  return res.json({ ok:true, token, wait_seconds: MIN_SECONDS });
};
