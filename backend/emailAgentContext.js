/**
 * In-memory session for the last email-summary fetch and last agent turn.
 * Single-user / dev server assumption (one global context).
 */

/** @type {null | {
 *   date: string,
 *   summaries: unknown[],
 *   rawEmails: Array<{ sender: string, subject: string, body: string }>,
 *   lastApiResponse: unknown,
 *   storedAt: string,
 * }} */
let emailContext = null;

/** @type {null | { result: unknown, at: string }} */
let lastAgentResponse = null;

/**
 * @param {{
 *   date: string,
 *   summaries: unknown[],
 *   rawEmails?: Array<{ sender: string, subject: string, body: string }>,
 *   lastApiResponse?: unknown,
 * }} data
 */
export function setEmailContext(data) {
  emailContext = {
    date: data.date,
    summaries: data.summaries ?? [],
    rawEmails: data.rawEmails ?? [],
    lastApiResponse: data.lastApiResponse ?? null,
    storedAt: new Date().toISOString(),
  };
}

export function getEmailContext() {
  return emailContext;
}

/** @param {unknown} result */
export function setLastAgentResponse(result) {
  lastAgentResponse = {
    result,
    at: new Date().toISOString(),
  };
}

export function getLastAgentResponse() {
  return lastAgentResponse;
}
