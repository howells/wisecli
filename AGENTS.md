# @howells/wisecli — Agent Guide

CLI for Wise (TransferWise). Read-only. Multi-token via env vars; profiles (business/personal) discovered from API.

## Quick Start

```bash
# Single token
export WISE_API_TOKEN="..."

# Or multi-token
export WISE_BUSINESS_TOKEN="..."
export WISE_PERSONAL_TOKEN="..."

# Balances across every profile under the default token
wisecli balance

# All tokens, all profiles
wisecli balance --account all

# Specific token + profile type
wisecli balance --account business --profile-type business

# Transfers (always use --fields)
wisecli transfers --account business --profile-type business \
  --fields sourceFormatted,targetFormatted,date,status --limit 20

# Schema introspection
wisecli schema
```

## Invariants

- **Always use `--fields`** on transfers — payloads are deeply nested otherwise.
- **`transfers` requires `--account`** when more than one token is configured. If a token has multiple profiles, `--profile-type` is required too.
- **`--account all`** with `balance` aggregates across every configured token.
- **All output is JSON** with `{ok, data, error, command, account}` envelope.
- **Read-only by design** — no transfer creation, no recipient management. Use the Wise UI or app for write operations.
- **Tokens come from env vars** — no config files, no token cache.

## Token Discovery

Tokens are derived from `WISE_<NAME>_TOKEN`:
- `WISE_API_TOKEN` → `--account default`
- `WISE_BUSINESS_TOKEN` → `--account business`
- `WISE_JOINT_GBP_TOKEN` → `--account joint-gbp`

## Profiles vs. Tokens

A single token can contain both a `BUSINESS` and `PERSONAL` profile. wisecli treats:
- **Token** = top-level credential (one per `WISE_<NAME>_TOKEN` env var)
- **Profile** = sub-entity within a token (`business` or `personal`)
- **Currency balance** = the actual money — surfaced as one row per (profile × currency)

If a token has both profiles, `--profile-type business|personal` selects one. With one profile, the choice is automatic.

## Common Workflows

### Daily balance check
```bash
wisecli balance --account all --fields profile,currency,formatted
```

### Outbound transfers this month
```bash
wisecli transfers --account business --profile-type business \
  --from 2026-04-01 --status outgoing_payment_sent \
  --fields targetFormatted,reference,date --limit 50
```

### List configured tokens
```bash
wisecli accounts
```

### List profiles under a token
```bash
wisecli profiles --account business
```
