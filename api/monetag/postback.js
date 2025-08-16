export default async function handler(req, res) {
  const { txid, user_id, sig } = req.query || {};
  console.log("Monetag postback", txid, user_id, sig);
  res.status(200).send("OK");
}
