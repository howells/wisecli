import { api, formatAmount } from "./api.ts";
import { listProfiles, pickProfile, type WiseProfile } from "./profiles.ts";

interface RawWiseBalance {
  id: number;
  currency: string;
  amount?: { value: number; currency: string };
  reservedAmount?: { value: number; currency: string };
  cashAmount?: { value: number; currency: string };
  creationTime?: string;
  modificationTime?: string;
  type?: string;
}

export interface BalanceRow {
  id: number;
  profile: string;
  currency: string;
  amount: number;
  formatted: string;
  reserved: number;
  cash: number;
  type: string;
}

function toBalanceRow(b: RawWiseBalance, profile: WiseProfile): BalanceRow {
  const amount = b.amount?.value ?? 0;
  return {
    id: b.id,
    profile: profile.type,
    currency: b.currency,
    amount,
    formatted: formatAmount(amount, b.currency),
    reserved: b.reservedAmount?.value ?? 0,
    cash: b.cashAmount?.value ?? 0,
    type: b.type ?? "STANDARD",
  };
}

async function fetchBalances(
  token: string,
  profile: WiseProfile,
): Promise<RawWiseBalance[]> {
  return api<RawWiseBalance[]>({
    token,
    path: `/v4/profiles/${profile.id}/balances`,
    query: { types: "STANDARD" },
  });
}

/** Balances for one profile. */
export async function balanceForProfile(
  token: string,
  profileType: string | undefined,
): Promise<BalanceRow[]> {
  const profiles = await listProfiles(token);
  const profile = pickProfile(profiles, profileType);
  const balances = await fetchBalances(token, profile);
  return balances.map((b) => toBalanceRow(b, profile));
}

/** Balances for every profile under the token, flattened. */
export async function balanceForAllProfiles(
  token: string,
): Promise<BalanceRow[]> {
  const profiles = await listProfiles(token);
  const rows: BalanceRow[] = [];
  for (const profile of profiles) {
    const balances = await fetchBalances(token, profile);
    for (const b of balances) {
      rows.push(toBalanceRow(b, profile));
    }
  }
  return rows;
}

interface RawWiseTransfer {
  id: number;
  sourceCurrency: string;
  targetCurrency: string;
  sourceValue: number;
  targetValue: number;
  status: string;
  reference?: string;
  rate?: number;
  created: string;
  business?: number;
  details?: { reference?: string };
  targetAccount?: number;
  sourceAccount?: number;
}

export interface TransferRow {
  id: number;
  status: string;
  date: string;
  sourceCurrency: string;
  sourceValue: number;
  sourceFormatted: string;
  targetCurrency: string;
  targetValue: number;
  targetFormatted: string;
  rate: number;
  reference: string;
}

function toTransferRow(t: RawWiseTransfer): TransferRow {
  return {
    id: t.id,
    status: t.status,
    date: t.created,
    sourceCurrency: t.sourceCurrency,
    sourceValue: t.sourceValue,
    sourceFormatted: formatAmount(t.sourceValue, t.sourceCurrency),
    targetCurrency: t.targetCurrency,
    targetValue: t.targetValue,
    targetFormatted: formatAmount(t.targetValue, t.targetCurrency),
    rate: t.rate ?? 0,
    reference: t.details?.reference ?? t.reference ?? "",
  };
}

export interface TransfersOptions {
  /** ISO 8601 — only transfers created on or after this. */
  from?: string;
  /** ISO 8601 — only transfers created on or before this. */
  to?: string;
  /** Cap the number of results returned. */
  limit?: number;
  /** Filter by Wise transfer status (e.g. `outgoing_payment_sent`). */
  status?: string;
  /** Skip this many results before returning (for pagination). */
  offset?: number;
}

export interface TransfersPage {
  transfers: TransferRow[];
  /** True if the API returned exactly `limit` rows — more probably exist. */
  has_more: boolean;
  /** Suggested next offset for the next page. Undefined when has_more is false. */
  next_offset?: number;
  /** The offset that was actually requested. */
  offset: number;
  /** The limit that was actually applied. */
  limit: number;
}

const DEFAULT_LIMIT = 100;

/** List transfers for a single profile, with pagination metadata. */
export async function transfers(
  token: string,
  profileType: string | undefined,
  options: TransfersOptions = {},
): Promise<TransfersPage> {
  const profiles = await listProfiles(token);
  const profile = pickProfile(profiles, profileType);
  const limit = options.limit ?? DEFAULT_LIMIT;
  const offset = options.offset ?? 0;
  const raw = await api<
    { transferList?: RawWiseTransfer[] } | RawWiseTransfer[]
  >({
    token,
    path: "/v1/transfers",
    query: {
      profile: profile.id,
      createdDateStart: options.from,
      createdDateEnd: options.to,
      limit,
      offset: offset || undefined,
      status: options.status,
    },
  });
  const list = Array.isArray(raw) ? raw : (raw.transferList ?? []);
  const rows = list.map(toTransferRow);
  const has_more = rows.length === limit;
  return {
    transfers: rows,
    has_more,
    next_offset: has_more ? offset + limit : undefined,
    offset,
    limit,
  };
}
