import { afterEach, describe, expect, it, vi } from "vitest";
import {
  validateAccountName,
  validateDate,
  validateProfileType,
} from "./validate.ts";

function expectExits(fn: () => void, pattern?: RegExp) {
  const exitSpy = vi.spyOn(process, "exit").mockImplementation(((
    _code?: number,
  ) => {
    throw new Error("__exit__");
  }) as unknown as never);
  const writeSpy = vi
    .spyOn(process.stdout, "write")
    .mockImplementation(() => true);

  try {
    expect(fn).toThrow("__exit__");
    if (pattern) {
      const written = writeSpy.mock.calls.map((c) => c[0]).join("");
      expect(written).toMatch(pattern);
    }
  } finally {
    exitSpy.mockRestore();
    writeSpy.mockRestore();
  }
}

describe("validateDate", () => {
  afterEach(() => vi.restoreAllMocks());

  it("accepts an ISO date", () => {
    expect(() => validateDate("2026-04-01", "from", "transfers")).not.toThrow();
  });

  it("rejects natural-language dates", () => {
    expectExits(
      () => validateDate("yesterday", "from", "transfers"),
      /ISO 8601/,
    );
  });
});

describe("validateAccountName", () => {
  afterEach(() => vi.restoreAllMocks());

  it("accepts a normal name", () => {
    expect(() => validateAccountName("business", "balance")).not.toThrow();
  });

  it("rejects path traversal", () => {
    expectExits(() => validateAccountName("../etc", "balance"));
  });
});

describe("validateProfileType", () => {
  afterEach(() => vi.restoreAllMocks());

  it("accepts business", () => {
    expect(() => validateProfileType("business", "balance")).not.toThrow();
  });

  it("accepts personal in any case", () => {
    expect(() => validateProfileType("PERSONAL", "balance")).not.toThrow();
  });

  it("rejects unknown values", () => {
    expectExits(
      () => validateProfileType("joint", "balance"),
      /business.*personal/,
    );
  });
});
