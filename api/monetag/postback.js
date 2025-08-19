// api/monetag/postback.js
const { sql } = require("../_lib/db");

module.exports = async (req, res) => {
  try {
    // Monetag biasa kirim subid + payout; sediakan fallback lain juga
    const token =
      req.query.subid ||
      req.query.token ||
      "";

    const payoutRaw =
      req.query.payout ||
      req.query.amount ||
      req.query.sum ||
      req.query.reward ||
      "";

    if (!token) return res.status(400).json({ ok: false, error: "NO_TOKEN" });

    const payout = Math.max(0, Number(payoutRaw || 0));

    // Kunci session iklan yg menunggu postback
    const { rows: sessRows } = await sql`
      UPDATE ad_sessions
      SET status='completed'
      WHERE token=${token} AND status IN ('await_postback','pending')
      RETURNING id, user_id, task_id, reward
    `;

    if (!sessRows.length) {
      return res.status(404).json({ ok: false, error: "NO_SESSION" });
    }

    const s = sessRows[0];
    const amount = payout > 0 ? payout : Number(s.reward) || 0;

    // Catat completion —> inilah sumber data untuk VIEW public.ledger
    await sql`
      INSERT INTO task_completions (user_id, task_id, amount)
      VALUES (${s.user_id}, ${s.task_id}, ${amount}::numeric)
    `;

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("postback error:", e);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
};
