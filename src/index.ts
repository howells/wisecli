#!/usr/bin/env node
/**
 * wisecli — agent-first CLI for Wise (TransferWise).
 *
 * Tokens are env-supplied (WISE_<NAME>_TOKEN). One token can have multiple
 * Wise profiles (BUSINESS / PERSONAL); use --profile-type to pick.
 */

import { error, success } from "@howells/cli";
import { flag, getLimit, readResult } from "@howells/cli/args";
import {
  allAccounts,
  listConfiguredAccounts,
  resolveAccount,
} from "./accounts.ts";
import {
  balanceForAllProfiles,
  balanceForProfile,
  type TransfersOptions,
  transfers,
} from "./commands.ts";
import { listProfiles } from "./profiles.ts";
import {
  validateAccountName,
  validateDate,
  validateProfileType,
} from "./validate.ts";

const command = process.argv[2];

function getToken(cmd: string): { name: string; token: string } {
  const acctName = flag("account");
  if (acctName && acctName !== "all") validateAccountName(acctName, cmd);
  try {
    return resolveAccount(acctName);
  } catch (err) {
    error(err instanceof Error ? err.message : String(err), cmd);
  }
}

function readProfileType(cmd: string): string | undefined {
  const value = flag("profile-type");
  if (!value) return undefined;
  validateProfileType(value, cmd);
  return value.toLowerCase();
}

switch (command) {
  case "accounts": {
    const acctName = flag("account");
    if (acctName) {
      validateAccountName(acctName, "accounts");
      const { name, token } = getToken("accounts");
      (async () => {
        try {
          const profiles = await listProfiles(token);
          success({ token: name, profiles }, "accounts", { account: name });
        } catch (err) {
          error(err instanceof Error ? err.message : String(err), "accounts");
        }
      })();
    } else {
      success(
        {
          configured: listConfiguredAccounts(),
          note: "Use --account <name> to list profiles for that token.",
        },
        "accounts",
      );
    }
    break;
  }

  case "profiles": {
    const { name, token } = getToken("profiles");
    (async () => {
      try {
        const profiles = await listProfiles(token);
        readResult(
          "profiles",
          profiles as unknown as Record<string, unknown>[],
          { account: name },
        );
      } catch (err) {
        error(err instanceof Error ? err.message : String(err), "profiles");
      }
    })();
    break;
  }

  case "balance": {
    const acctName = flag("account");
    if (acctName) validateAccountName(acctName, "balance");
    const profileType = readProfileType("balance");

    if (acctName === "all" || (!acctName && allAccounts().length > 1)) {
      (async () => {
        try {
          const tokens = allAccounts();
          const rows = [];
          for (const t of tokens) {
            const part = await balanceForAllProfiles(t.token);
            for (const r of part) {
              rows.push({ ...r, account: t.name });
            }
          }
          success(rows, "balance", { account: "all" });
        } catch (err) {
          error(err instanceof Error ? err.message : String(err), "balance");
        }
      })();
      break;
    }

    const { name, token } = getToken("balance");
    (async () => {
      try {
        const data = profileType
          ? await balanceForProfile(token, profileType)
          : await balanceForAllProfiles(token);
        success(data, "balance", { account: name });
      } catch (err) {
        error(err instanceof Error ? err.message : String(err), "balance");
      }
    })();
    break;
  }

  case "transactions":
  case "transfers": {
    const { name, token } = getToken("transfers");
    const profileType = readProfileType("transfers");
    const from = flag("from");
    const to = flag("to");
    const status = flag("status");
    if (from) validateDate(from, "from", "transfers");
    if (to) validateDate(to, "to", "transfers");

    const options: TransfersOptions = {
      from: from || undefined,
      to: to || undefined,
      limit: getLimit("transfers") ?? undefined,
      status: status || undefined,
    };

    (async () => {
      try {
        const data = await transfers(token, profileType, options);
        readResult("transfers", data as unknown as Record<string, unknown>[], {
          account: name,
        });
      } catch (err) {
        error(err instanceof Error ? err.message : String(err), "transfers");
      }
    })();
    break;
  }

  case "schema":
    success(
      {
        cli: "wisecli",
        version: "0.1.0",
        description: "Agent-first CLI for Wise",
        accounts: listConfiguredAccounts(),
        auth: "Set WISE_<NAME>_TOKEN env vars (e.g. WISE_BUSINESS_TOKEN). Or WISE_API_TOKEN for a single-account fallback. Tokens have read access via api.wise.com.",
        commands: {
          accounts: {
            description:
              "List configured tokens, or list profiles for one token via --account <name>",
            params: { account: { type: "string" } },
          },
          profiles: {
            description: "List profiles (business/personal) under a token",
            params: { account: { type: "string" } },
            fields: ["id", "type", "name"],
          },
          balance: {
            description:
              "Balances. Default: all profiles for the first/named token. --account all aggregates across tokens.",
            params: {
              account: { type: "string" },
              "profile-type": {
                type: "string",
                enum: ["business", "personal"],
              },
            },
            fields: [
              "id",
              "profile",
              "currency",
              "amount",
              "formatted",
              "reserved",
              "cash",
              "type",
            ],
          },
          transfers: {
            description: "Outgoing/incoming transfers for a profile",
            params: {
              account: { type: "string" },
              "profile-type": {
                type: "string",
                enum: ["business", "personal"],
              },
              from: { type: "string", format: "ISO 8601" },
              to: { type: "string", format: "ISO 8601" },
              limit: { type: "integer", description: "Default: 100" },
              status: {
                type: "string",
                description: "Filter by Wise transfer status",
              },
              fields: { type: "string" },
            },
            fields: [
              "id",
              "status",
              "date",
              "sourceCurrency",
              "sourceValue",
              "sourceFormatted",
              "targetCurrency",
              "targetValue",
              "targetFormatted",
              "rate",
              "reference",
            ],
          },
        },
        flags: {
          "--account":
            "Token name derived from WISE_<NAME>_TOKEN env vars, or 'all'",
          "--profile-type":
            "Pick a profile within a token: 'business' or 'personal'",
          "--from": "ISO 8601 date for transfers (createdDateStart)",
          "--to": "ISO 8601 date for transfers (createdDateEnd)",
          "--limit": "Max results (default 100)",
          "--status": "Filter transfers by Wise status",
          "--fields": "Comma-separated field names to return",
        },
        readOnly: true,
      },
      "schema",
    );
    break;

  case "help":
  case "--help":
  case "-h":
    success(
      {
        usage:
          "wisecli <command> [--account <name>|all] [--profile-type business|personal] [--from <date>] [--to <date>] [--limit N] [--fields ...]",
        commands: ["accounts", "profiles", "balance", "transfers", "schema"],
        setup: [
          "1. Get an API token at https://wise.com/settings/api-tokens",
          "2. export WISE_API_TOKEN=... (single account) or",
          "   export WISE_BUSINESS_TOKEN=... and WISE_PERSONAL_TOKEN=... (multi)",
          "3. Run any command — wisecli reads the env directly.",
        ],
        flags: {
          "--account":
            "Token name derived from WISE_<NAME>_TOKEN env vars. Default: first configured. Use 'all' on balance.",
          "--profile-type":
            "'business' or 'personal' — required when a token has both",
          "--from": "ISO 8601 date — transfers created on or after this",
          "--to": "ISO 8601 date — transfers created on or before this",
          "--limit": "Max results",
          "--status": "Filter transfers by Wise status",
          "--fields": "Comma-separated field names to return",
        },
        notes: [
          "Read-only by design — no payment, transfer creation, or counterparty management.",
        ],
      },
      "help",
    );
    break;

  case undefined:
    error("No command provided. Run 'wisecli help' for usage.");
    break;

  default:
    error(`Unknown command: "${command}". Run 'wisecli help' for usage.`);
    break;
}
