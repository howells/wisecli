import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  allAccounts,
  listConfiguredAccounts,
  resolveAccount,
} from "./accounts.ts";

const ENV_KEYS = [
  "WISE_API_TOKEN",
  "WISE_TOKEN",
  "WISE_BUSINESS_TOKEN",
  "WISE_PERSONAL_TOKEN",
  "WISE_JOINT_GBP_TOKEN",
];

function snapshot(): Record<string, string | undefined> {
  return Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
}

function restore(snap: Record<string, string | undefined>) {
  for (const k of ENV_KEYS) {
    if (snap[k] === undefined) delete process.env[k];
    else process.env[k] = snap[k];
  }
}

describe("accounts discovery", () => {
  let snap: Record<string, string | undefined>;

  beforeEach(() => {
    snap = snapshot();
    for (const k of ENV_KEYS) delete process.env[k];
  });

  afterEach(() => restore(snap));

  it("treats WISE_API_TOKEN as 'default'", () => {
    process.env.WISE_API_TOKEN = "tok-default";
    expect(listConfiguredAccounts()).toEqual(["default"]);
    expect(resolveAccount(undefined)).toEqual({
      name: "default",
      token: "tok-default",
    });
  });

  it("derives account names from WISE_<NAME>_TOKEN", () => {
    process.env.WISE_BUSINESS_TOKEN = "biz";
    process.env.WISE_PERSONAL_TOKEN = "personal";
    const names = listConfiguredAccounts().sort();
    expect(names).toEqual(["business", "personal"]);
  });

  it("hyphenates underscored names", () => {
    process.env.WISE_JOINT_GBP_TOKEN = "joint";
    expect(listConfiguredAccounts()).toContain("joint-gbp");
  });

  it("matches by exact name", () => {
    process.env.WISE_BUSINESS_TOKEN = "biz";
    process.env.WISE_PERSONAL_TOKEN = "personal";
    expect(resolveAccount("personal").token).toBe("personal");
  });

  it("matches by prefix when no exact match", () => {
    process.env.WISE_BUSINESS_TOKEN = "biz";
    expect(resolveAccount("bus").name).toBe("business");
  });

  it("throws when nothing is configured", () => {
    expect(() => allAccounts()).toThrow(/No Wise tokens/);
    expect(() => resolveAccount(undefined)).toThrow(/No Wise tokens/);
  });

  it("throws on unknown name", () => {
    process.env.WISE_BUSINESS_TOKEN = "biz";
    expect(() => resolveAccount("nope")).toThrow(/No account "nope"/);
  });
});
