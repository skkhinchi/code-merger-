import { traceable } from "langsmith/traceable";
import { isLangSmithEnabled } from "./openaiClient.js";

/**
 * Wraps a function with LangSmith tracing when enabled; otherwise returns it unchanged.
 * @template {(...args: unknown[]) => unknown} T
 * @param {T} fn
 * @param {{ name: string, run_type?: string, metadata?: Record<string, unknown> }} options
 * @returns {T}
 */
export function withTracing(fn, options) {
  if (!isLangSmithEnabled()) return fn;
  return traceable(fn, options);
}
