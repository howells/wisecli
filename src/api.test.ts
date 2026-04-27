import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, BASE_URL, formatAmount } from "./api.ts";

describe("formatAmount", () => {
  it("uses currency-specific symbols for GBP/USD/EUR", () => {
    expect(formatAmount(12.5, "GBP")).toBe("£12.50");
    expect(formatAmount(7, "USD")).toBe("$7.00");
    expect(formatAmount(3.1, "EUR")).toBe("€3.10");
  });

  it("falls back to the currency code for unknown codes", () => {
    expect(formatAmount(100, "JPY")).toBe("JPY100.00");
  });
});

describe("api()", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("attaches the bearer token", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await api({ token: "tok-1", path: "/v2/profiles" });

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    const headers = init?.headers as Record<string, string> | undefined;
    expect(headers?.Authorization).toBe("Bearer tok-1");
  });

  it("appends defined query params and skips empty ones", async () => {
    let calledUrl = "";
    globalThis.fetch = (async (url: string) => {
      calledUrl = url;
      return new Response("[]", {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    await api({
      token: "t",
      path: "/v1/transfers",
      query: {
        profile: 123,
        createdDateStart: "2026-01-01",
        createdDateEnd: undefined,
        limit: 50,
      },
    });

    expect(calledUrl).toBe(
      `${BASE_URL}/v1/transfers?profile=123&createdDateStart=2026-01-01&limit=50`,
    );
  });

  it("throws with the response status when not OK", async () => {
    globalThis.fetch = (async () =>
      new Response("nope", { status: 401 })) as unknown as typeof fetch;
    await expect(api({ token: "t", path: "/x" })).rejects.toThrow(
      /Wise API 401/,
    );
  });
});
