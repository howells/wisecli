import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listProfiles, pickProfile, type WiseProfile } from "./profiles.ts";

function mockFetch(payload: unknown) {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;
}

describe("listProfiles", () => {
  let originalFetch: typeof fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("normalizes profile types to lowercase", async () => {
    mockFetch([
      {
        id: 1,
        type: "BUSINESS",
        details: { name: "Acme Ltd" },
      },
      {
        id: 2,
        type: "PERSONAL",
        details: { firstName: "Jane", lastName: "Doe" },
      },
    ]);
    const profiles = await listProfiles("token");
    expect(profiles).toEqual([
      { id: 1, type: "business", name: "Acme Ltd" },
      { id: 2, type: "personal", name: "Jane Doe" },
    ]);
  });

  it("falls back to a sensible name when details are missing", async () => {
    mockFetch([{ id: 9, type: "PERSONAL" }]);
    const profiles = await listProfiles("token");
    expect(profiles[0]?.name).toBe("Personal");
  });
});

describe("pickProfile", () => {
  const business: WiseProfile = { id: 1, type: "business", name: "B" };
  const personal: WiseProfile = { id: 2, type: "personal", name: "P" };

  it("returns the only profile when there's just one", () => {
    expect(pickProfile([business], undefined)).toBe(business);
  });

  it("requires --profile-type when there are multiple profiles and none is given", () => {
    expect(() => pickProfile([business, personal], undefined)).toThrow(
      /multiple profiles/,
    );
  });

  it("matches by type case-insensitively", () => {
    expect(pickProfile([business, personal], "BUSINESS")).toBe(business);
  });

  it("throws when the requested type is missing", () => {
    expect(() => pickProfile([business], "personal")).toThrow(
      /No "personal" profile/,
    );
  });

  it("throws when the profile list is empty", () => {
    expect(() => pickProfile([], undefined)).toThrow(/No Wise profiles/);
  });
});
