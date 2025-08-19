// api/monetag/postback.js
const { sql, addBalance } = require('../_lib/db');

module.exports = async (req, res) => {
  try {
    const subid = (req.query.subid || req.query.sub_id || req.query.token || "").toString();
    if (!subid) return res.status(400).json({ error:"NO_TOKEN" });

    const { rows } = await sql`
      UPDATE ad_sessions
      SET status='credited'
      WHERE token=${subid} AND status='await_postback'
      RETURNING user_id, reward, task_id`;

    if (!rows.length) return res.status(404).json({ error:"NO_SESSION" });

    const row = rows[0];
    await addBalance(row.user_id, Number(row.reward), { task_id: row.task_id }, 'monetag', row.task_id);

    // For checkins, update streak/last_checkin
    if (row.task_id && row.task_id.startsWith('checkin:')) {
      const d = new Date();
      const today = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
      await sql`UPDATE users SET streak = LEAST(COALESCE(streak,0)+1, 9), last_checkin=${today} WHERE id=${row.user_id}`;
      await sql`INSERT INTO checkins (user_id, day, amount) VALUES (${row.user_id}, ${Number(row.task_id.split(':')[1]||1)}, ${row.reward})`;
    }
    res.status(200).json({ ok:true });
  } catch (e) {
    res.status(500).json({ error:"postback error", detail: e.message });
  }
};
