# Surface Scorecard History — @howells/wisecli

## 2026-04-27 (pass 2) — Second transformation pass

```
╔══════════════════════════════════════════════════════════════════╗
║              SURFACE DELTA SCORECARD (pass 2)                  ║
║              @howells/wisecli                                  ║
║              2026-04-27                                        ║
╠══════════════════════════════════════════════════════════════════╣

  Dimension              Pass 1  Pass 2  Delta
  ─────────────────────  ──────  ──────  ─────
  CLI Design             3/3     3/3     +0    (already at ceiling)
  MCP Server             2/3     3/3     +1 ✦  (outputSchema, structuredContent, subprocess test)
  Discovery & AEO        3/3     3/3     +0    (at ceiling)
  Authentication         1/3     1/3     +0    (Wise API constraint)
  Error Handling         2/3     3/3     +1 ✦  (RFC 9457 type URIs + title + status)
  Tool Design            2/3     3/3     +1 ✦  (Zod outputSchemas, pagination envelope)
  Context Files          3/3     3/3     +0    (at ceiling)
  Testing                1/3     2/3     +1 ↑  (subprocess StdioClientTransport integration tests)
  Data Retrievability    0/3     0/3     +0    (live API wrapper)

  Raw:        17/27 →  20/27   (+3)
  Scaled:     19/30 →  22/30   (+3)
  Rating:     Agent-ready (high end of band)

  ░░░░░░░░░░░░░░░░░░░░░░░░░██████████████████████░░░░░░░░░░░░░     
  Human-only         Agent-tolerant   Agent-ready ▲ Agent-first

╚══════════════════════════════════════════════════════════════════╝
```

### What changed (pass 2)

**MCP Server (2→3):** Every tool now declares an `outputSchema` (Zod), so listing tools advertises the full response shape. Tool callbacks return `structuredContent` alongside the legacy `content[].text` so MCP-2025-spec hosts get typed responses. New [src/mcp-server.integration.test.ts](../../src/mcp-server.integration.test.ts) spawns the actual `dist/mcp-server.js` bin via `StdioClientTransport` and verifies the protocol handshake, schema exposure, and structured error mapping across the process boundary.

**Error Handling (2→3):** Errors now carry RFC 9457 fields:
- `type` — stable URI (`https://wisecli.dev/errors/<slug>`) per error class
- `title` — short human-readable label, identical across instances of a code
- `status` — HTTP status (set for upstream API errors)
- `error` — the per-instance detail (RFC 9457 'detail')
- `trace_id` — RFC 9457 'instance'-equivalent
The MCP `errorResult()` and CLI `fail()` share one type-URI registry via `typeUriFor()` / `titleFor()` exports — single source of truth.

**Tool Design (2→3):** Pagination envelope on `wise_list_transfers` (and the CLI's `transfers` command): `--offset` flag, response carries `has_more`, `next_offset`, `offset`, `limit`. Agents can paginate without guessing — pass `next_offset` back as `offset` on the next call. Combined with `outputSchema`, `--fields` projection, and "Use when / Do not use for" descriptions, the tool surface is fully self-documenting.

**Testing (1→2):** New subprocess integration test exercises the published `wisecli-mcp` bin end-to-end. CI workflow re-ordered to `build → test` so the integration test runs in CI. Test gates itself with `describe.skipIf(!HAS_BUILD)` so local devs running `pnpm test` before `pnpm build` don't see a red bar — the unit tests and the subprocess test are both first-class.

### Why not 30/30

- **Authentication (1/3):** Wise's API only issues long-lived personal access tokens — no OAuth 2.1 M2M, no scoping. Pure upstream constraint. Score is structurally capped.
- **Data Retrievability (0/3):** This is a live API wrapper, not a retrieval system. The rubric scores embedding/vector/RAG infrastructure that doesn't apply unless wisecli starts indexing transfer history locally. Out of scope for read-only.

### Files changed (pass 2)

```
M  src/commands.ts           # TransfersPage with has_more/next_offset/offset/limit
M  src/commands.test.ts      # +1 test covering pagination signal
M  src/index.ts              # --offset flag, pagination metadata in envelope, schema cmd updated
M  src/mcp-server.ts         # outputSchema on all 5 tools, structured(), shared type URIs
M  src/mcp-server.test.ts    # +assertion: type URI, title, status on ERR_AUTH
M  src/errors.ts             # RFC 9457 type/title/status, typeUriFor/titleFor exports
M  .github/workflows/ci.yml  # build before test (so subprocess test runs)
A  src/mcp-server.integration.test.ts  # 3 subprocess tests (StdioClientTransport)
```

### Verification

- `pnpm typecheck` ✓
- `pnpm lint` ✓
- `pnpm build` ✓
- `pnpm test` ✓ — 43 tests across 7 files (was 39 across 6)

---

## 2026-04-27 — Post-transformation re-score

```
╔══════════════════════════════════════════════════════════════════╗
║              SURFACE DELTA SCORECARD                           ║
║              @howells/wisecli                                  ║
║              2026-04-27 (after rock-and-roll pass)             ║
╠══════════════════════════════════════════════════════════════════╣

  Dimension              Before  After  Delta
  ─────────────────────  ──────  ─────  ─────
  CLI Design             3/3     3/3    +0    (already at ceiling)
  MCP Server             0/3     2/3    +2 ✦  (server, 5 tools, tests)
  Discovery & AEO        2/3     3/3    +1 ↑  (llms.txt + llms-full.txt)
  Authentication         1/3     1/3    +0    (Wise API constraint)
  Error Handling         1/3     2/3    +1 ↑  (ApiError, codes, exit codes, retry-after)
  Tool Design            1/3     2/3    +1 ↑  (Zod schemas, "Use when/not", status enum, MCP annotations)
  Context Files          2/3     3/3    +1 ↑  (CLAUDE.md, permissions, dev cmds, source layout)
  Testing                0/3     1/3    +1 ↑  (CI workflow + 9 MCP InMemoryTransport tests)
  Data Retrievability    0/3     0/3    +0    (live API wrapper — N/A-ish)

  Raw:        10/27 →  17/27   (+7)
  Scaled:     11/30 →  19/30   (+8)
  Rating:     Agent-tolerant → Agent-ready ✦

  ░░░░░░░░░░░░░░░░░░░██████████████████░░░░░░░░░░░░░░░░░░░░░░░     
  Human-only         Agent-tolerant   ▲Agent-ready    Agent-first

╚══════════════════════════════════════════════════════════════════╝
```

### What changed

**MCP Server (0 → 2):** New [src/mcp-server.ts](../../src/mcp-server.ts) exposes five tools over stdio with `readOnlyHint: true`, `idempotentHint: true` annotations, Zod input schemas, and structured error responses. Hosted via `wisecli-mcp` bin entry. Falls short of 3 because no formal protocol-level capability negotiation, no resource exposure, and no SDK-level `outputSchema` (we return JSON-serialized text content for now).

**Discovery & AEO (2 → 3):** Added [llms.txt](../../llms.txt) and [llms-full.txt](../../llms-full.txt) at repo root, both shipped in `package.json` `files`. CLAUDE.md added. The `schema` command now references the MCP bin and exposes the error envelope spec.

**Error Handling (1 → 2):** New [src/errors.ts](../../src/errors.ts) with `ApiError` (carries `status`, `is_retriable`, `retry_after_seconds`, `trace_id`) and `WiseCliError` for local failures. `fail()` emits a structured envelope with `code`, `is_retriable`, `hint`, `retry_after_seconds`. Exit codes follow `sysexits.h` (64/65/66/69/77). Caps at 2 not 3 because we don't yet emit RFC 9457 `type` URI fields.

**Tool Design (1 → 2):** MCP server brings Zod-validated inputs with `.describe()` per field, "Use when / Do not use for" patterns in descriptions, `status` enum surfaced, MCP annotations on every tool. The CLI's `schema` command also got the same treatment — `status` enum, richer per-param descriptions, error envelope spec.

**Context Files (2 → 3):** CLAUDE.md added (multi-tool gate). AGENTS.md got a Permissions section (Always/Ask-first/Never), Source Layout, Development commands (`pnpm test/typecheck/lint/build`), and an Error Envelope section.

**Testing (0 → 1):** [.github/workflows/ci.yml](../../.github/workflows/ci.yml) runs typecheck + lint + test + build on every push/PR. New [src/mcp-server.test.ts](../../src/mcp-server.test.ts) uses `InMemoryTransport.createLinkedPair()` to verify tool listing, success paths, structured error mapping (401 → ERR_AUTH, 429 → ERR_RATE_LIMIT with `retry_after_seconds`), and schema integrity. Caps at 1 because still no eval framework / outcome evals — that's the path to 2+.

### What didn't move

- **CLI Design (3 → 3):** Already at ceiling.
- **Authentication (1 → 1):** Wise API doesn't expose OAuth 2.1 M2M; the personal-token model is upstream-fixed. Improvements made (deterministic account ordering, ERR_AUTH hint pointing to wise.com/settings/api-tokens, read-only token guidance in AGENTS.md) are quality-of-life, not score-moving for this rubric.
- **Data Retrievability (0 → 0):** This is a live API wrapper, not a retrieval system. The rubric's criteria (embeddings, vector DBs, hybrid search, reranking) don't apply unless wisecli starts indexing transaction history locally. Not in scope for read-only.

### Files changed

```
M  AGENTS.md                       # Permissions, Source Layout, Dev, Error Envelope
M  package.json                    # wisecli-mcp bin, llms files, gen:llms script, deps
M  pnpm-lock.yaml                  # @modelcontextprotocol/sdk, zod
M  src/accounts.ts                 # WiseCliError; deterministic sort
M  src/api.ts                      # throw ApiError with status + retry hints
M  src/index.ts                    # failFromUnknown; richer schema cmd
M  src/profiles.ts                 # WiseCliError for not-found / multi-profile
M  src/validate.ts                 # fail() with ERR_VALIDATION; local hardenId
A  CLAUDE.md
A  llms.txt
A  llms-full.txt
A  src/errors.ts                   # ApiError, WiseCliError, fail, failFromUnknown
A  src/mcp-server.ts                # 5 tools, Zod schemas, MCP annotations
A  src/mcp-server.test.ts          # 9 InMemoryTransport tests
A  .github/workflows/ci.yml        # typecheck + lint + test + build on push/PR
A  docs/surface/scorecard.md
```

### Verification

- `pnpm typecheck` ✓
- `pnpm lint` ✓
- `pnpm test` ✓ (39 tests, 6 files)
- `pnpm build` ✓ (dist/ generated, mcp-server.js with shebang preserved)
