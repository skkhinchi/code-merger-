import "dotenv/config";
import cors from "cors";
import express from "express";
import { parseCommand } from "./agent.js";
import {
  compareBranches,
  createPR,
  getRepoDetails,
  listBranches,
  listRepos,
  mergePR,
} from "./github.js";
import { summarizeEmails } from "./aiEmailService.js";
import { runEmailAgentCommand } from "./emailAgentService.js";
import { setEmailContext } from "./emailAgentContext.js";
import {
  dateToCacheKey,
  getEmailSummaryCache,
  setEmailSummaryCache,
} from "./emailSummaryCache.js";
import { getLangSmithProject, isLangSmithEnabled } from "./openaiClient.js";
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

/** @type {{ prNumber: number, source: string, target: string, owner: string, repo: string } | null} */
let pendingMerge = null;

app.get("/github/repos", async (req, res) => {
  try {
    const page = req.query.page;
    const perPage = req.query.per_page ?? req.query.perPage;
    const search = req.query.search ?? req.query.q ?? "";
    const result = await listRepos({ page, perPage, search });
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ message });
  }
});

app.get("/github/repos/:owner/:repo", async (req, res) => {
  try {
    const { owner, repo } = req.params;
    const details = await getRepoDetails(owner, repo);
    res.json({ repo: details });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ message });
  }
});

app.get("/github/repos/:owner/:repo/branches", async (req, res) => {
  try {
    const { owner, repo } = req.params;
    const branches = await listBranches(owner, repo);
    res.json({ branches });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ message });
  }
});

// Step 1: command parse + PR create
app.post("/command", async (req, res) => {
  try {
    const { input, owner, repo, source, target } = req.body ?? {};

    if (!owner || !repo) {
      return res.status(400).json({
        message: "Request body must include `owner` and `repo`.",
      });
    }

    let mergeSource = source;
    let mergeTarget = target;

    if (input && (!mergeSource || !mergeTarget)) {
      const parsed = await parseCommand(input);
      if (parsed.action !== "merge") {
        return res.json({ message: "Unknown command" });
      }
      mergeSource = parsed.source;
      mergeTarget = parsed.target;
    }

    if (!mergeSource || !mergeTarget) {
      return res.status(400).json({
        message:
          "Provide branch names via `source` and `target`, or a natural-language `input`.",
      });
    }

    let fileChanges = null;
    try {
      fileChanges = await compareBranches(
        mergeSource,
        mergeTarget,
        owner,
        repo
      );
    } catch (compareErr) {
      logError("compare-branches", compareErr, { owner, repo, mergeSource, mergeTarget });
    }

    const pr = await createPR(mergeSource, mergeTarget, owner, repo);

    pendingMerge = {
      prNumber: pr.number,
      source: mergeSource,
      target: mergeTarget,
      owner,
      repo,
      fileChanges,
    };

    return res.json({
      message: `PR created in ${owner}/${repo}: #${pr.number}. Confirm merge?`,
      source: mergeSource,
      target: mergeTarget,
      owner,
      repo,
      fileChanges,
    });
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

    const { prNumber, source, target, owner, repo } = pendingMerge;

    await mergePR(prNumber, owner, repo);

    pendingMerge = null;

    res.json({
      message: `Success: merged "${source}" into "${target}" in ${owner}/${repo}.`,
      source,
      target,
      owner,
      repo,
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
  if (isLangSmithEnabled()) {
    console.log(
      `LangSmith tracing enabled → project "${getLangSmithProject()}" (https://smith.langchain.com)`
    );
  }
});