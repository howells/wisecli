import { classifyHttpError, classifyNetworkError } from "@howells/cli";

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

/**
 * Make an authenticated GET request to the Wise API.
 *
 * @throws CliError (from @howells/cli) with structured `code`, `status`,
 *   `is_retriable`, and recovery hints. Network failures throw with
 *   `code: "NETWORK_ERROR"` and `is_retriable: true`.
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

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });
  } catch (err) {
    throw classifyNetworkError(err, { vendor: "Wise" });
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw classifyHttpError(res, text, {
      vendor: "Wise",
      authRecoveryHint:
        "Token may be invalid or revoked. Regenerate at wise.com/settings/api-tokens and update your WISE_<NAME>_TOKEN env var.",
    });
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
