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
}

/** List transfers for a single profile. */
export async function transfers(
  token: string,
  profileType: string | undefined,
  options: TransfersOptions = {},
): Promise<TransferRow[]> {
  const profiles = await listProfiles(token);
  const profile = pickProfile(profiles, profileType);
  const raw = await api<
    { transferList?: RawWiseTransfer[] } | RawWiseTransfer[]
  >({
    token,
    path: "/v1/transfers",
    query: {
      profile: profile.id,
      createdDateStart: options.from,
      createdDateEnd: options.to,
      limit: options.limit ?? 100,
      status: options.status,
    },
  });
  const list = Array.isArray(raw) ? raw : (raw.transferList ?? []);
  return list.map(toTransferRow);
}
