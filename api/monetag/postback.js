// api/monetag/postback.js
const { sql } = require("../_lib/db");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });
  }

  // Monetag bisa kirim subid/sub_id/sub1/click_id — ambil apa pun yang ada
  const q = req.query || {};
  const token =
    q.subid || q.sub_id || q.sub1 || q.click_id || q.token || q.t || "";

  if (!token) {
    return res
      .status(400)
      .json({ ok: false, error: "BAD_REQUEST", reason: "NO_TOKEN" });
  }

  try {
    // Ambil sesi iklan yang sedang menunggu postback
    const { rows } = await sql`
      UPDATE ad_sessions
      SET status = 'verified'
      WHERE token = ${token}
        AND status IN ('await_postback','pending')
      RETURNING user_id, task_id, reward
    `;

    if (!rows.length) {
      // Tidak apa2, jangan 500 — cukup info tidak ada session yg cocok
      return res.status(200).json({ ok: false, reason: "NO_SESSION" });
    }

    const s = rows[0];

    // Catat reward ke tabel task_completions (bukan "ledger" lagi)
    await sql`
      INSERT INTO task_completions (user_id, task_id, amount)
      VALUES (${s.user_id}, ${s.task_id}, ${s.reward}::numeric)
    `;

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("postback error:", e);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
};
