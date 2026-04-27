/**
 * Wise profile discovery.
 *
 * Each Wise account token can have multiple profiles, typically one of
 * `PERSONAL` or `BUSINESS`. Most CLI commands take a profile id implicitly
 * (resolved from the token) or explicitly via `--profile <type>`.
 */

import { api } from "./api.ts";
import { WiseCliError } from "./errors.ts";

export interface RawWiseProfile {
  id: number;
  type: "PERSONAL" | "BUSINESS";
  details?: {
    firstName?: string;
    lastName?: string;
    name?: string;
    primaryAddress?: number;
  };
}

export interface WiseProfile {
  id: number;
  type: "personal" | "business";
  name: string;
}

function deriveName(p: RawWiseProfile): string {
  if (p.details?.name) return p.details.name;
  const first = p.details?.firstName?.trim();
  const last = p.details?.lastName?.trim();
  if (first || last) return [first, last].filter(Boolean).join(" ");
  return p.type === "BUSINESS" ? "Business" : "Personal";
}

/** Fetch every Wise profile under a token. */
export async function listProfiles(token: string): Promise<WiseProfile[]> {
  const raw = await api<RawWiseProfile[]>({ token, path: "/v2/profiles" });
  return raw.map((p) => ({
    id: p.id,
    type: p.type === "BUSINESS" ? "business" : "personal",
    name: deriveName(p),
  }));
}

/**
 * Resolve a profile by type. If no type is given and the token has exactly
 * one profile, return it. If multiple profiles exist and none is selected,
 * throw — the caller must specify.
 */
export function pickProfile(
  profiles: WiseProfile[],
  type: string | undefined,
): WiseProfile {
  if (profiles.length === 0) {
    throw new WiseCliError(
      "ERR_NOT_FOUND",
      "No Wise profiles found under this token. Check the token has API access.",
    );
  }

  if (type) {
    const key = type.toLowerCase();
    const match = profiles.find((p) => p.type === key);
    if (!match) {
      throw new WiseCliError(
        "ERR_NOT_FOUND",
        `No "${type}" profile under this token. Available: ${profiles
          .map((p) => p.type)
          .join(", ")}.`,
      );
    }
    return match;
  }

  if (profiles.length === 1) {
    return profiles[0] as WiseProfile;
  }

  throw new WiseCliError(
    "ERR_VALIDATION",
    `This token has multiple profiles (${profiles
      .map((p) => p.type)
      .join(", ")}). Pass --profile-type business|personal.`,
  );
}
