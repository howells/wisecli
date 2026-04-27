# @howells/wisecli

CLI for [Wise](https://wise.com/) — balances, transfers, profiles.

Designed for AI agents and automation. All output is structured JSON. Multi-token. Read-only by design.

## Install

```bash
npm install -g @howells/wisecli
```

## Setup

Get an API token at [wise.com/settings/api-tokens](https://wise.com/settings/api-tokens) (read-only is sufficient) and set it:

```bash
export WISE_API_TOKEN="your-token"
```

For multiple Wise accounts, use the `WISE_<NAME>_TOKEN` pattern:

```bash
export WISE_BUSINESS_TOKEN="..."
export WISE_PERSONAL_TOKEN="..."
```

Account names are derived from the env var: `WISE_BUSINESS_TOKEN` → `--account business`.

## Usage

```bash
wisecli accounts                                      # List configured tokens
wisecli profiles --account business                   # List profiles in a token

wisecli balance                                       # All balances under default/first token
wisecli balance --account all                         # Aggregate across every token
wisecli balance --account business                    # Specific token, all profiles in it
wisecli balance --account business --profile-type business  # One profile

wisecli transfers --account business --profile-type business
wisecli transfers --account business --profile-type business \
  --from 2026-04-01 --to 2026-04-30 --limit 50

wisecli schema                                        # Schema introspection (for agents)
```

Always pair `transfers` with `--fields` to keep responses small:

```bash
wisecli transfers --account business --profile-type business \
  --fields sourceFormatted,targetFormatted,date,status --limit 20
```

## Output Format

```json
{
  "ok": true,
  "data": [ ... ],
  "command": "balance",
  "account": "business"
}
```

Errors:

```json
{
  "ok": false,
  "error": "No Wise tokens found. Set WISE_API_TOKEN or WISE_<NAME>_TOKEN env vars.",
  "command": "balance"
}
```

## Tokens, Profiles, Balances

Wise has two layers above your money:

- A **token** authenticates you — one per `WISE_<NAME>_TOKEN` env var.
- A **profile** is a sub-entity within a token — typically one `BUSINESS` and/or one `PERSONAL`.
- A **balance** is the money in a single currency under a profile. One profile commonly has multiple currency balances (GBP, USD, EUR, …).

`balance` returns one row per (profile × currency). If a token has multiple profiles, `--profile-type` lets you scope.

## Read-Only

This CLI deliberately exposes only read endpoints. Transfers, recipient management, and conversions are out of scope — use the Wise UI or app for those.

## License

MIT
