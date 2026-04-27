#!/usr/bin/env node
/**
 * wisecli — agent-first CLI for Wise (TransferWise).
 *
 * Tokens are env-supplied (WISE_<NAME>_TOKEN). One token can have multiple
 * Wise profiles (BUSINESS / PERSONAL); use --profile-type to pick.
 */

import { filterFields, success } from "@howells/cli";
import { flag, getFields, getLimit, readResult } from "@howells/cli/args";
// Wise transfers paginate via offset; surface as --offset.
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
import { fail, failFromUnknown } from "./errors.ts";
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
    failFromUnknown(err, cmd);
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
          failFromUnknown(err, "accounts");
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
        failFromUnknown(err, "profiles");
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
          const rows: Array<Record<string, unknown>> = [];
          for (const t of tokens) {
            const part = await balanceForAllProfiles(t.token);
            for (const r of part) {
              rows.push({ ...r, account: t.name });
            }
          }
          success(filterFields(rows, getFields("balance")), "balance", {
            account: "all",
          });
        } catch (err) {
          failFromUnknown(err, "balance", "all");
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
        success(
          filterFields(
            data as unknown as Record<string, unknown>[],
            getFields("balance"),
          ),
          "balance",
          { account: name },
        );
      } catch (err) {
        failFromUnknown(err, "balance", name);
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
    const offsetRaw = flag("offset");
    if (from) validateDate(from, "from", "transfers");
    if (to) validateDate(to, "to", "transfers");
    let offset: number | undefined;
    if (offsetRaw !== undefined) {
      const parsed = Number(offsetRaw);
      if (!Number.isInteger(parsed) || parsed < 0) {
        fail(
          `Invalid offset: "${offsetRaw}". Must be a non-negative integer.`,
          "ERR_VALIDATION",
          "transfers",
        );
      }
      offset = parsed;
    }

    const options: TransfersOptions = {
      from: from || undefined,
      to: to || undefined,
      limit: getLimit("transfers") ?? undefined,
      status: status || undefined,
      offset,
    };

    (async () => {
      try {
        const page = await transfers(token, profileType, options);
        // readResult applies --fields filtering on row arrays. Filter rows,
        // then surface pagination metadata at the envelope level via `extra`.
        readResult(
          "transfers",
          page.transfers as unknown as Record<string, unknown>[],
          {
            account: name,
            has_more: page.has_more,
            next_offset: page.next_offset,
            offset: page.offset,
            limit: page.limit,
          },
        );
      } catch (err) {
        failFromUnknown(err, "transfers", name);
      }
    })();
    break;
  }

  case "schema":
    success(
      {
        cli: "wisecli",
        version: "0.1.0",
        description: "Agent-first read-only CLI for Wise (TransferWise).",
        readOnly: true,
        mcp_server: {
          bin: "wisecli-mcp",
          note: "Same operations exposed as MCP tools over stdio. Set WISE_<NAME>_TOKEN env vars on the host process and wire the bin in your MCP host config.",
        },
        auth: {
          mechanism: "Bearer token",
          source:
            "Env vars matching WISE_<NAME>_TOKEN. WISE_API_TOKEN or WISE_TOKEN map to --account default. Other names are derived (WISE_BUSINESS_TOKEN → --account business). Tokens are passed straight to api.wise.com — create a read-only token at wise.com/settings/api-tokens.",
        },
        accounts: listConfiguredAccounts(),
        commands: {
          accounts: {
            description:
              "List configured token accounts, or with --account <name> list the Wise profiles within that token. Use when you need to see what's available before calling balance or transfers. Do not use to list a token's profiles without --account; the bare command only shows token names.",
            params: {
              account: {
                type: "string",
                description:
                  "Token account name (from WISE_<NAME>_TOKEN). Optional — omitting it lists configured tokens.",
              },
            },
          },
          profiles: {
            description:
              "List Wise profiles (BUSINESS/PERSONAL) under a single token. Use before balance/transfers when you need to know which profile types exist. Do not use to list token accounts (use 'accounts' for that).",
            params: {
              account: {
                type: "string",
                description:
                  "Token account name. Defaults to the first configured.",
              },
            },
            fields: ["id", "type", "name"],
          },
          balance: {
            description:
              "Per-currency balances. Default: every profile under the first/named token. Use when the user asks about money, current balances, or available funds. Do not use for transfer history. --account all aggregates across every configured token.",
            params: {
              account: {
                type: "string",
                description:
                  "Token account name, or 'all' to aggregate across every configured token.",
              },
              "profile-type": {
                type: "string",
                enum: ["business", "personal"],
                description:
                  "Required when a token has both BUSINESS and PERSONAL profiles and you want only one.",
              },
              fields: {
                type: "string",
                description:
                  "Comma-separated field names to project. Example: 'profile,currency,formatted'.",
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
            description:
              "Outgoing/incoming transfers for one profile. Use when the user asks about transfer history, recent transactions, sent payments, or wants to filter by date or status. Do not use for current balances. Always pair with --fields to keep responses small.",
            params: {
              account: {
                type: "string",
                description:
                  "Token account name. Required when more than one token is configured.",
              },
              "profile-type": {
                type: "string",
                enum: ["business", "personal"],
                description: "Required when a token has both profiles.",
              },
              from: {
                type: "string",
                format: "ISO 8601",
                description:
                  "Only transfers created on or after this date. Example: '2026-04-01' or '2026-04-01T00:00:00Z'.",
              },
              to: {
                type: "string",
                format: "ISO 8601",
                description: "Only transfers created on or before this date.",
              },
              limit: {
                type: "integer",
                description: "Max results. Default 100. Cap 500.",
              },
              offset: {
                type: "integer",
                description:
                  "Skip this many results before returning. Use with next_offset from a prior page to paginate.",
              },
              status: {
                type: "string",
                enum: [
                  "incoming_payment_waiting",
                  "incoming_payment_initiated",
                  "processing",
                  "funds_converted",
                  "outgoing_payment_sent",
                  "charged_back",
                  "cancelled",
                  "funds_refunded",
                  "bounced_back",
                  "unknown",
                ],
                description: "Filter by Wise transfer status.",
              },
              fields: {
                type: "string",
                description:
                  "Comma-separated field names to return. Example: 'sourceFormatted,targetFormatted,date,status'.",
              },
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
          schema: {
            description:
              "Returns this manifest. Use at session start or when you need to know what fields a balance or transfer row contains.",
            params: {},
          },
          help: {
            description:
              "Print human-friendly usage to stdout (still as JSON envelope).",
            params: {},
          },
        },
        flags: {
          "--account":
            "Token account name (from WISE_<NAME>_TOKEN), or 'all' on balance.",
          "--profile-type":
            "Pick a profile within a token: 'business' or 'personal'.",
          "--from": "ISO 8601 date for transfers (createdDateStart).",
          "--to": "ISO 8601 date for transfers (createdDateEnd).",
          "--limit": "Max results. Default 100.",
          "--offset": "Skip N results (transfers pagination).",
          "--status": "Filter transfers by Wise status.",
          "--fields": "Comma-separated field names to return.",
        },
        envelope: {
          success: {
            ok: true,
            data: "<command output>",
            command: "<name>",
            account: "<name>",
          },
          error: {
            ok: false,
            error: "<message>",
            code: "ERR_USAGE | ERR_VALIDATION | ERR_NOT_FOUND | ERR_NO_TOKEN | ERR_AUTH | ERR_RATE_LIMIT | ERR_UNAVAILABLE | ERR_NETWORK | ERR_UNKNOWN",
            is_retriable: "boolean",
            retry_after_seconds: "number?",
            trace_id: "string?",
            hint: "string?",
            command: "<name>",
          },
        },
        exit_codes: {
          "0": "success",
          "64": "usage error (unknown command, no command supplied)",
          "65": "validation failure",
          "66": "not found (account/profile/token)",
          "69": "service unavailable (5xx, network, rate limit)",
          "77": "permission denied (401/403)",
          "1": "generic fallback",
        },
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
    fail("No command provided. Run 'wisecli help' for usage.", "ERR_USAGE");
    break;

  default:
    fail(
      `Unknown command: "${command}". Run 'wisecli help' for usage.`,
      "ERR_USAGE",
    );
}
