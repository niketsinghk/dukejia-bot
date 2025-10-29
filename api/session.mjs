// /api/session.js (Vercel serverless, Node runtime)

export const config = { runtime: "nodejs" };

// Use a shared in-memory map per cold start (serverless-safe).
// Prefer new Dukejia map; fall back to legacy HCA map if present.
const SESSIONS =
  globalThis.__DUKEJIA_SESSIONS__ ??
  globalThis.__HCA_SESSIONS__ ??
  (globalThis.__DUKEJIA_SESSIONS__ = new Map());

export default async function handler(req, res) {
  // CORS + preflight
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Session-ID");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET", "OPTIONS"]);
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  // Derive SID from header or cookies (support old/new names)
  const cookie = req.headers.cookie || "";
  const cookieSid =
    cookie.match(/(?:^|;\s*)sid=([^;]+)/)?.[1] ||
    cookie.match(/(?:^|;\s*)dukejia_sid=([^;]+)/)?.[1] ||
    cookie.match(/(?:^|;\s*)hca_sid=([^;]+)/)?.[1];

  const sid =
    req.headers["x-session-id"] ||
    cookieSid ||
    "anon";

  const sess = SESSIONS.get(String(sid)) || {};
  const history = Array.isArray(sess.history) ? sess.history : [];

  // Provide a helpful, consistent payload
  return res.status(200).json({
    ok: true,
    sessionId: String(sid),
    historyLength: history.length || 0,
    messages: history,
    createdAt: sess.createdAt || null,
    lastSeen: sess.lastSeen || null,
    hits: sess.hits || 0,
  });
}
