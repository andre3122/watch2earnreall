// api/_lib/telegram.js
const crypto = require('crypto');

function parseInitData(initData) {
  // Minimal parse; optional verification jika TELEGRAM_BOT_TOKEN di-set
  try {
    const params = new URLSearchParams(initData);
    const userStr = params.get('user');
    const hash = params.get('hash');
    const user = userStr ? JSON.parse(userStr) : null;
    if (process.env.TELEGRAM_BOT_TOKEN && user && hash) {
      const dataCheckArr = [];
      for (const [k, v] of params.entries()) {
        if (k === 'hash') continue;
        dataCheckArr.push(`${k}=${v}`);
      }
      dataCheckArr.sort();
      const dataCheckString = dataCheckArr.join('\n');
      const secretKey = crypto.createHmac('sha256', 'WebAppData')
        .update(process.env.TELEGRAM_BOT_TOKEN)
        .digest();
      const calcHash = crypto.createHmac('sha256', secretKey)
        .update(dataCheckString)
        .digest('hex');
      if (calcHash !== hash) return null;
    }
    return { user };
  } catch {
    return null;
  }
}

module.exports = { parseInitData };
