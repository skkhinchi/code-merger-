import OpenAI from "openai";
import {
  getEmailContext,
  setLastAgentResponse,
} from "./emailAgentContext.js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

function truncateBody(body, max = 6000) {
  const s = typeof body === "string" ? body : "";
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

/**
 * Rule-based: "show only high priority", "only medium", etc.
 * @param {string} command
 * @param {{ summaries: Array<{ priority?: string }> }} ctx
 */
function tryRuleFilter(command, ctx) {
  const c = command.trim();
  const patterns = [
    /(?:show\s+)?only\s+(high|medium|low)(?:\s+priority)?/i,
    /(?:high|medium|low)\s+priority\s+emails?\s*only/i,
    /(?:high|medium|low)\s+priority\s+only/i,
    /filter\s*(?:to|by)?\s*(high|medium|low)/i,
    /show\s+(?:me\s+)?(?:only\s+)?(high|medium|low)\s+priority/i,
  ];
  for (const re of patterns) {
    const m = c.match(re);
    if (m) {
      const word = m[1].toUpperCase();
      const pri =
        word === "HIGH" || word === "MEDIUM" || word === "LOW" ? word : "MEDIUM";
      const filtered = ctx.summaries.filter(
        (s) => (s.priority ?? "MEDIUM") === pri
      );
      return {
        action: "filter",
        filterPriority: pri,
        summaries: filtered,
        message: `Showing ${filtered.length} ${pri} priority email(s).`,
      };
    }
  }
  return null;
}

/**
 * @param {string} command
 * @param {ReturnType<typeof getEmailContext>} ctx
 */
async function runReplyDraft(command, ctx) {
  const indexedSummaries = ctx.summaries.map((s, i) => ({
    index: i,
    sender: s.sender,
    subject: s.subject ?? ctx.rawEmails?.[i]?.subject ?? "",
    summary: s.summary,
    intent: s.intent,
    priority: s.priority,
  }));

  const indexedRaw = (ctx.rawEmails ?? []).map((e, i) => ({
    index: i,
    sender: e.sender,
    subject: e.subject,
    body: truncateBody(e.body),
  }));

  const userContent = `You are an email assistant. The user wants to reply to an email from the batch below.

User command: ${command}

Summaries (index = email position):
${JSON.stringify(indexedSummaries, null, 2)}

Original bodies (same index; may be empty if not stored):
${JSON.stringify(indexedRaw, null, 2)}

Return JSON only with this shape:
{
  "targetIndex": number,
  "replyDraft": string (full suggested reply text),
  "message": string (one short line for the user)
}

If "this email" / "the first" with no other cue, use index 0. Match ordinal words (first=0, second=1) when possible.`;

  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: userContent }],
    response_format: { type: "json_object" },
  });

  const raw = res.choices?.[0]?.message?.content;
  if (!raw) throw new Error("Empty reply from model");
  const parsed = parseJsonStrict(raw);
  const targetIndex =
    typeof parsed.targetIndex === "number" && parsed.targetIndex >= 0
      ? Math.floor(parsed.targetIndex)
      : 0;
  const replyDraft =
    typeof parsed.replyDraft === "string" ? parsed.replyDraft : "";
  const message =
    typeof parsed.message === "string"
      ? parsed.message
      : "Draft reply generated.";

  return {
    action: "reply_draft",
    targetIndex,
    replyDraft,
    message,
    hasOriginalBodies: (ctx.rawEmails?.length ?? 0) > 0,
  };
}

/**
 * General question about the loaded batch.
 * @param {string} command
 * @param {ReturnType<typeof getEmailContext>} ctx
 */
async function runChatAboutBatch(command, ctx) {
  const compact = ctx.summaries.map((s, i) => ({
    index: i,
    ...s,
  }));

  const userContent = `User question about their email batch (date ${ctx.date}):

${command}

Emails (summaries):
${JSON.stringify(compact, null, 2)}

Answer concisely in plain language. Return JSON only:
{"message":string}`;

  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: userContent }],
    response_format: { type: "json_object" },
  });

  const raw = res.choices?.[0]?.message?.content;
  if (!raw) throw new Error("Empty response from model");
  const parsed = parseJsonStrict(raw);
  const message =
    typeof parsed.message === "string" ? parsed.message : String(parsed);

  return {
    action: "chat",
    message,
  };
}

/**
 * Follow-up commands against the last email-summary result.
 * @param {string} command
 */
export async function runEmailAgentCommand(command) {
  const cmd = typeof command === "string" ? command.trim() : "";
  if (!cmd) {
    throw new Error("Command is required.");
  }

  const ctx = getEmailContext();
  if (!ctx?.summaries?.length) {
    throw new Error(
      "No email context. Run Get Email Summary first, then try follow-up commands."
    );
  }

  const filtered = tryRuleFilter(cmd, ctx);
  if (filtered) {
    setLastAgentResponse(filtered);
    return filtered;
  }

  if (/\breply\b/i.test(cmd)) {
    const out = await runReplyDraft(cmd, ctx);
    setLastAgentResponse(out);
    return out;
  }

  const out = await runChatAboutBatch(cmd, ctx);
  setLastAgentResponse(out);
  return out;
}
