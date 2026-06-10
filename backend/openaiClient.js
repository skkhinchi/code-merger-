import OpenAI from "openai";
import { wrapOpenAI } from "langsmith/wrappers";

/** @type {import("openai").OpenAI | null} */
let client = null;

function tracingFlagEnabled() {
  const flags = [
    process.env.LANGSMITH_TRACING,
    process.env.LANGSMITH_TRACING_V2,
    process.env.LANGCHAIN_TRACING,
    process.env.LANGCHAIN_TRACING_V2,
  ];
  return flags.some((v) => v === "true");
}

export function isLangSmithEnabled() {
  return (
    tracingFlagEnabled() &&
    typeof process.env.LANGSMITH_API_KEY === "string" &&
    process.env.LANGSMITH_API_KEY.trim() !== ""
  );
}

export function getLangSmithProject() {
  return (
    process.env.LANGSMITH_PROJECT ??
    process.env.LANGCHAIN_PROJECT ??
    "default"
  );
}

/**
 * Shared OpenAI client. When LangSmith env vars are set, calls are traced automatically.
 * @returns {import("openai").OpenAI}
 */
export function getOpenAI() {
  if (client) return client;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY in environment");
  }

  const base = new OpenAI({ apiKey });
  client = isLangSmithEnabled() ? wrapOpenAI(base) : base;
  return client;
}

/** Call after changing LangSmith env vars (tests only). */
export function resetOpenAIClient() {
  client = null;
}
