const PRIORITIES = new Set(["HIGH", "MEDIUM", "LOW"]);

/** Sender name / address: boss, manager, client → treat as important. */
const HIGH_SENDER_KEYWORDS = /\b(boss|manager|client)\b/i;

/** Subject + body: urgent delivery. */
const URGENT_MARKERS = /\b(urgent|asap)\b/i;

/** Marketing / bulk patterns (subject + body). */
const PROMO_NEWSLETTER = [
  /\bnewsletter\b/i,
  /\bpromotional\b/i,
  /\bmarketing\b/i,
  /\bunsubscribe\b/i,
  /view\s+in\s+browser/i,
  /email\s+preferences/i,
  /manage\s+(subscription|preferences)/i,
  /you('re|\s+are)\s+receiving\s+this\s+(email|because)/i,
  /\bno-?reply\b.*\b(marketing|newsletter|promo)/i,
];

/**
 * @param {unknown} p
 * @returns {"HIGH" | "MEDIUM" | "LOW"}
 */
export function normalizePriority(p) {
  if (typeof p !== "string") return "MEDIUM";
  const u = p.trim().toUpperCase();
  return PRIORITIES.has(u) ? u : "MEDIUM";
}

/**
 * @param {{ sender?: string, subject?: string, body?: string }} email
 * @returns {"HIGH" | "LOW" | null} null = no rule override; use AI priority
 */
export function detectRulePriority(email) {
  const sender = email.sender ?? "";
  const subject = email.subject ?? "";
  const body = email.body ?? "";
  const combined = `${subject}\n${body}`;

  if (HIGH_SENDER_KEYWORDS.test(sender)) {
    return "HIGH";
  }
  if (URGENT_MARKERS.test(combined) || URGENT_MARKERS.test(sender)) {
    return "HIGH";
  }

  if (PROMO_NEWSLETTER.some((re) => re.test(combined) || re.test(subject))) {
    return "LOW";
  }

  return null;
}

/**
 * Rules win when they fire (HIGH before LOW). Otherwise keep AI priority.
 *
 * @param {{ sender?: string, subject?: string, body?: string }} email
 * @param {{ sender: string, summary: string, intent: string, priority: string }} aiSummary
 */
export function mergePriorityWithRules(email, aiSummary) {
  const rule = detectRulePriority(email);
  const ai = normalizePriority(aiSummary.priority);

  let priority = ai;
  if (rule === "HIGH") {
    priority = "HIGH";
  } else if (rule === "LOW") {
    priority = "LOW";
  }

  return {
    ...aiSummary,
    priority,
  };
}
