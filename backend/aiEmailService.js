import OpenAI from "openai";
import { mergePriorityWithRules, normalizePriority } from "./emailPriority.js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * @param {string} text
 */
function parseJsonStrict(text) {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) return JSON.parse(fence[1].trim());
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start !== -1 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("Model did not return parseable JSON");
  }
}

/**
 * @typedef {{ sender?: string, subject?: string, body?: string }} InputEmail
 * @typedef {{ sender: string, summary: string, intent: string, priority: "HIGH" | "MEDIUM" | "LOW" }} EmailSummary
 */

const BASE_PROMPT = `You are an AI email assistant.
Summarize each email in 1-2 lines, detect intent, and assign priority.
Return JSON only.

Priority hints (final priority may be adjusted by system rules):
- HIGH: time-sensitive, direct asks from leadership, security/billing issues, or clearly urgent tone.
- LOW: marketing, newsletters, automated notifications with no action needed.
- MEDIUM: everything else.`;

/**
 * @param {InputEmail[]} emails
 * @returns {Promise<EmailSummary[]>}
 */
export async function summarizeEmails(emails) {
  if (!Array.isArray(emails) || emails.length === 0) {
    return [];
  }

  const payload = emails.map((e, i) => ({
    index: i,
    sender: e.sender ?? "",
    subject: e.subject ?? "",
    body: typeof e.body === "string" ? e.body : "",
  }));

  const userContent = `${BASE_PROMPT}

Respond with one JSON object only (no text before or after). Shape:
{"items":[{"sender":"string","summary":"string","intent":"string","priority":"HIGH"|"MEDIUM"|"LOW"}]}
One entry in "items" per email below, same order. Priority must be HIGH, MEDIUM, or LOW.

Emails:
${JSON.stringify(payload, null, 2)}`;

  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: userContent }],
    response_format: { type: "json_object" },
  });

  const raw = res.choices?.[0]?.message?.content;
  if (!raw) {
    throw new Error("Empty response from OpenAI");
  }

  const parsed = parseJsonStrict(raw);
  const items = parsed?.items;
  if (!Array.isArray(items)) {
    throw new Error('Expected JSON object with an "items" array');
  }

  const aiRows = items.map((row) => ({
    sender: typeof row.sender === "string" ? row.sender : "",
    summary: typeof row.summary === "string" ? row.summary.trim() : "",
    intent: typeof row.intent === "string" ? row.intent.trim() : "",
    priority: normalizePriority(row.priority),
  }));

  return aiRows.map((row, i) => mergePriorityWithRules(emails[i], row));
}
