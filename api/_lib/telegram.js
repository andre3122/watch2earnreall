const crypto = require("crypto");

function parseInitData(raw) {
  const params = new URLSearchParams(raw || "");
  const data = {};
  for (const [k, v] of params) data[k] = v;
  if (data.user) try { data.user = JSON.parse(data.user); } catch {}
  return data;
}

function validateInitData(raw, botToken, maxAgeSec = 24 * 3600) {
  if (!raw) return { ok: false, error: "NO_INITDATA" };
  const data = parseInitData(raw);
  const hash = data.hash;
  if (!hash) return { ok: false, error: "NO_HASH" };

  // build data_check_string
  const entries = Object.keys(data)
    .filter(k => k !== "hash")
    .sort()
    .map(k => `${k}=${typeof data[k] === "object" ? JSON.stringify(data[k]) : data[k]}`)
    .join("\n");

  const secret = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const check = crypto.createHmac("sha256", secret).update(entries).digest("hex");

  if (check !== hash) return { ok: false, error: "BAD_HASH" };

  // age check
  const authDate = Number(data.auth_date || 0);
  if (authDate && (Date.now() / 1000 - authDate > maxAgeSec)) {
    return { ok: false, error: "EXPIRED" };
  }
  return { ok: true, data };
}

module.exports = { parseInitData, validateInitData };
