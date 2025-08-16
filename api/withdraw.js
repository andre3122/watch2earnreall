export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok:false, error:"method_not_allowed" });
  const { user_id, amount, address } = req.body || {};
  if (!user_id || !amount || !address) return res.status(400).json({ ok:false, error:"missing_params" });
  if (Number(amount) < 1) return res.status(400).json({ ok:false, error:"min_1_usd" });
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) return res.status(400).json({ ok:false, error:"invalid_bep20" });
  return res.status(200).json({ ok:true, message:"withdraw_requested" });
}
