// /api/health.js (Vercel serverless, Node runtime)

export const config = { runtime: "nodejs" };

const BOT_NAME = process.env.BOT_NAME || "Duki";

export default async function handler(req, res) {
  // CORS + preflight
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Session-ID");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET", "OPTIONS"]);
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  return res.status(200).json({
    ok: true,
    service: "duki",
    bot: BOT_NAME,
    ts: Date.now(),
  });
}
