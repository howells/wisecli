/**
 * Multi-token resolution.
 *
 * Tokens are discovered from env vars matching `WISE_*_TOKEN`.
 * The prefix becomes the account name:
 *   WISE_BUSINESS_TOKEN → "business"
 *   WISE_PERSONAL_TOKEN → "personal"
 *   WISE_API_TOKEN      → "default" (single-account fallback)
 *
 * Each token may have multiple Wise profiles (BUSINESS / PERSONAL) under it,
 * which {@link ./profiles.ts} discovers from the API.
 */

export interface AccountConfig {
  name: string;
  token: string;
}

function discoverAccounts(): AccountConfig[] {
  const accounts: AccountConfig[] = [];

  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith("WISE_") || !key.endsWith("_TOKEN") || !value) continue;
    if (key === "WISE_API_TOKEN" || key === "WISE_TOKEN") {
      accounts.push({ name: "default", token: value });
      continue;
    }
    const name = key
      .replace("WISE_", "")
      .replace("_TOKEN", "")
      .toLowerCase()
      .replace(/_/g, "-");
    accounts.push({ name, token: value });
  }

  return accounts;
}

export function resolveAccount(name: string | undefined): AccountConfig {
  const accounts = discoverAccounts();

  if (name) {
    const key = name.toLowerCase();
    const match = accounts.find((a) => a.name === key);
    if (match) return match;
    const partial = accounts.find((a) => a.name.startsWith(key));
    if (partial) return partial;
    throw new Error(
      `No account "${name}" found. Available: ${
        accounts.map((a) => a.name).join(", ") || "none"
      }. Set WISE_<NAME>_TOKEN env vars.`,
    );
  }

  if (accounts.length === 0) {
    throw new Error(
      "No Wise tokens found. Set WISE_API_TOKEN or WISE_<NAME>_TOKEN env vars.",
    );
  }

  return accounts[0] as AccountConfig;
}

export function allAccounts(): AccountConfig[] {
  const accounts = discoverAccounts();
  if (accounts.length === 0) {
    throw new Error(
      "No Wise tokens found. Set WISE_API_TOKEN or WISE_<NAME>_TOKEN env vars.",
    );
  }
  return accounts;
}

export function listConfiguredAccounts(): string[] {
  return discoverAccounts().map((a) => a.name);
}
