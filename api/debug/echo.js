// api/debug/echo.js
const { sql } = require('../_lib/db');

module.exports = async (req, res) => {
  const action = req.query?.action || 'echo';
  if (action === 'tables') {
    const { rows } = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema='public' AND table_type='BASE TABLE'
      ORDER BY 1`;
    res.status(200).json(rows.map(r => r.table_name));
    return;
  }
  if (action === 'echo') {
    const header_value = req.headers['x-telegram-test-user'] || null;
    res.status(200).json({ header_value });
    return;
  }
  res.status(400).json({ error: 'Unknown action' });
};
