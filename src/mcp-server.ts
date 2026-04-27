#!/usr/bin/env node

/**
 * MCP server for wisecli.
 *
 * Exposes the same five operations as the CLI as agent-callable tools over
 * stdio. All tools are read-only and call api.wise.com directly. Tokens come
 * from the host process's environment (WISE_<NAME>_TOKEN) — the server does
 * not accept tokens via parameters.
 *
 * Wire it up in an MCP host config like:
 *   {
 *     "mcpServers": {
 *       "wisecli": {
 *         "command": "wisecli-mcp",
 *         "env": { "WISE_API_TOKEN": "..." }
 *       }
 *     }
 *   }
 */

import { toMcpToolError } from "@howells/cli/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { z } from "zod";
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

const PROFILE_TYPE = z
  .enum(["business", "personal"])
  .describe("Wise profile type. Required when a token has both profiles.");

const ACCOUNT = z
  .string()
  .describe(
    "Token name derived from a WISE_<NAME>_TOKEN env var (e.g. 'business', 'personal', 'default'). Omit to use the first configured token.",
  );

const KNOWN_TRANSFER_STATUSES = [
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
] as const;

// Shared output schemas so each tool advertises its response shape.
// These mirror the runtime types in commands.ts / profiles.ts.

const PROFILE_OUT = z.object({
  id: z.number().int(),
  type: z.enum(["business", "personal"]),
  name: z.string(),
});

const BALANCE_OUT = z.object({
  id: z.number().int(),
  profile: z.string(),
  currency: z.string(),
  amount: z.number(),
  formatted: z.string().describe("Currency-formatted amount, e.g. £1000.50."),
  reserved: z.number(),
  cash: z.number(),
  type: z.string(),
});

const TRANSFER_OUT = z.object({
  id: z.number().int(),
  status: z.string(),
  date: z.string().describe("ISO 8601 timestamp from Wise."),
  sourceCurrency: z.string(),
  sourceValue: z.number(),
  sourceFormatted: z.string(),
  targetCurrency: z.string(),
  targetValue: z.number(),
  targetFormatted: z.string(),
  rate: z.number(),
  reference: z.string(),
});

function jsonContent(data: unknown) {
  return [{ type: "text" as const, text: JSON.stringify(data, null, 2) }];
}

function structured<T>(data: T) {
  return {
    content: jsonContent(data),
    structuredContent: data as Record<string, unknown>,
  };
}

/**
 * Translate any thrown value to an MCP tool error envelope. Delegates to
 * `@howells/cli/mcp` so the shape stays in sync with the CLI's stdout
 * error JSON (and revolutcli's MCP errors).
 */
const errorResult = toMcpToolError;

/** Build an MCP server with all wisecli tools registered. Exported for tests. */
export function buildServer(): McpServer {
  const server = new McpServer(
    { name: "wisecli", version: "0.1.0" },
    {
      instructions:
        "Read-only access to Wise (TransferWise) balances, transfers, and profiles. " +
        "Tokens come from WISE_<NAME>_TOKEN env vars on the host process. " +
        "All tools call api.wise.com and never write. For payments, recipients, or transfers, the user must use the Wise UI directly.",
    },
  );

  server.registerTool(
    "wise_list_accounts",
    {
      title: "List configured Wise accounts",
      description:
        "Returns the list of token account names configured via WISE_<NAME>_TOKEN env vars. " +
        "Use when: deciding which token to call other tools with, or showing the user what's available. " +
        "Do not use for: listing Wise profiles within a token (use wise_list_profiles for that). " +
        "Returns an empty array if no tokens are configured.",
      inputSchema: {},
      outputSchema: {
        accounts: z
          .array(z.string())
          .describe("Token account names derived from WISE_<NAME>_TOKEN."),
      },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      try {
        return structured({ accounts: listConfiguredAccounts() });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "wise_list_profiles",
    {
      title: "List Wise profiles under a token",
      description:
        "Returns the BUSINESS and/or PERSONAL profiles under a single token. " +
        "Use when: the user asks 'what profiles do I have', or before calling wise_get_balance/wise_list_transfers when you need to know the profile_type. " +
        "Do not use for: listing token accounts (use wise_list_accounts). " +
        "Each profile has an id, type ('business'|'personal'), and a display name.",
      inputSchema: { account: ACCOUNT.optional() },
      outputSchema: {
        account: z.string(),
        profiles: z.array(PROFILE_OUT),
      },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ account }) => {
      try {
        const { name, token } = resolveAccount(account);
        const profiles = await listProfiles(token);
        return structured({ account: name, profiles });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "wise_get_balance",
    {
      title: "Get Wise balances",
      description:
        "Returns per-currency balances. By default returns balances for every profile under the named token. " +
        "Use when: the user asks about money in their Wise account, current balances, or available funds. " +
        "Do not use for: transfer history (use wise_list_transfers). " +
        "Set aggregate_all to combine balances across every configured token. " +
        "Set profile_type when a token has both BUSINESS and PERSONAL profiles and you want only one.",
      inputSchema: {
        account: ACCOUNT.optional(),
        profile_type: PROFILE_TYPE.optional(),
        aggregate_all: z
          .boolean()
          .optional()
          .describe(
            "If true, aggregate balances across every configured token. Overrides 'account'.",
          ),
      },
      outputSchema: {
        account: z.string(),
        balances: z.array(
          BALANCE_OUT.extend({ account: z.string().optional() }),
        ),
      },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ account, profile_type, aggregate_all }) => {
      try {
        if (aggregate_all) {
          const tokens = allAccounts();
          const rows: Array<Record<string, unknown>> = [];
          for (const t of tokens) {
            const part = await balanceForAllProfiles(t.token);
            for (const r of part) rows.push({ ...r, account: t.name });
          }
          return structured({ account: "all", balances: rows });
        }
        const { name, token } = resolveAccount(account);
        const data = profile_type
          ? await balanceForProfile(token, profile_type)
          : await balanceForAllProfiles(token);
        return structured({ account: name, balances: data });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "wise_list_transfers",
    {
      title: "List Wise transfers for a profile",
      description:
        "Returns outgoing/incoming transfers for one profile. " +
        "Use when: the user asks about transfer history, recent transactions, sent payments, or wants to filter by date or status. " +
        "Do not use for: current balances (use wise_get_balance). " +
        "Filter with from/to (ISO 8601 dates), status (Wise status string), and limit (default 100). " +
        "When a token has multiple profiles, profile_type is required.",
      inputSchema: {
        account: ACCOUNT.optional(),
        profile_type: PROFILE_TYPE.optional(),
        from: z
          .string()
          .optional()
          .describe(
            "ISO 8601 date — only transfers created on or after. Example: '2026-04-01' or '2026-04-01T00:00:00Z'.",
          ),
        to: z
          .string()
          .optional()
          .describe("ISO 8601 date — only transfers created on or before."),
        limit: z
          .number()
          .int()
          .positive()
          .max(500)
          .optional()
          .describe("Cap on results returned. Default 100, max 500."),
        offset: z
          .number()
          .int()
          .nonnegative()
          .optional()
          .describe(
            "Skip this many results before returning. Use with the next_offset value from a prior page response to paginate.",
          ),
        status: z
          .string()
          .optional()
          .describe(
            `Wise transfer status. Common values: ${KNOWN_TRANSFER_STATUSES.join(", ")}.`,
          ),
      },
      outputSchema: {
        account: z.string(),
        transfers: z.array(TRANSFER_OUT),
        has_more: z
          .boolean()
          .describe("True if more results probably exist past this page."),
        next_offset: z
          .number()
          .int()
          .nonnegative()
          .optional()
          .describe(
            "Pass this back as 'offset' on the next call to fetch the next page. Undefined when has_more is false.",
          ),
        offset: z.number().int().nonnegative(),
        limit: z.number().int().positive(),
        total_returned: z.number().int().nonnegative(),
      },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ account, profile_type, from, to, limit, offset, status }) => {
      try {
        const { name, token } = resolveAccount(account);
        const options: TransfersOptions = {
          from,
          to,
          limit,
          offset,
          status,
        };
        const page = await transfers(token, profile_type, options);
        return structured({
          account: name,
          transfers: page.transfers,
          has_more: page.has_more,
          next_offset: page.next_offset,
          offset: page.offset,
          limit: page.limit,
          total_returned: page.transfers.length,
        });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "wise_get_schema",
    {
      title: "Get wisecli capability schema",
      description:
        "Returns a machine-readable manifest of every wisecli tool, parameter, and field. " +
        "Use when: orienting at the start of a session, or when you need to know what fields a balance or transfer row contains. " +
        "Mirrors the output of `wisecli schema` on the CLI.",
      inputSchema: {},
      outputSchema: {
        server: z.string(),
        version: z.string(),
        description: z.string(),
        accounts: z.array(z.string()),
        auth: z.string(),
        tools: z.array(z.string()),
        fields: z.object({
          balance: z.array(z.string()),
          transfer: z.array(z.string()),
          profile: z.array(z.string()),
        }),
        known_transfer_statuses: z.array(z.string()),
        read_only: z.boolean(),
      },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      const accounts = (() => {
        try {
          return listConfiguredAccounts();
        } catch {
          return [];
        }
      })();
      return structured({
        server: "wisecli",
        version: "0.1.0",
        description: "Read-only Wise (TransferWise) MCP server",
        accounts,
        auth: "Tokens come from WISE_<NAME>_TOKEN env vars on the host process.",
        tools: [
          "wise_list_accounts",
          "wise_list_profiles",
          "wise_get_balance",
          "wise_list_transfers",
          "wise_get_schema",
        ],
        fields: {
          balance: [
            "id",
            "profile",
            "currency",
            "amount",
            "formatted",
            "reserved",
            "cash",
            "type",
          ],
          transfer: [
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
          profile: ["id", "type", "name"],
        },
        known_transfer_statuses: [...KNOWN_TRANSFER_STATUSES],
        read_only: true,
      });
    },
  );

  return server;
}

/** Connect the server to a transport. Exported for tests; main() uses stdio. */
export async function connect(transport: Transport): Promise<McpServer> {
  const server = buildServer();
  await server.connect(transport);
  return server;
}

async function main(): Promise<void> {
  const { StdioServerTransport } = await import(
    "@modelcontextprotocol/sdk/server/stdio.js"
  );
  await connect(new StdioServerTransport());
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((err) => {
    process.stderr.write(
      `wisecli-mcp: failed to start — ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exit(1);
  });
}
