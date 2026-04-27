/**
 * Structured error envelope helpers.
 *
 * Errors thrown across wisecli flow through here so agents receive a
 * consistent shape with retry guidance and semantic exit codes. The shape
 * adopts RFC 9457 (Problem Details) field names where applicable:
 *
 *   {
 *     "ok": false,
 *     "type": "https://wisecli.dev/errors/rate-limit",  // RFC 9457 type URI
 *     "title": "Wise API rate limit",                   // RFC 9457 short title
 *     "error": "Wise API 429: ...",                     // RFC 9457 'detail'
 *     "code": "ERR_RATE_LIMIT",
 *     "status": 429,                                    // RFC 9457 'status' (HTTP errors only)
 *     "is_retriable": true,
 *     "retry_after_seconds": 30,
 *     "trace_id": "wise-req-abc123",                    // RFC 9457 'instance'-equivalent
 *     "command": "transfers"
 *   }
 *
 * Exit codes follow sysexits.h conventions so agent harnesses can route
 * errors without parsing stdout:
 *   64  usage error (unknown command, no command supplied)
 *   65  validation failure (bad date, bad profile-type, malformed account name)
 *   66  not found (no such account, no such profile)
 *   69  service unavailable (5xx, network error, rate limit)
 *   77  permission denied (401/403 — bad or revoked token)
 *   1   generic fallback
 */

export type ErrorCode =
  | "ERR_USAGE"
  | "ERR_VALIDATION"
  | "ERR_NOT_FOUND"
  | "ERR_NO_TOKEN"
  | "ERR_AUTH"
  | "ERR_RATE_LIMIT"
  | "ERR_UNAVAILABLE"
  | "ERR_NETWORK"
  | "ERR_UNKNOWN";

export interface StructuredError {
  code: ErrorCode;
  is_retriable: boolean;
  exit_code: number;
  retry_after_seconds?: number;
  trace_id?: string;
}

const EXIT_CODES: Record<ErrorCode, number> = {
  ERR_USAGE: 64,
  ERR_VALIDATION: 65,
  ERR_NOT_FOUND: 66,
  ERR_NO_TOKEN: 66,
  ERR_AUTH: 77,
  ERR_RATE_LIMIT: 69,
  ERR_UNAVAILABLE: 69,
  ERR_NETWORK: 69,
  ERR_UNKNOWN: 1,
};

const RETRIABLE: Record<ErrorCode, boolean> = {
  ERR_USAGE: false,
  ERR_VALIDATION: false,
  ERR_NOT_FOUND: false,
  ERR_NO_TOKEN: false,
  ERR_AUTH: false,
  ERR_RATE_LIMIT: true,
  ERR_UNAVAILABLE: true,
  ERR_NETWORK: true,
  ERR_UNKNOWN: false,
};

/** RFC 9457 type URIs — stable identifiers for each error class. */
const ERROR_TYPE_BASE = "https://wisecli.dev/errors";
const TYPE_URIS: Record<ErrorCode, string> = {
  ERR_USAGE: `${ERROR_TYPE_BASE}/usage`,
  ERR_VALIDATION: `${ERROR_TYPE_BASE}/validation`,
  ERR_NOT_FOUND: `${ERROR_TYPE_BASE}/not-found`,
  ERR_NO_TOKEN: `${ERROR_TYPE_BASE}/no-token`,
  ERR_AUTH: `${ERROR_TYPE_BASE}/auth`,
  ERR_RATE_LIMIT: `${ERROR_TYPE_BASE}/rate-limit`,
  ERR_UNAVAILABLE: `${ERROR_TYPE_BASE}/unavailable`,
  ERR_NETWORK: `${ERROR_TYPE_BASE}/network`,
  ERR_UNKNOWN: `${ERROR_TYPE_BASE}/unknown`,
};

/** Short human-readable title per error class. */
const TITLES: Record<ErrorCode, string> = {
  ERR_USAGE: "CLI usage error",
  ERR_VALIDATION: "Input validation failed",
  ERR_NOT_FOUND: "Resource not found",
  ERR_NO_TOKEN: "No Wise token configured",
  ERR_AUTH: "Wise authentication failed",
  ERR_RATE_LIMIT: "Wise API rate limit",
  ERR_UNAVAILABLE: "Wise API unavailable",
  ERR_NETWORK: "Network error reaching Wise",
  ERR_UNKNOWN: "Unknown error",
};

/** HTTP error from the Wise API, carrying status and retry hints. */
export class ApiError extends Error {
  readonly status: number;
  readonly is_retriable: boolean;
  readonly retry_after_seconds?: number;
  readonly trace_id?: string;

  constructor(
    status: number,
    message: string,
    opts: { retry_after_seconds?: number; trace_id?: string } = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.is_retriable = status === 429 || status >= 500;
    this.retry_after_seconds = opts.retry_after_seconds;
    this.trace_id = opts.trace_id;
  }

  toCode(): ErrorCode {
    if (this.status === 401 || this.status === 403) return "ERR_AUTH";
    if (this.status === 429) return "ERR_RATE_LIMIT";
    if (this.status >= 500) return "ERR_UNAVAILABLE";
    return "ERR_UNKNOWN";
  }
}

/** Local error type for non-HTTP failures (validation, missing token, etc). */
export class WiseCliError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = "WiseCliError";
    this.code = code;
  }
}

interface FailEnvelope {
  ok: false;
  /** RFC 9457 type URI — stable identifier for this error class. */
  type: string;
  /** RFC 9457 short title — same for every instance of a code. */
  title: string;
  /** RFC 9457 detail — the specific message for this occurrence. */
  error: string;
  code: ErrorCode;
  is_retriable: boolean;
  /** HTTP status — only set for upstream API errors. */
  status?: number;
  command?: string;
  account?: string;
  retry_after_seconds?: number;
  trace_id?: string;
  hint?: string;
}

/** Public lookup so callers and tests can inspect the type URI registry. */
export function typeUriFor(code: ErrorCode): string {
  return TYPE_URIS[code];
}

/** Public lookup for the human-readable title for a given error code. */
export function titleFor(code: ErrorCode): string {
  return TITLES[code];
}

/** Emit a structured error envelope to stdout and exit with a semantic code. */
export function fail(
  message: string,
  code: ErrorCode = "ERR_UNKNOWN",
  command?: string,
  extra: {
    account?: string;
    hint?: string;
    retry_after_seconds?: number;
    trace_id?: string;
    status?: number;
  } = {},
): never {
  const envelope: FailEnvelope = {
    ok: false,
    type: TYPE_URIS[code],
    title: TITLES[code],
    error: message,
    code,
    is_retriable: RETRIABLE[code],
  };
  if (extra.status !== undefined) envelope.status = extra.status;
  if (command) envelope.command = command;
  if (extra.account) envelope.account = extra.account;
  if (extra.retry_after_seconds !== undefined)
    envelope.retry_after_seconds = extra.retry_after_seconds;
  if (extra.trace_id) envelope.trace_id = extra.trace_id;
  if (extra.hint) envelope.hint = extra.hint;

  process.stdout.write(`${JSON.stringify(envelope, null, 2)}\n`);
  process.exit(EXIT_CODES[code]);
}

/** Map any thrown value to a structured error and exit. */
export function failFromUnknown(
  err: unknown,
  command: string,
  account?: string,
): never {
  if (err instanceof ApiError) {
    const code = err.toCode();
    const hint =
      code === "ERR_AUTH"
        ? "Token may be invalid or revoked. Regenerate at wise.com/settings/api-tokens and update your WISE_<NAME>_TOKEN env var."
        : code === "ERR_RATE_LIMIT"
          ? "Wise API rate limit hit. Retry after the indicated interval."
          : code === "ERR_UNAVAILABLE"
            ? "Wise API is temporarily unavailable. Retry shortly."
            : undefined;
    fail(err.message, code, command, {
      account,
      hint,
      retry_after_seconds: err.retry_after_seconds,
      trace_id: err.trace_id,
      status: err.status,
    });
  }
  if (err instanceof WiseCliError) {
    fail(err.message, err.code, command, { account });
  }
  if (err instanceof TypeError && /fetch failed|network/i.test(err.message)) {
    fail(err.message, "ERR_NETWORK", command, {
      account,
      hint: "Network error reaching api.wise.com. Retry after checking connectivity.",
    });
  }
  fail(
    err instanceof Error ? err.message : String(err),
    "ERR_UNKNOWN",
    command,
    { account },
  );
}
