import type { Plan } from "./types";
import { getAccessToken, getDevEmail, getDevUserId } from "./auth";
import { getApiBase } from "./api-base";

const API_BASE = getApiBase();
const CLIENT_ID_KEY = "opclab_client_id_v1";

export type UsageOp = "runs" | "sweep_points" | "exports";

export type UsageStatus = {
  day_utc: string;
  plan: Plan;
  limits: Record<UsageOp, number>;
  usage: Record<UsageOp, number>;
  remaining: Record<UsageOp, number>;
};

export type UsageConsumeResponse = {
  allowed: boolean;
  granted: number;
  reason?: string | null;
  status: UsageStatus;
};

export type PlanEntitlements = {
  plan: Plan;
  limits: Record<UsageOp, number>;
  max_custom_rects: number;
  max_sweep_points_per_run: number;
  scenario_limit?: number | null;
  quick_add_enabled: boolean;
  batch_sweep_enabled: boolean;
  high_res_export_enabled: boolean;
  updated_at_utc: string;
};

export type EntitlementsResponse = {
  version: string;
  plans: PlanEntitlements[];
};

export type CurrentEntitlementResponse = {
  user_id: string;
  plan: Plan;
  source: string;
  pro_expires_at_utc?: string | null;
  limits: Record<UsageOp, number>;
  max_custom_rects: number;
  max_sweep_points_per_run: number;
  scenario_limit?: number | null;
  quick_add_enabled: boolean;
  batch_sweep_enabled: boolean;
  high_res_export_enabled: boolean;
  updated_at_utc: string;
};

export function getOrCreateClientId(): string {
  if (typeof window === "undefined") return "server";
  const existing = window.localStorage.getItem(CLIENT_ID_KEY);
  if (existing) return existing;
  const id = `opc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  window.localStorage.setItem(CLIENT_ID_KEY, id);
  return id;
}

export function clientHeaders(extra?: Record<string, string>): Record<string, string> {
  const base: Record<string, string> = { "x-opclab-client-id": getOrCreateClientId() };
  const token = getAccessToken();
  if (token) {
    base.Authorization = `Bearer ${token}`;
  }
  const userId = getDevUserId();
  if (userId) {
    base["x-opclab-user-id"] = userId;
  }
  const email = getDevEmail();
  if (email) {
    base["x-opclab-email"] = email;
  }
  return extra ? { ...base, ...extra } : base;
}

export async function fetchUsageStatus(plan: Plan): Promise<UsageStatus> {
  const q = new URLSearchParams({ plan }).toString();
  const r = await fetch(`${API_BASE}/usage/status?${q}`, {
    method: "GET",
    headers: clientHeaders(),
  });
  const data = (await r.json()) as UsageStatus & { detail?: string };
  if (!r.ok) throw new Error(data.detail ?? "Failed to load usage status");
  return data;
}

export async function consumeUsage(
  plan: Plan,
  op: UsageOp,
  amount: number = 1,
  clamp: boolean = false
): Promise<UsageConsumeResponse> {
  const r = await fetch(`${API_BASE}/usage/consume`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...clientHeaders() },
    body: JSON.stringify({ plan, op, amount, clamp }),
  });
  const data = (await r.json()) as UsageConsumeResponse & { detail?: string };
  if (!r.ok) throw new Error(data.detail ?? "Failed to consume usage");
  return data;
}

export async function fetchEntitlements(): Promise<EntitlementsResponse> {
  const r = await fetch(`${API_BASE}/entitlements`, {
    method: "GET",
    headers: clientHeaders(),
  });
  const data = (await r.json()) as EntitlementsResponse & { detail?: string };
  if (!r.ok) throw new Error(data.detail ?? "Failed to load entitlements");
  return data;
}

export async function fetchCurrentEntitlement(): Promise<CurrentEntitlementResponse> {
  const r = await fetch(`${API_BASE}/entitlements/me`, {
    method: "GET",
    headers: clientHeaders(),
  });
  const data = (await r.json()) as CurrentEntitlementResponse & { detail?: string };
  if (!r.ok) throw new Error(data.detail ?? "Failed to load current entitlement");
  return data;
}
