import { convert } from "html-to-text";

/**
 * @typedef {{ sender: string, subject: string, body: string }} ParsedEmail
 */

/**
 * @param {Array<{ name?: string, value?: string }> | undefined} headers
 * @param {string} name
 */
function getHeader(headers, name) {
  if (!headers?.length) return "";
  const lower = name.toLowerCase();
  const h = headers.find((x) => x.name?.toLowerCase() === lower);
  return (h?.value ?? "").trim();
}

function decodeBase64Url(data) {
  if (!data) return "";
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf8");
}

/**
 * Recursively collect decoded text/plain and text/html bodies from a Gmail payload.
 * @param {object | undefined} payload
 * @param {{ plain: string[], html: string[] }} acc
 */
function collectTextParts(payload, acc = { plain: [], html: [] }) {
  if (!payload) return acc;

  const mime = (payload.mimeType ?? "").toLowerCase();
  if (payload.body?.data) {
    const decoded = decodeBase64Url(payload.body.data);
    if (mime === "text/plain") {
      acc.plain.push(decoded);
    } else if (mime === "text/html") {
      acc.html.push(decoded);
    }
  }

  if (payload.parts?.length) {
    for (const part of payload.parts) {
      collectTextParts(part, acc);
    }
  }

  return acc;
}

/**
 * Strip tags and decode entities using html-to-text (handles tables, links, etc.).
 * @param {string} html
 */
function htmlToPlainText(html) {
  if (!html?.trim()) return "";
  return convert(html, {
    wordwrap: false,
    selectors: [
      { selector: "a", options: { hideLinkHrefIfSameAsText: true } },
      { selector: "img", format: "skip" },
    ],
  });
}

function normalizeWhitespace(text) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Prefer RFC 2046-style behavior: use plain text when present; otherwise convert HTML.
 * @param {{ plain: string[], html: string[] }} collected
 */
function buildBody(collected) {
  const plainJoined = collected.plain
    .map((p) => p.trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();

  if (plainJoined) {
    return normalizeWhitespace(plainJoined);
  }

  if (collected.html.length) {
    const merged = collected.html.join("\n");
    const fromHtml = htmlToPlainText(merged);
    return normalizeWhitespace(fromHtml);
  }

  return "";
}

/**
 * Extract readable body from Gmail `payload` (may be nested multipart).
 * @param {object | undefined} payload
 */
export function extractBodyFromGmailPayload(payload) {
  const collected = collectTextParts(payload);
  return buildBody(collected);
}

/**
 * Turn a Gmail API `users.messages` resource into a structured email object.
 * @param {object} message - Gmail API message (e.g. from users.messages.get)
 * @returns {ParsedEmail}
 */
export function parseGmailMessage(message) {
  const headers = message.payload?.headers;
  return {
    sender: getHeader(headers, "From"),
    subject: getHeader(headers, "Subject"),
    body: extractBodyFromGmailPayload(message.payload),
  };
}
