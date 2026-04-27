import { fail } from "./errors.ts";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?Z?)?$/;

function hasControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    if (value.charCodeAt(i) < 0x20) return true;
  }
  return false;
}

/**
 * Validate an ISO 8601 date or datetime string.
 * Rejects natural language dates, path traversals, and control characters.
 */
export function validateDate(
  value: string,
  field: string,
  command: string,
): void {
  if (hasControlChars(value)) {
    fail(
      `Invalid ${field}: contains control characters.`,
      "VALIDATION",
      command,
    );
  }
  if (value.includes("..") || value.includes("/")) {
    fail(
      `Invalid ${field}: contains path traversal characters.`,
      "VALIDATION",
      command,
    );
  }
  if (!ISO_DATE_PATTERN.test(value)) {
    fail(
      `Invalid ${field}: "${value}". Must be ISO 8601 (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SSZ).`,
      "VALIDATION",
      command,
    );
  }
}

/** Validate an account name. Rejects control chars, path traversal, encoded chars, overly long names. */
export function validateAccountName(value: string, command: string): void {
  const label = "account name";
  const maxLength = 64;
  if (hasControlChars(value)) {
    fail(
      `Invalid ${label}: contains control characters.`,
      "VALIDATION",
      command,
    );
  }
  if (value.includes("..") || value.includes("/") || value.includes("\\")) {
    fail(
      `Invalid ${label}: contains path traversal characters.`,
      "VALIDATION",
      command,
    );
  }
  if (value.includes("%") || value.includes("?") || value.includes("#")) {
    fail(
      `Invalid ${label}: contains encoded or query characters.`,
      "VALIDATION",
      command,
    );
  }
  if (value.length > maxLength) {
    fail(
      `Invalid ${label}: too long (max ${maxLength} characters).`,
      "VALIDATION",
      command,
    );
  }
}

/** Validate a profile type — must be exactly "business" or "personal". */
export function validateProfileType(value: string, command: string): void {
  const key = value.toLowerCase();
  if (key !== "business" && key !== "personal") {
    fail(
      `Invalid profile-type: "${value}". Must be "business" or "personal".`,
      "VALIDATION",
      command,
    );
  }
}
