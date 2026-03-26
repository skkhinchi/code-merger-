import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/** OpenAI TTS input cap (model limit is typically 4096). */
const MAX_TTS_CHARS = 4096;
/** Max characters of each mail body read aloud (rest truncated). */
const MAX_BODY_CHARS_PER_EMAIL = 1400;

/**
 * Collapse whitespace; strip simple HTML if present.
 * @param {string} text
 */
function plainForSpeech(text) {
  if (!text || typeof text !== "string") return "";
  const noTags = text.replace(/<[^>]+>/g, " ");
  return noTags.replace(/\s+/g, " ").trim();
}

/**
 * @param {string} text
 * @param {number} max
 */
function shortenForSpeech(text, max) {
  const t = plainForSpeech(text);
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1))}…`;
}

/**
 * @param {unknown} raw
 */
function normalizeRawEmail(raw) {
  if (!raw || typeof raw !== "object") {
    return { sender: "", subject: "", body: "" };
  }
  const o = /** @type {Record<string, unknown>} */ (raw);
  return {
    sender: typeof o.sender === "string" ? o.sender.trim() : "",
    subject: typeof o.subject === "string" ? o.subject.trim() : "",
    body: typeof o.body === "string" ? o.body : "",
  };
}

/**
 * Spoken script: by priority, each mail includes subject, sender, summary, intent, and **message body**.
 * `rawEmails` must align with `summaries` by index (same order as fetched).
 *
 * @param {Array<{ priority?: string, subject?: string, summary?: string, sender?: string, intent?: string }>} summaries
 * @param {unknown[]} [rawEmails]
 */
export function formatSummaryForSpeech(summaries, rawEmails = []) {
  if (!Array.isArray(summaries) || summaries.length === 0) return "";

  const withIdx = summaries.map((s, i) => ({ ...s, _i: i }));
  const groups = {
    HIGH: [],
    MEDIUM: [],
    LOW: [],
  };
  for (const s of withIdx) {
    const p = s.priority === "HIGH" || s.priority === "LOW" ? s.priority : "MEDIUM";
    groups[p].push(s);
  }

  const lines = [];

  /**
   * @param {string} title
   * @param {typeof withIdx} list
   */
  const section = (title, list) => {
    if (list.length === 0) return;
    lines.push(`${title} priority. ${list.length} ${list.length === 1 ? "email" : "emails"}.`);
    for (let n = 0; n < list.length; n++) {
      const item = list[n];
      const i = item._i;
      const raw = normalizeRawEmail(rawEmails[i]);
      const subj = (typeof item.subject === "string" && item.subject.trim()) || raw.subject || "No subject";
      const sender =
        (typeof item.sender === "string" && item.sender.trim()) || raw.sender || "Unknown sender";
      const sum = typeof item.summary === "string" ? item.summary.trim() : "";
      const intent = typeof item.intent === "string" ? item.intent.trim() : "";

      lines.push(`Email ${n + 1}. Subject: ${subj}. From ${sender}.`);
      if (sum) lines.push(`Summary: ${sum}.`);
      if (intent) lines.push(`Intent: ${intent}.`);

      const bodySpeech = shortenForSpeech(raw.body, MAX_BODY_CHARS_PER_EMAIL);
      if (bodySpeech) {
        lines.push(`Message: ${bodySpeech}`);
      } else {
        lines.push("Message: not available or empty.");
      }
      lines.push("");
    }
  };

  section("High", groups.HIGH);
  section("Medium", groups.MEDIUM);
  section("Low", groups.LOW);

  let text = lines.join("\n").trim();
  if (text.length > MAX_TTS_CHARS) {
    text = `${text.slice(0, MAX_TTS_CHARS - 1)}…`;
  }
  return text;
}

/**
 * Convert text to MP3 using OpenAI speech API.
 * @param {string} text
 * @returns {Promise<Buffer>}
 */
export async function convertToSpeech(text) {
  const trimmed = typeof text === "string" ? text.trim() : "";
  if (!trimmed) {
    throw new Error("convertToSpeech: empty text");
  }

  const input =
    trimmed.length > MAX_TTS_CHARS
      ? `${trimmed.slice(0, MAX_TTS_CHARS)}…`
      : trimmed;

  const response = await openai.audio.speech.create({
    model: "gpt-4o-mini-tts",
    voice: "alloy",
    input,
  });

  return Buffer.from(await response.arrayBuffer());
}
