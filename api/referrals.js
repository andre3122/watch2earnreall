export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") return res.status(405).json({ ok:false, error:"method_not_allowed" });
  const { user_id } = req.query || {};
  return res.status(200).json({ ok:true, count: 0, bonus: 0, list: [] });
}
