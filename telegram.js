const crypto = require("crypto");

function parseInitData(raw) {
  const params = new URLSearchParams(raw || "");
  const data = {};
  for (const [k, v] of params) data[k] = v;
  if (data.user) { try { data.user = JSON.parse(data.user); } catch {} }
  return data;
}

function buildDataCheckString(obj) {
  // From Telegram docs: sort keys except 'hash', join as 'key=value' with \n
  const pairs = [];
  for (const k of Object.keys(obj).filter(x => x !== "hash").sort()) {
    pairs.push(`${k}=${obj[k]}`);
  }
  return pairs.join("\n");
}

function validateInitData(raw, botToken, maxAgeSec = 24 * 3600) {
  if (!raw) return { ok: false, error: "NO_INITDATA" };
  if (!botToken) return { ok: false, error: "NO_BOT_TOKEN" };

  const data = parseInitData(raw);
  const hash = data.hash;
  if (!hash) return { ok: false, error: "NO_HASH" };

  const checkString = buildDataCheckString(data);
  const secret = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const hex = crypto.createHmac("sha256", secret).update(checkString).digest("hex");

  if (hex !== hash) return { ok: false, error: "BAD_HASH" };

  const authDate = Number(data.auth_date || 0);
  if (authDate && maxAgeSec && (Date.now() / 1000 - authDate > maxAgeSec)) {
    return { ok: false, error: "EXPIRED" };
  }
  return { ok: true, data };
}

module.exports = { parseInitData, validateInitData };