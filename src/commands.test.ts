import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  balanceForAllProfiles,
  balanceForProfile,
  transfers,
} from "./commands.ts";

const fakeProfilesPayload = [
  { id: 1, type: "BUSINESS", details: { name: "Acme" } },
  { id: 2, type: "PERSONAL", details: { firstName: "Jane" } },
];

const fakeBalancesByProfile: Record<number, unknown[]> = {
  1: [
    {
      id: 11,
      currency: "GBP",
      amount: { value: 1000.5, currency: "GBP" },
      reservedAmount: { value: 0, currency: "GBP" },
      cashAmount: { value: 1000.5, currency: "GBP" },
      type: "STANDARD",
    },
    {
      id: 12,
      currency: "USD",
      amount: { value: 250, currency: "USD" },
      type: "STANDARD",
    },
  ],
  2: [
    {
      id: 21,
      currency: "GBP",
      amount: { value: 50, currency: "GBP" },
      type: "STANDARD",
    },
  ],
};

function setupFetch() {
  globalThis.fetch = (async (url: string) => {
    if (url.endsWith("/v2/profiles")) {
      return new Response(JSON.stringify(fakeProfilesPayload), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    const match = url.match(/\/v4\/profiles\/(\d+)\/balances/);
    if (match) {
      const id = Number(match[1]);
      return new Response(JSON.stringify(fakeBalancesByProfile[id] ?? []), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("[]", {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

describe("balanceForProfile", () => {
  let originalFetch: typeof fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns balances scoped to the picked profile type", async () => {
    setupFetch();
    const rows = await balanceForProfile("token", "business");
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.profile === "business")).toBe(true);
    expect(rows[0]).toMatchObject({
      currency: "GBP",
      formatted: "£1000.50",
    });
  });

  it("auto-picks the profile when only one exists", async () => {
    globalThis.fetch = (async (url: string) => {
      if (url.endsWith("/v2/profiles")) {
        return new Response(JSON.stringify([fakeProfilesPayload[0]]), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify(fakeBalancesByProfile[1] ?? []), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;
    const rows = await balanceForProfile("token", undefined);
    expect(rows[0]?.profile).toBe("business");
  });
});

describe("balanceForAllProfiles", () => {
  let originalFetch: typeof fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("flattens balances across every profile under the token", async () => {
    setupFetch();
    const rows = await balanceForAllProfiles("token");
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.profile).sort()).toEqual([
      "business",
      "business",
      "personal",
    ]);
  });
});

describe("transfers", () => {
  let originalFetch: typeof fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("queries with the resolved profile id and maps each transfer", async () => {
    let lastUrl = "";
    globalThis.fetch = (async (url: string) => {
      lastUrl = url;
      if (url.endsWith("/v2/profiles")) {
        return new Response(JSON.stringify([fakeProfilesPayload[0]]), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify([
          {
            id: 999,
            sourceCurrency: "GBP",
            targetCurrency: "USD",
            sourceValue: 100,
            targetValue: 125,
            status: "outgoing_payment_sent",
            rate: 1.25,
            created: "2026-04-10T08:00:00Z",
            details: { reference: "Invoice 7" },
          },
        ]),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    }) as unknown as typeof fetch;

    const rows = await transfers("token", "business", {
      from: "2026-04-01",
      limit: 10,
    });

    expect(lastUrl).toContain("profile=1");
    expect(lastUrl).toContain("createdDateStart=2026-04-01");
    expect(lastUrl).toContain("limit=10");
    expect(rows[0]).toMatchObject({
      id: 999,
      sourceFormatted: "£100.00",
      targetFormatted: "$125.00",
      reference: "Invoice 7",
      rate: 1.25,
    });
  });
});
