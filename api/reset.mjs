// /api/reset.js (or /api/reset.mjs)
export const config = { runtime: "nodejs" };

// Keep a per-cold-start in-memory session cache (serverless-safe)
const SESSIONS =
  globalThis.__DUKEJIA_SESSIONS__ ?? (globalThis.__DUKEJIA_SESSIONS__ = new Map());

const BOT_NAME = process.env.BOT_NAME || "Duki";

export default async function handler(req, res) {
  // CORS + preflight
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Session-ID");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST", "OPTIONS"]);
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  // Body may already be parsed by Vercel; be flexible
  let body = {};
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
  } catch {
    body = {};
  }

  // Try session ID from body, header, or cookie (support old+new cookie names)
  const cookie = req.headers.cookie || "";
  const fromCookie =
    cookie.match(/(?:^|;\s*)sid=([^;]+)/)?.[1] ||
    cookie.match(/(?:^|;\s*)dukejia_sid=([^;]+)/)?.[1] ||
    cookie.match(/(?:^|;\s*)hca_sid=([^;]+)/)?.[1];

  const sid =
    body.sessionId ||
    req.headers["x-session-id"] ||
    fromCookie ||
    "anon";

  // Delete any cached session for this sid
  try {
    SESSIONS.delete(String(sid));
  } catch {}

  // If you want to clear a cookie on the client, uncomment below:
  // res.setHeader("Set-Cookie", "sid=; Max-Age=0; Path=/; SameSite=Lax");

  return res.status(200).json({
    ok: true,
    sessionId: String(sid),
    bot: BOT_NAME,
  });
}
