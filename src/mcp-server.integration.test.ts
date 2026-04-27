/**
 * Subprocess integration test — spawns the published `dist/mcp-server.js`
 * binary via StdioClientTransport and exercises the full MCP protocol.
 *
 * If dist/ is missing, the test skips with a clear message rather than
 * failing — local devs running `pnpm test` before `pnpm build` shouldn't
 * see a red bar. CI runs build first.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { describe, expect, it } from "vitest";

const BIN_PATH = resolve(process.cwd(), "dist/mcp-server.js");
const HAS_BUILD = existsSync(BIN_PATH);

describe.skipIf(!HAS_BUILD)("wisecli-mcp subprocess (built bin)", () => {
  async function spawnAndConnect(env: Record<string, string> = {}) {
    const transport = new StdioClientTransport({
      command: process.execPath, // node
      args: [BIN_PATH],
      env: { PATH: process.env.PATH ?? "", ...env },
      stderr: "pipe",
    });
    const client = new Client({ name: "integration-test", version: "0.0.0" });
    await client.connect(transport);
    return { client, transport };
  }

  it("connects, lists tools, and exposes outputSchema", async () => {
    const { client } = await spawnAndConnect();
    const res = await client.listTools();
    expect(res.tools.length).toBe(5);
    const transfersTool = res.tools.find(
      (t) => t.name === "wise_list_transfers",
    );
    expect(transfersTool).toBeDefined();
    expect(transfersTool?.outputSchema).toBeDefined();
    // outputSchema should declare the pagination fields.
    const props = (
      transfersTool?.outputSchema as { properties?: Record<string, unknown> }
    )?.properties;
    expect(props).toHaveProperty("has_more");
    expect(props).toHaveProperty("next_offset");
    await client.close();
  }, 10_000);

  it("returns the schema manifest with read_only=true", async () => {
    const { client } = await spawnAndConnect();
    const res = await client.callTool({
      name: "wise_get_schema",
      arguments: {},
    });
    expect(res.isError).toBeFalsy();
    const arr = res.content as Array<{ type: string; text: string }>;
    const data = JSON.parse(arr[0]?.text ?? "{}");
    expect(data.server).toBe("wisecli");
    expect(data.read_only).toBe(true);
    expect(data.tools).toContain("wise_list_transfers");
    await client.close();
  }, 10_000);

  it("surfaces AUTH_MISSING when no token is set", async () => {
    // Pass an explicit env without WISE_API_TOKEN — getDefaultEnvironment
    // would inherit the test process env, so we override here.
    const { client } = await spawnAndConnect();
    const res = await client.callTool({
      name: "wise_get_balance",
      arguments: {},
    });
    expect(res.isError).toBe(true);
    const arr = res.content as Array<{ type: string; text: string }>;
    const data = JSON.parse(arr[0]?.text ?? "{}");
    expect(data.code).toBe("AUTH_MISSING");
    expect(data.is_retriable).toBe(false);
    expect(data.error).toMatch(/No Wise tokens/i);
    await client.close();
  }, 10_000);
});
