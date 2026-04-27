import { error, hardenId } from "@howells/cli";

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
    error(`Invalid ${field}: contains control characters.`, command);
  }
  if (value.includes("..") || value.includes("/")) {
    error(`Invalid ${field}: contains path traversal characters.`, command);
  }
  if (!ISO_DATE_PATTERN.test(value)) {
    error(
      `Invalid ${field}: "${value}". Must be ISO 8601 (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SSZ).`,
      command,
    );
  }
}

/** Validate an account name supplied via --account. */
export function validateAccountName(value: string, command: string): void {
  hardenId(value, command, { maxLength: 64, label: "account name" });
}

/** Validate a profile type — must be exactly "business" or "personal". */
export function validateProfileType(value: string, command: string): void {
  const key = value.toLowerCase();
  if (key !== "business" && key !== "personal") {
    error(
      `Invalid profile-type: "${value}". Must be "business" or "personal".`,
      command,
    );
  }
}
