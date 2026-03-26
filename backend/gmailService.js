import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { google } from "googleapis";
import { parseGmailMessage } from "./emailParser.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKENS_PATH = path.join(__dirname, "gmail-tokens.json");

const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];

/** Cap messages per day (list + fetch). Override with EMAIL_FETCH_MAX in .env */
const MAX_EMAILS_PER_FETCH = Math.min(
  500,
  Math.max(1, Number(process.env.EMAIL_FETCH_MAX) || 20)
);

function requireGoogleEnv() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI in .env"
    );
  }
  return { clientId, clientSecret, redirectUri };
}

/**
 * @returns {import("google-auth-library").OAuth2Client}
 */
export function createOAuth2Client() {
  const { clientId, clientSecret, redirectUri } = requireGoogleEnv();
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

/**
 * URL to send the user to for Google OAuth consent.
 */
export function getAuthUrl() {
  const oauth2Client = createOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });
}

export async function saveTokens(tokens) {
  await fs.writeFile(TOKENS_PATH, JSON.stringify(tokens, null, 2), "utf8");
}

export async function loadTokens() {
  try {
    const raw = await fs.readFile(TOKENS_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Exchange authorization code for tokens and persist them.
 * @param {string} code
 */
export async function exchangeCodeForTokens(code) {
  const oauth2Client = createOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  await saveTokens(tokens);
  return tokens;
}

/**
 * @returns {Promise<import("google-auth-library").OAuth2Client>}
 */
export async function getAuthorizedClient() {
  const tokens = await loadTokens();
  if (!tokens) {
    throw new Error(
      "Gmail not connected. Open GET /auth/google in a browser to sign in."
    );
  }
  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials(tokens);
  oauth2Client.on("tokens", async () => {
    await saveTokens(oauth2Client.credentials);
  });
  return oauth2Client;
}

function formatGmailDay(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}/${m}/${day}`;
}

function nextCalendarDay(date) {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + 1);
  return d;
}

/**
 * Fetch emails for the calendar day of `date` (local timezone of the Date object).
 * Uses Gmail search: after:YYYY/MM/DD before:YYYY/MM/DD (exclusive upper bound = next day).
 *
 * @param {Date | string | number} date
 * @returns {Promise<Array<{ sender: string, subject: string, body: string }>>}
 */
export async function getEmailsByDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) {
    throw new Error("Invalid date");
  }
  const after = formatGmailDay(d);
  const before = formatGmailDay(nextCalendarDay(d));
  const q = `after:${after} before:${before}`;

  const auth = await getAuthorizedClient();
  const gmail = google.gmail({ version: "v1", auth });

  const messageRefs = [];
  let pageToken;
  do {
    const listRes = await gmail.users.messages.list({
      userId: "me",
      q,
      maxResults: Math.min(100, MAX_EMAILS_PER_FETCH - messageRefs.length),
      pageToken,
    });
    messageRefs.push(...(listRes.data.messages ?? []));
    if (messageRefs.length >= MAX_EMAILS_PER_FETCH) break;
    pageToken = listRes.data.nextPageToken ?? undefined;
  } while (pageToken);

  const ids = messageRefs
    .map((r) => r.id)
    .filter(Boolean)
    .slice(0, MAX_EMAILS_PER_FETCH);
  /** Fetch full messages in parallel batches to reduce total latency. */
  const FETCH_CONCURRENCY = 8;
  const results = [];
  for (let i = 0; i < ids.length; i += FETCH_CONCURRENCY) {
    const batchIds = ids.slice(i, i + FETCH_CONCURRENCY);
    const batch = await Promise.all(
      batchIds.map((id) =>
        gmail.users.messages
          .get({ userId: "me", id, format: "full" })
          .then((msgRes) => parseGmailMessage(msgRes.data))
      )
    );
    results.push(...batch);
  }

  return results;
}
