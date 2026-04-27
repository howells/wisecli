import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { connect } from "./mcp-server.ts";

const ENV_KEYS = [
  "WISE_API_TOKEN",
  "WISE_TOKEN",
  "WISE_BUSINESS_TOKEN",
  "WISE_PERSONAL_TOKEN",
];

function snapshotEnv(): Record<string, string | undefined> {
  return Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
}

function restoreEnv(snap: Record<string, string | undefined>) {
  for (const k of ENV_KEYS) {
    if (snap[k] === undefined) delete process.env[k];
    else process.env[k] = snap[k];
  }
}

async function makeClient() {
  const [serverTransport, clientTransport] =
    InMemoryTransport.createLinkedPair();
  const server = await connect(serverTransport);
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await client.connect(clientTransport);
  return { server, client };
}

function parseText(content: unknown): unknown {
  const arr = content as Array<{ type: string; text: string }>;
  return JSON.parse(arr[0]?.text ?? "{}");
}

describe("wisecli MCP server", () => {
  let envSnap: Record<string, string | undefined>;
  let originalFetch: typeof fetch;

  beforeEach(() => {
    envSnap = snapshotEnv();
    originalFetch = globalThis.fetch;
    for (const k of ENV_KEYS) delete process.env[k];
  });

  afterEach(() => {
    restoreEnv(envSnap);
    globalThis.fetch = originalFetch;
  });

  it("lists all five tools with read-only annotations", async () => {
    const { client } = await makeClient();
    const res = await client.listTools();
    const names = res.tools.map((t) => t.name).sort();
    expect(names).toEqual([
      "wise_get_balance",
      "wise_get_schema",
      "wise_list_accounts",
      "wise_list_profiles",
      "wise_list_transfers",
    ]);
    for (const tool of res.tools) {
      expect(tool.annotations?.readOnlyHint).toBe(true);
      expect(tool.annotations?.idempotentHint).toBe(true);
    }
    await client.close();
  });

  it("wise_list_accounts returns configured names", async () => {
    process.env.WISE_BUSINESS_TOKEN = "biz";
    process.env.WISE_PERSONAL_TOKEN = "pers";
    const { client } = await makeClient();
    const res = await client.callTool({
      name: "wise_list_accounts",
      arguments: {},
    });
    expect(res.isError).toBeFalsy();
    const data = parseText(res.content) as { accounts: string[] };
    expect(data.accounts.sort()).toEqual(["business", "personal"]);
    await client.close();
  });

  it("wise_list_accounts returns empty when no tokens are configured", async () => {
    const { client } = await makeClient();
    const res = await client.callTool({
      name: "wise_list_accounts",
      arguments: {},
    });
    expect(res.isError).toBeFalsy();
    const data = parseText(res.content) as { accounts: string[] };
    expect(data.accounts).toEqual([]);
    await client.close();
  });

  it("wise_get_balance surfaces structured error for missing token", async () => {
    const { client } = await makeClient();
    const res = await client.callTool({
      name: "wise_get_balance",
      arguments: {},
    });
    expect(res.isError).toBe(true);
    const data = parseText(res.content) as {
      code: string;
      is_retriable: boolean;
    };
    expect(data.code).toBe("ERR_NO_TOKEN");
    expect(data.is_retriable).toBe(false);
    await client.close();
  });

  it("wise_get_balance returns structured rows when token is set", async () => {
    process.env.WISE_API_TOKEN = "tok";
    globalThis.fetch = (async (url: string) => {
      if (url.endsWith("/v2/profiles")) {
        return new Response(
          JSON.stringify([
            { id: 1, type: "BUSINESS", details: { name: "Acme" } },
          ]),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify([
          {
            id: 11,
            currency: "GBP",
            amount: { value: 1000.5, currency: "GBP" },
            type: "STANDARD",
          },
        ]),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as unknown as typeof fetch;

    const { client } = await makeClient();
    const res = await client.callTool({
      name: "wise_get_balance",
      arguments: {},
    });
    expect(res.isError).toBeFalsy();
    const data = parseText(res.content) as {
      account: string;
      balances: Array<{ currency: string; formatted: string }>;
    };
    expect(data.account).toBe("default");
    expect(data.balances[0]).toMatchObject({
      currency: "GBP",
      formatted: "£1000.50",
    });
    await client.close();
  });

  it("wise_list_transfers maps Wise 401 to ERR_AUTH with hint", async () => {
    process.env.WISE_API_TOKEN = "bad-token";
    globalThis.fetch = (async (url: string) => {
      if (url.endsWith("/v2/profiles")) {
        return new Response("Unauthorized", { status: 401 });
      }
      return new Response("[]", {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const { client } = await makeClient();
    const res = await client.callTool({
      name: "wise_list_transfers",
      arguments: { profile_type: "business" },
    });
    expect(res.isError).toBe(true);
    const data = parseText(res.content) as {
      code: string;
      is_retriable: boolean;
      type: string;
      title: string;
      status: number;
    };
    expect(data.code).toBe("ERR_AUTH");
    expect(data.is_retriable).toBe(false);
    expect(data.type).toBe("https://wisecli.dev/errors/auth");
    expect(data.title).toBe("Wise authentication failed");
    expect(data.status).toBe(401);
    await client.close();
  });

  it("wise_list_transfers maps Wise 429 to ERR_RATE_LIMIT with retry_after", async () => {
    process.env.WISE_API_TOKEN = "tok";
    globalThis.fetch = (async (url: string) => {
      if (url.endsWith("/v2/profiles")) {
        return new Response(
          JSON.stringify([{ id: 1, type: "BUSINESS", details: { name: "X" } }]),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("rate limit", {
        status: 429,
        headers: { "retry-after": "30" },
      });
    }) as unknown as typeof fetch;

    const { client } = await makeClient();
    const res = await client.callTool({
      name: "wise_list_transfers",
      arguments: {},
    });
    expect(res.isError).toBe(true);
    const data = parseText(res.content) as {
      code: string;
      is_retriable: boolean;
      retry_after_seconds?: number;
    };
    expect(data.code).toBe("ERR_RATE_LIMIT");
    expect(data.is_retriable).toBe(true);
    expect(data.retry_after_seconds).toBe(30);
    await client.close();
  });

  it("wise_get_schema returns the capability manifest", async () => {
    const { client } = await makeClient();
    const res = await client.callTool({
      name: "wise_get_schema",
      arguments: {},
    });
    expect(res.isError).toBeFalsy();
    const data = parseText(res.content) as {
      server: string;
      tools: string[];
      read_only: boolean;
    };
    expect(data.server).toBe("wisecli");
    expect(data.read_only).toBe(true);
    expect(data.tools).toContain("wise_list_transfers");
    await client.close();
  });

  it("rejects invalid profile_type via input schema", async () => {
    process.env.WISE_API_TOKEN = "tok";
    const { client } = await makeClient();
    const res = await client
      .callTool({
        name: "wise_get_balance",
        arguments: { profile_type: "joint" },
      })
      .catch((err) => ({ isError: true, content: String(err) }));
    // Either Zod-validation rejection at the protocol level or our own ERR — both acceptable.
    expect(res.isError).toBeTruthy();
    await client.close();
  });
});
