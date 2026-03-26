/**
 * Structured stderr logging for debugging and operations.
 * @param {"error"|"warn"|"info"} level
 * @param {string} scope
 * @param {unknown} err
 * @param {Record<string, unknown>} [extra]
 */
export function log(level, scope, err, extra = {}) {
  const payload = {
    level,
    time: new Date().toISOString(),
    scope,
    message: err instanceof Error ? err.message : String(err),
    ...(err instanceof Error && err.stack ? { stack: err.stack } : {}),
    ...extra,
  };
  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export function logError(scope, err, extra) {
  log("error", scope, err, extra);
}

export function logWarn(scope, err, extra) {
  log("warn", scope, err, extra);
}

export function logInfo(scope, msg, extra = {}) {
  console.log(
    JSON.stringify({
      level: "info",
      time: new Date().toISOString(),
      scope,
      message: msg,
      ...extra,
    })
  );
}
