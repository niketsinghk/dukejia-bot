// api/ask.js — Vercel serverless, with full small-talk logic ported from server.mjs
import fs from "fs";
import path from "path";
import { GoogleGenerativeAI } from "@google/generative-ai";

/* ─────────────────────────── Paths & Config ─────────────────────────── */
const DATA_DIR = path.join(process.cwd(), "data");
const EMB_PATH = path.join(DATA_DIR, "index.json");

const TOP_K            = parseInt(process.env.TOP_K || "6", 10);
const GENERATION_MODEL = process.env.GENERATION_MODEL || "gemini-2.5-flash";
const EMBEDDING_MODEL  = process.env.EMBEDDING_MODEL  || "text-embedding-004";
const MIN_OK_SCORE     = 0.18;

const BOT_NAME         = process.env.BOT_NAME || "Duki";
const BRAND_NAME       = "Dukejia";
const FRONTEND_GREETS  = (process.env.FRONTEND_GREETS ?? "true") !== "false"; // default true

if (!process.env.GOOGLE_API_KEY) {
  throw new Error("Missing GOOGLE_API_KEY env on Vercel");
}

/* ─────────────────────────── Google Gemini SDK ───────────────────────── */
const genAI    = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const embedder = genAI.getGenerativeModel({ model: EMBEDDING_MODEL });
const llm      = genAI.getGenerativeModel({ model: GENERATION_MODEL });

/* ───────────────────────────── Helpers ──────────────────────────────── */
function detectResponseMode(q = "") {
  const text = q.toLowerCase();
  if (/[\u0900-\u097F]/.test(text)) return "hinglish";
  const tokens = [
    "hai","hain","tha","thi","the","kya","kyu","kyun","kyunki","kisi","kis","kaun","kab","kaha","kahaan","kaise",
    "nahi","nahin","ka","ki","ke","mein","me","mai","mei","hum","ap","aap","tum","kr","kar","karo","karna","chahiye",
    "bhi","sirf","jaldi","kitna","ho","hoga","hogaya","krdo","pls","plz","yaar","shukriya","dhanyavaad","dhanyavad"
  ];
  let score = 0;
  for (const t of tokens) {
    if (text.includes(` ${t} `) || text.startsWith(t + " ") || text.endsWith(" " + t) || text === t) score += 1;
  }
  const chatCues = (text.match(/[:)(!?]{2,}|\.{3,}|😂|👍|🙏/g) || []).length;
  score += chatCues >= 1 ? 0.5 : 0;
  return score >= 2 ? "hinglish" : "english";
}

const EN_STOP = new Set(`a about above after again against all am an and any are aren't as at
be because been before being below between both but by
can't cannot could couldn't did didn't do does doesn't doing don't down during
each few for from further
had hadn't has hasn't have haven't having he he'd he'll he's her here here's hers herself him himself his how how's
i i'd i'll i'm i've if in into is isn't it it's its itself let's
me more most mustn't my myself
no nor not of off on once only or other ought our ours ourselves out over own
same shan't she she'd she'll she's should shouldn't so some such
than that that's the their theirs them themselves then there there's these they they'd they'll they're they've this those through to too
under until up very
was wasn't we we'd we'll we're we've were weren't what what's when when's where where's which while who who's whom why why's with won't would wouldn't
you you'd you'll you're you've your yours yourself yourselves`.trim().split(/\s+/));

const PROTECTED_TOKENS = new Set([
  // ─── Core company / brands ───
  "hari","chand","anand","anil","hca",
  "hari-chand-anand","hari-chand-anand-&-co","hari-chand-anand-and-co",
  "duke","duke-jia","dukejia","duki","contact","call","email","address","Branches","Headquarters",
  "Head Office","Factory","Works","Website","WhatsApp","Whatsapp","Whats app","Phone",
  "Brand","Brands","names","name","features","feature","specification","specifications","specs","model","models","type","types",
  "descriptions","description","Appllications","application","Machine_id","Machine ID","ID",

  // ─── Regions ───
  "delhi","india","bangladesh","ethiopia",

  // ─── Domains / industries ───
  "automation","solution","solutions","garment","leather","mattress",
  "perforation","embroidery","quilting","sewing","upholstery","pattern",

  // ─── Attachments / techniques ───
  "sequin","sequins","bead","beads","cording","coiling","taping","rhinestone","chenille","chainstitch","cap","tubular",

  // ─── Control systems / file formats ───
  "dahao","a18","dst","tajima","usb","u-disk","lcd","touchscreen","network",

  // ─── Features / safety / mechanics ───
  "auto-trimming","automatic-trimming","auto-color-change","automatic-color-change",
  "thread-break-detection","power-failure-recovery","servo","servo-motor","36v","36v-dc",
  "oil-mist","dust-clean","wide-voltage","270-cap-frame",

  // ─── Machine models (embroidery & related) ───
  "es-1300","es 1300","dy pe750x600","halo-100","dy-601ctm","dy sk d2-2.0rh",
  "dy-606","dy-606h","dy-606hc","dy-606l","dy-606xl","dy-606s","dy-606+1ct","dy-606+1pd",
  "dy-602","dy-602h","dy-602hc","dy-602l","dy-602xl","dy-602s","dy-602+1ct","dy-602+1pd","dy 601ctm",
  "dy 606+6","dy602+2","dy-606+6","dy 908","dy 912","dy 915-120","dy 918-120",
  "dy 1201","dy 1201l","dy 1201h","dy 1201xl","dy 1201s",
  "dy-1201","dy-1201l","dy-1201h","dy-1201xl","dy-1201s","dy Halo-100",
  "dy-1201+1ct","dy-1201+1pd","dy 1204","dy 1206","dy 1206h","dy 1206hc",
  "dy-1204","dy-1206","dy-1206h","dy-1206hc",
  "dy-1202","dy-1202l","dy-1202h","dy-1202xl","dy-1202s","dy 918","dy 915",
  "dy 1502","dy-1502",
  "dy-1202hc","dy-1203h","dy-1204","dy-1206","dy-1206h",
  "dy-1502","dy-908","dy-912","dy915-120","dy918-120","dy cs3000",
  "duke-single-head","duke multi-head","duke multi head","duke multihead",
  "dukejia-single-head","dukejia multi-head","dukejia multi head","dukejia multihead",

  // ─── Non-embroidery models (brand-relevant) ───
  "dy-cs3000","dy-pe750x600","dy-sk-d2-2.0rh"
]);

function cleanForEmbedding(s = "") {
  const lower = s.toLowerCase();
  const stripped = lower.replace(/[^a-z0-9\u0900-\u097F\s-]/g, " ");
  return stripped
    .split(/\s+/)
    .filter(Boolean)
    .filter(t => {
      if (PROTECTED_TOKENS.has(t)) return true;
      if (EN_STOP.has(t)) return false;
      return true;
    })
    .join(" ")
    .trim();
}

function cosineSim(a, b) {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

function loadVectors() {
  if (!fs.existsSync(EMB_PATH)) throw new Error(`Embeddings not found at ${EMB_PATH}.`);
  const raw = JSON.parse(fs.readFileSync(EMB_PATH, "utf8"));
  if (!raw?.vectors?.length) throw new Error("Embeddings file has no vectors.");
  return raw.vectors;
}

// Load once per cold start
let VECTORS = [];
try { VECTORS = loadVectors(); } catch (e) { console.warn(e.message); }

/* ──────────────────────── Small-talk (ported) ───────────────────────── */
function getISTGreeting(now = new Date()) {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      hour12: false,
    }).format(now)
  );
  if (hour < 5)  return "Good night";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 21) return "Good evening";
  return "Good night";
}

function buildMinimalAssist(mode) {
  return mode === "hinglish" ? "Kaise madad kar sakta hoon?" : "How can I assist you?";
}

function makeSmallTalkReply(kind, mode) {
  const en = {
    hello: [
      "Hi! How can I help today?",
      "How can I help with Duki today?",
    ],
    morning:   ["Good morning! How can I help today?"],
    afternoon: ["Good afternoon! How can I help today?"],
    evening:   ["Good evening! Need help with machines or spares?"],
    thanks: [
      "You’re welcome! Anything else I can do?",
      "Happy to help! Need brochures or a sales connect?",
    ],
    bye: [
      "Take care! I’m here if you need me.",
      "Bye! Have a great day.",
    ],
    help: [
      "Ask about flagship lines, suggestions by application, or spares.",
    ],
    ack: [
      "Got it! What would you like next?",
    ],
  };

  const hi = {
    hello: [
      "Namaste 👋 Duki se related kya madad chahiye?",
      "Hello ji 👋 Main madad ke liye hoon—puchhiye.",
    ],
    morning:   ["Good morning! Aaj kis cheez mein help chahiye?"],
    afternoon: ["Good afternoon! Duki ke baare mein kya jaana hai?"],
    evening:   ["Good evening! Machines/spares par madad chahiye to batayein."],
    thanks: [
      "Shukriya! Aur kuch chahiye to pooch lijiye.",
      "Welcome ji! Brochure chahiye ya sales connect karu?",
    ],
    bye: [
      "Theek hai, milte hain! Jab chahein ping kar dijiyega.",
      "Bye! Din shubh rahe.",
    ],
    help: [
      "Try: “Flagship features”, “Application-wise machine suggestion”, “Spares info”.",
    ],
    ack: [
      "Thik hai! Ab kya puchhna hai?",
    ],
  };

  const bank = mode === "hinglish" ? hi : en;
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  switch (kind) {
    case "hello":     return pick(bank.hello);
    case "morning":   return pick(bank.morning);
    case "afternoon": return pick(bank.afternoon);
    case "evening":   return pick(bank.evening);
    case "thanks":    return pick(bank.thanks);
    case "bye":       return pick(bank.bye);
    case "help":      return pick(bank.help);
    case "ack":       return pick(bank.ack);
    default:          return pick(bank.hello);
  }
}

function smallTalkMatch(q) {
  const t = (q || "").trim();
  const patterns = [
    { kind: "hello",     re: /^(hi+|h[iy]+|hello+|hey( there)?|hlo+|yo+|hola|namaste|namaskar|salaam|salam|👋|🙏)\b/i },
    { kind: "morning",   re: /^(good\s*morning|gm)\b/i },
    { kind: "afternoon", re: /^(good\s*afternoon|ga)\b/i },
    { kind: "evening",   re: /^(good\s*evening|ge)\b/i },
    { kind: "ack",       re: /^(ok+|okay+|okk+|hmm+|haan+|ha+|sure|done|great|nice|cool|perfect|thik|theek|fine)\b/i },
    { kind: "thanks",    re: /^(thanks|thank\s*you|thx|tnx|ty|much\s*(appreciated|thanks)|appreciate(d)?|shukriya|dhanyavaad|dhanyavad)\b/i },
    { kind: "bye",       re: /^(bye|bb|good\s*bye|goodbye|see\s*ya|see\s*you|take\s*care|tc|ciao|gn)\b/i },
    { kind: "help",      re: /(who\s*are\s*you|what\s*can\s*you\s*do|help|menu|options|how\s*to\s*use)\b/i },
  ];
  for (const p of patterns) if (p.re.test(t)) return p.kind;
  return null;
}

/**
 * Full small-talk entry point for serverless.
 * Returns { text } if matched, else null.
 * You can pass `isFirstTurn` in the POST body to get minimal one-liner on first greeting.
 */
function handleSmallTalkAll(q, { isFirstTurn = false } = {}) {
  if (!q) return null;

  const mode = detectResponseMode(q);
  const trimmed = q.trim();

  // Short-token quick path (exactly like server.mjs)
  const short = trimmed.toLowerCase().replace(/[^a-z]/g, "");
  const HELLO_SHORT  = new Set(["hi","hey","yo","sup"]);
  const BYE_SHORT    = new Set(["bye","bb","ciao","gn"]);
  const THANKS_SHORT = new Set(["ty","thx","tnx","tx"]);
  const GM_SHORT     = new Set(["gm"]);
  const GA_SHORT     = new Set(["ga"]);
  const GE_SHORT     = new Set(["ge"]);

  let quickKind =
    (HELLO_SHORT.has(short)  && "hello")    ||
    (BYE_SHORT.has(short)    && "bye")      ||
    (THANKS_SHORT.has(short) && "thanks")   ||
    (GM_SHORT.has(short)     && "morning")  ||
    (GA_SHORT.has(short)     && "afternoon")||
    (GE_SHORT.has(short)     && "evening")  ||
    null;

  // Greeting detection for first-turn minimal
  const isBlank = trimmed.replace(/[?.!\s]/g, "") === "";
  const isGreetingWord = /^(hi+|hello+|hey( there)?|hlo+|namaste|namaskar|salaam|gm|ga|ge|👋|🙏)$/i.test(trimmed);

  // If quickKind matched
  if (quickKind) {
    if (isFirstTurn && FRONTEND_GREETS && ["hello","morning","afternoon","evening"].includes(quickKind)) {
      return { text: buildMinimalAssist(mode) };
    }
    return { text: makeSmallTalkReply(quickKind, mode) };
  }

  // Regex-path small talk
  const kind = smallTalkMatch(trimmed);
  if (kind) {
    if (isFirstTurn && FRONTEND_GREETS && ["hello","morning","afternoon","evening"].includes(kind)) {
      return { text: buildMinimalAssist(mode) };
    }
    // Time-of-day greeting variants may use IST salutation if you want:
    if (["morning","afternoon","evening"].includes(kind)) {
      const sal = getISTGreeting();
      const line = mode === "hinglish"
        ? (kind === "morning" ? "Good morning! Aaj kis cheez mein help chahiye?"
            : kind === "afternoon" ? "Good afternoon! Duki ke baare mein kya jaana hai?"
            : "Good evening! Machines/spares par madad chahiye to batayein.")
        : `${sal}! How can I help today?`;
      return { text: line };
    }
    return { text: makeSmallTalkReply(kind, mode) };
  }

  // First-turn, blank or emoji-only → minimal assist
  if (isFirstTurn && FRONTEND_GREETS && (isBlank || isGreetingWord)) {
    return { text: buildMinimalAssist(mode) };
  }

  return null;
}

/* ───────────────────────────── Handler ───────────────────────────────── */
export default async function handler(req, res) {
  // CORS-friendly preflight
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Session-ID");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST", "OPTIONS"]);
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  // Basic CORS
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  try {
    // Accept both message|question; allow optional isFirstTurn flag from client
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const q = (body.message ?? body.question ?? "").toString().trim();
    const isFirstTurn = !!body.isFirstTurn;

    if (!q && !isFirstTurn) {
      return res.status(400).json({ error: "Missing 'message' or 'question'." });
    }

    // Full small-talk path (all combinations from server.mjs now live here)
    const st = handleSmallTalkAll(q, { isFirstTurn });
    if (st && st.text) {
      return res.status(200).json({
        answer: st.text,
        citations: [],
        mode: detectResponseMode(q || ""),
        bot: BOT_NAME
      });
    }

    // RAG: require vectors
    if (!VECTORS.length) {
      return res.status(500).json({
        error: "Embeddings not loaded on server. Add data/index.json (npm run embed) and redeploy."
      });
    }

    const mode = detectResponseMode(q);
    const cleaned = cleanForEmbedding(q) || q.toLowerCase();

    // Embed query (text-embedding-004 uses `content.parts[].text`)
    const embRes = await embedder.embedContent({ content: { parts: [{ text: cleaned }] } });
    const qVec = embRes?.embedding?.values || embRes?.embeddings?.[0]?.values || [];
    if (!qVec.length) return res.status(500).json({ error: "Embedding failed" });

    // Retrieve top-K
    const top = VECTORS
      .map(v => ({ ...v, score: cosineSim(qVec, v.embedding) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, TOP_K);

    if (!top.length || (top?.[0]?.score ?? 0) < MIN_OK_SCORE) {
      const tip = mode === "hinglish"
        ? "Is topic par Dukejia knowledge base mein clear info nahi mil rahi. Thoda specific likhiye—jaise 'Dukejia E+P flagship features' ya 'Highlead 269 application'."
        : "I couldn’t find clear context in the Dukejia knowledge base for that. Try being more specific—for example, 'Dukejia E+P flagship features' or 'Highlead 269 application'.";
      return res.status(200).json({ answer: tip, citations: [], mode, bot: BOT_NAME });
    }

    const context = top
      .map((s, i) => `【${i + 1}】 ${s.text_original || s.text_cleaned || s.text}`)
      .join("\n\n");

    const languageGuide = mode === "hinglish"
      ? `REPLY LANGUAGE: Hinglish (Hindi in Latin script). Do NOT use Devanagari.`
      : `REPLY LANGUAGE: English. Professional and concise.`;

    const systemInstruction = `
You are ${BOT_NAME}, Dukejia’s assistant. Answer STRICTLY and ONLY from the provided CONTEXT (the Dukejia knowledge base).
If the answer is not present in the CONTEXT, reply exactly:
"Please contact our sales team at 
Whatsapp: +91 9350513789 
Embroidery@grouphca.com"

Rules:
- Do not invent or add external knowledge.
- Be concise and factual.
- ${languageGuide}
`.trim();

    const prompt = `
${systemInstruction}

QUESTION:
${q}

CONTEXT (numbered blocks):
${context}

Format:
- Direct answer grounded in context.
- If not found: “Please contact our sales team at 
Whatsapp: +91 9350513789 
Embroidery@grouphca.com
”
- Use the reply language specified above.
`.trim();

    const result = await llm.generateContent({ contents: [{ role: "user", parts: [{ text: prompt }] }] });
    const text = result?.response?.text?.() || "Please contact our sales team at Whatsapp: +91 9350513789 \nEmbroidery@grouphca.com";

    return res.status(200).json({
      answer: text,
      mode,
      bot: BOT_NAME,
      citations: top.map((s, i) => ({ idx: i + 1, score: s.score })),
    });
  } catch (err) {
    console.error("ask error:", err);
    return res.status(err?.status || 500).json({
      error: err?.message || "Server error",
      details: { status: err?.status || 500, statusText: err?.statusText || null, type: err?.name || null }
    });
  }
}
