/**
 * Wise-specific error helpers built on @howells/cli's CliError.
 *
 * The shared infrastructure (CliError class, EXIT constants, exitCodeFor,
 * reportError, reportSuccess, reportNdjson, stringify, classifyHttpError)
 * lives in `@howells/cli`. This module keeps a few Wise-specific aliases
 * for backward compat with existing call sites.
 */

import {
  CliError,
  type CliErrorOptions,
  type ErrorCode,
  reportError,
} from "@howells/cli";

export {
  asCliError,
  CliError,
  EXIT,
  errorEnvelope,
  exitCodeFor,
  reportError,
  reportNdjson,
  reportSuccess,
  stringify,
} from "@howells/cli";

/**
 * Backward-compat alias — existing code uses `WiseCliError` for non-HTTP
 * failures (validation, no token, etc). New code should `throw new
 * CliError(...)` directly with the appropriate code.
 */
export class WiseCliError extends CliError {
  constructor(code: ErrorCode, message: string) {
    super(message, { code });
    this.name = "WiseCliError";
  }
}

/**
 * Backward-compat alias for the HTTP error class. Real HTTP classification
 * now happens in `@howells/cli`'s `classifyHttpError` — this is kept so
 * existing consumers can still `instanceof ApiError` against errors that
 * were thrown via the legacy paths.
 *
 * New code should not throw `ApiError` directly — use the helpers in
 * `@howells/cli` (`classifyHttpError`, `classifyNetworkError`) which
 * produce typed `CliError` instances.
 */
export class ApiError extends CliError {
  constructor(
    status: number,
    message: string,
    opts: { retry_after_seconds?: number; trace_id?: string } = {},
  ) {
    super(message, {
      code:
        status === 429
          ? "RATE_LIMITED"
          : status >= 500
            ? "API_ERROR"
            : "AUTH_REFUSED",
      status,
      is_retriable: status === 429 || status >= 500,
      retry_after_seconds: opts.retry_after_seconds,
      trace_id: opts.trace_id,
    });
    this.name = "ApiError";
  }
}

/**
 * Backward-compat alias for `reportError`. Existing code calls
 * `failFromUnknown(err, command, account)` — we forward to the unified
 * reporter and pass `account` through `extra` if provided.
 */
export function failFromUnknown(
  err: unknown,
  command: string,
  account?: string,
): never {
  if (account && err instanceof CliError) {
    // Re-throw with account mixed in via extra. The unified reporter
    // serializes extra into the envelope.
    const merged = new CliError(err.message, {
      code: err.code,
      status: err.status,
      is_retriable: err.is_retriable,
      retry_after_seconds: err.retry_after_seconds,
      recovery_hint: err.recovery_hint,
      suggestions: err.suggestions,
      trace_id: err.trace_id,
      extra: { ...(err.extra ?? {}), account },
    });
    reportError(merged, command);
  }
  reportError(err, command);
}

/**
 * Backward-compat — emits a structured error and exits. Prefer throwing a
 * `CliError` and calling `reportError` from a single top-level catch.
 */
export function fail(
  message: string,
  code: ErrorCode = "INTERNAL",
  command?: string,
  extra: {
    account?: string;
    hint?: string;
    retry_after_seconds?: number;
    trace_id?: string;
    status?: number;
  } = {},
): never {
  const opts: CliErrorOptions = {
    code,
    is_retriable:
      code === "RATE_LIMITED" ||
      code === "API_ERROR" ||
      code === "NETWORK_ERROR",
    recovery_hint: extra.hint,
    retry_after_seconds: extra.retry_after_seconds,
    trace_id: extra.trace_id,
    status: extra.status,
    extra: extra.account ? { account: extra.account } : undefined,
  };
  reportError(new CliError(message, opts), command);
}

/**
 * Backward-compat lookups — older tests/code may import these. Both now
 * return generic strings since the type/title vocabulary lived in wisecli;
 * @howells/cli uses simple stable codes instead.
 */
export function typeUriFor(code: ErrorCode): string {
  return `https://wisecli.dev/errors/${String(code).toLowerCase().replace(/_/g, "-")}`;
}

export function titleFor(code: ErrorCode): string {
  return TITLES[String(code)] ?? "Unknown error";
}

const TITLES: Record<string, string> = {
  USAGE: "CLI usage error",
  ERR_USAGE: "CLI usage error",
  VALIDATION: "Input validation failed",
  ERR_VALIDATION: "Input validation failed",
  NOT_FOUND: "Resource not found",
  ERR_NOT_FOUND: "Resource not found",
  ERR_NO_TOKEN: "No Wise token configured",
  AUTH_MISSING: "No Wise token configured",
  AUTH_REFUSED: "Wise authentication failed",
  AUTH_EXPIRED: "Wise authentication failed",
  ERR_AUTH: "Wise authentication failed",
  RATE_LIMITED: "Wise API rate limit",
  ERR_RATE_LIMIT: "Wise API rate limit",
  API_ERROR: "Wise API unavailable",
  ERR_UNAVAILABLE: "Wise API unavailable",
  NETWORK_ERROR: "Network error reaching Wise",
  ERR_NETWORK: "Network error reaching Wise",
  INTERNAL: "Unknown error",
  ERR_UNKNOWN: "Unknown error",
};

/** Legacy type alias — kept so existing imports compile. */
export type ErrorCode_Legacy = ErrorCode;
export type { ErrorCode };
