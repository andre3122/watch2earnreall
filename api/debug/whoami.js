// /api/debug/whoami.js
const { authFromHeader } = require("../_lib/auth");

module.exports = async (req, res) => {
  try {
    const a = await authFromHeader(req); // baca header x-telegram-init-data
    const ip =
      req.headers["x-real-ip"] ||
      req.headers["x-forwarded-for"] ||
      req.socket?.remoteAddress;

    res
      .status(a.ok ? 200 : a.status || 401)
      .json({
        ok: a.ok,
        status: a.status || (a.ok ? 200 : 401),
        error: a.error || null,
        tgUser: a.tgUser || null, // user dari Telegram
        user: a.user || null,     // user di DB (kalau sudah dibuat)
        ip
      });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};
