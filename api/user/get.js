const { authFromHeader } = require("../_lib/auth");

module.exports = async (req, res) => {
  const a = await authFromHeader(req);
  if (!a.ok) return res.status(a.status).json({ error: a.error });
  res.json({ balance: Number(a.user.balance), streak: a.user.streak, lastCheckin: a.user.last_checkin || null });
};
