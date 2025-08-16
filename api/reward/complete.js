export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok:false, error:"method_not_allowed" });
  const { user_id, task_id } = req.body || {};
  if (!user_id || !task_id) return res.status(400).json({ ok:false, error:"missing_params" });
  return res.status(200).json({ ok:true, credited:true, balance:"0.02" });
}
