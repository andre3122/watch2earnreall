# Watch2EarnReall — Vercel (BOT=watch2earnreall_bot, ZONE=9726748)

## Deploy
1. Import repo ini ke Vercel (Upload/GitHub).
2. Framework Preset: **Other** • Build Command: *(kosong)* • Output Directory: `.`
3. Domain: `https://<project>.vercel.app`
4. **Monetag script** sudah diset: `data-zone="9726748" data-sdk="show_9726748"`
5. **config.js** sudah di-set:
   - `window.BOT_USERNAME = "watch2earnreall_bot"`
   - `window.MONETAG_FN = "show_9726748"`
   - `window.API_BASE = ""`

## Endpoints
- `POST /api/reward/complete`
- `POST /api/withdraw`
- `POST /api/address/save`
- `GET  /api/referrals`
- `GET  /api/monetag/postback` ← set ini sebagai Postback URL di Monetag
