import "dotenv/config";
import cors from "cors";
import express from "express";
import { parseCommand } from "./agent.js";
import { createPR, mergePR } from "./github.js";
import { summarizeEmails } from "./aiEmailService.js";
import { runEmailAgentCommand } from "./emailAgentService.js";
import { setEmailContext } from "./emailAgentContext.js";
import {
  dateToCacheKey,
  getEmailSummaryCache,
  setEmailSummaryCache,
} from "./emailSummaryCache.js";
import { logError, logInfo } from "./logger.js";
import {
  convertToSpeech,
  formatSummaryForSpeech,
} from "./speechService.js";

/** Bump when TTS script changes so cached MP3 is regenerated. */
const AUDIO_SCRIPT_VERSION = 2;
import {
  exchangeCodeForTokens,
  getAuthUrl,
  getEmailsByDate,
} from "./gmailService.js";

/**
 * Adds MP3 as base64 plus MIME type to an email-summary body. Skips if audio already present.
 * @param {Record<string, unknown>} body
 */
async function enrichEmailSummaryWithAudio(body) {
  const count = body.count;
  const summaries = body.summaries;
  if (
    typeof count !== "number" ||
    count === 0 ||
    !Array.isArray(summaries) ||
    summaries.length === 0
  ) {
    return {
      ...body,
      audioMimeType: "audio/mpeg",
      audioBase64: null,
    };
  }

  if (
    typeof body.audioBase64 === "string" &&
    body.audioBase64.length > 0 &&
    body.audioScriptVersion === AUDIO_SCRIPT_VERSION
  ) {
    return {
      ...body,
      audioMimeType: body.audioMimeType ?? "audio/mpeg",
    };
  }

  const rawEmails = Array.isArray(body.rawEmails) ? body.rawEmails : [];
  const text = formatSummaryForSpeech(summaries, rawEmails);
  if (!text) {
    return {
      ...body,
      audioMimeType: "audio/mpeg",
      audioBase64: null,
    };
  }

  try {
    const buffer = await convertToSpeech(text);
    const next = {
      ...body,
      audioMimeType: "audio/mpeg",
      audioBase64: buffer.toString("base64"),
      audioScriptVersion: AUDIO_SCRIPT_VERSION,
    };
    delete next.audioError;
    return next;
  } catch (err) {
    logError("email-summary-tts", err, {});
    return {
      ...body,
      audioMimeType: "audio/mpeg",
      audioBase64: null,
      audioError: err instanceof Error ? err.message : String(err),
    };
  }
}

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ ok: true, message: "Server is running" });
});

// Gmail OAuth2 — open in browser once to connect
app.get("/auth/google", (req, res) => {
  try {
    res.redirect(getAuthUrl());
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ message });
  }
});

app.get("/auth/google/callback", async (req, res) => {
  const code = req.query.code;
  if (!code || typeof code !== "string") {
    return res.status(400).send("Missing authorization code");
  }
  try {
    await exchangeCodeForTokens(code);
    res.type("html").send("<p>Gmail connected. You can close this tab.</p>");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).send(message);
  }
});

/** Test helper: GET /api/gmail/emails?date=2025-03-24 (ISO or parseable date; default: today) */
app.get("/api/gmail/emails", async (req, res) => {
  try {
    const raw = req.query.date;
    const date = raw ? new Date(String(raw)) : new Date();
    const emails = await getEmailsByDate(date);
    res.json({ emails });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ message });
  }
});

/**
 * POST /email-summary
 * Body: { "date": "2025-03-24" } (ISO or any Date-parsable string)
 * Returns parsed emails for that day, summarized by OpenAI.
 */
app.post("/email-summary", async (req, res) => {
  try {
    const { date } = req.body ?? {};
    if (date === undefined || date === null || date === "") {
      return res.status(400).json({
        message: "Request body must include non-empty `date` (e.g. ISO string).",
      });
    }

    const d = new Date(date);
    if (Number.isNaN(d.getTime())) {
      return res.status(400).json({ message: "Invalid `date`; use a parseable value." });
    }

    const cacheKey = dateToCacheKey(d);
    const cached = getEmailSummaryCache(cacheKey);
    if (cached) {
      logInfo("email-summary", "cache hit", { cacheKey });
      res.set("X-Cache", "HIT");
      const withAudio = await enrichEmailSummaryWithAudio(
        /** @type {Record<string, unknown>} */ (cached),
      );
      setEmailSummaryCache(cacheKey, withAudio);
      const body = { ...withAudio, cached: true };
      setEmailContext({
        date: body.date,
        summaries: body.summaries ?? [],
        rawEmails: body.rawEmails ?? [],
        lastApiResponse: body,
      });
      return res.json(body);
    }

    const emails = await getEmailsByDate(d);

    if (emails.length === 0) {
      const empty = {
        date: d.toISOString(),
        count: 0,
        summaries: [],
        rawEmails: [],
      };
      const body = await enrichEmailSummaryWithAudio(
        /** @type {Record<string, unknown>} */ (empty),
      );
      setEmailSummaryCache(cacheKey, body);
      res.set("X-Cache", "MISS");
      setEmailContext({
        date: body.date,
        summaries: [],
        rawEmails: [],
        lastApiResponse: { ...body, cached: false },
      });
      return res.json({ ...body, cached: false });
    }

    const summaries = await summarizeEmails(emails);

    const rawEmails = emails.map((e) => ({
      sender: e.sender ?? "",
      subject: e.subject ?? "",
      body: typeof e.body === "string" ? e.body : "",
    }));

    const mergedSummaries = summaries.map((s, i) => ({
      ...s,
      subject: emails[i]?.subject ?? "",
    }));

    const base = {
      date: d.toISOString(),
      count: mergedSummaries.length,
      summaries: mergedSummaries,
      rawEmails,
    };
    const body = await enrichEmailSummaryWithAudio(
      /** @type {Record<string, unknown>} */ (base),
    );
    setEmailSummaryCache(cacheKey, body);
    res.set("X-Cache", "MISS");
    setEmailContext({
      date: body.date,
      summaries: body.summaries,
      rawEmails: body.rawEmails,
      lastApiResponse: { ...body, cached: false },
    });
    res.json({ ...body, cached: false });
  } catch (err) {
    logError("email-summary", err, { path: req.path });
    const message = err instanceof Error ? err.message : String(err);
    const lower = message.toLowerCase();
    const needsSetup =
      lower.includes("gmail not connected") ||
      lower.includes("open get /auth/google") ||
      lower.includes("google_client_id") ||
      lower.includes("google_redirect_uri");
    const status = needsSetup ? 503 : 500;
    res.status(status).json({ message });
  }
});

/**
 * POST /email-agent
 * Body: { "command": "show only high priority emails" | "reply to this email" | ... }
 * Uses last email-summary context in memory.
 */
app.post("/email-agent", async (req, res) => {
  try {
    const { command } = req.body ?? {};
    if (
      command === undefined ||
      command === null ||
      String(command).trim() === ""
    ) {
      return res
        .status(400)
        .json({ message: "Request body must include non-empty `command`." });
    }

    const result = await runEmailAgentCommand(String(command));
    res.json(result);
  } catch (err) {
    logError("email-agent", err, { path: req.path });
    const message = err instanceof Error ? err.message : String(err);
    const noContext = message.includes("No email context");
    const status = noContext ? 400 : 500;
    res.status(status).json({ message });
  }
});

/** @type {{ prNumber: number, source: string, target: string } | null} */
let pendingMerge = null;

// Step 1: command parse + PR create
app.post("/command", async (req, res) => {
  try {
    const { input } = req.body;

    const parsed = await parseCommand(input);

    if (parsed.action === "merge") {
      const pr = await createPR(parsed.source, parsed.target);

      pendingMerge = {
        prNumber: pr.number,
        source: parsed.source,
        target: parsed.target,
      };

      return res.json({
        message: `PR created: #${pr.number}. Confirm merge?`,
        source: parsed.source,
        target: parsed.target,
      });
    }

    res.json({ message: "Unknown command" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ message });
  }
});

// Step 2: confirmation
app.post("/confirm", async (req, res) => {
  try {
    if (!pendingMerge) {
      return res.json({ message: "No pending PR" });
    }

    const { prNumber, source, target } = pendingMerge;

    await mergePR(prNumber);

    pendingMerge = null;

    res.json({
      message: `Success: merged branch "${source}" into "${target}".`,
      source,
      target,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ message });
  }
});

// 5000 is often taken by macOS AirPlay and returns 403 in the browser
const PORT = Number(process.env.PORT) || 5001;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} (http://localhost:${PORT})`);
});