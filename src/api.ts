import { ApiError } from "./errors.ts";

/** Base URL for the Wise (TransferWise) API. */
export const BASE_URL = "https://api.wise.com";

export interface ApiOptions {
  /** Wise API token (env-supplied). */
  token: string;
  /** Path appended to {@link BASE_URL} (e.g. `/v2/profiles`). */
  path: string;
  method?: "GET";
  query?: Record<string, string | number | undefined>;
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds;
  const date = Date.parse(value);
  if (!Number.isNaN(date)) {
    return Math.max(0, Math.round((date - Date.now()) / 1000));
  }
  return undefined;
}

/**
 * Make an authenticated GET request to the Wise API.
 *
 * @throws ApiError if the response status is not 2xx. The error carries
 * `status`, `is_retriable`, `retry_after_seconds`, and `trace_id` for
 * agent-friendly retry decisions.
 */
export async function api<T>({
  token,
  path,
  method = "GET",
  query,
}: ApiOptions): Promise<T> {
  let url = `${BASE_URL}${path}`;
  if (query) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") {
        params.set(key, String(value));
      }
    }
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const traceId =
      res.headers.get("x-request-id") ??
      res.headers.get("x-trace-id") ??
      undefined;
    throw new ApiError(
      res.status,
      `Wise API ${res.status}: ${text || res.statusText}`,
      {
        retry_after_seconds: parseRetryAfter(res.headers.get("retry-after")),
        trace_id: traceId ?? undefined,
      },
    );
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return (await res.json()) as T;
  }
  return {} as T;
}

/** Format a numeric balance as a currency string. */
export function formatAmount(amount: number, currency: string): string {
  const symbol =
    currency === "GBP"
      ? "£"
      : currency === "USD"
        ? "$"
        : currency === "EUR"
          ? "€"
          : currency;
  return `${symbol}${amount.toFixed(2)}`;
}
