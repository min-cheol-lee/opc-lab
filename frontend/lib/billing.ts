import type { Plan } from "./types";
import { clientHeaders } from "./usage";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

export type BillingStatus = {
  user_id: string;
  plan: Plan;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  subscription_status?: string | null;
  current_period_end_utc?: string | null;
  source: string;
};

export type BillingCheckoutResponse = {
  url: string;
  session_id: string;
};

export type BillingPortalResponse = {
  url: string;
};

export async function fetchBillingStatus(): Promise<BillingStatus> {
  const r = await fetch(`${API_BASE}/billing/me`, {
    method: "GET",
    headers: clientHeaders(),
  });
  const data = (await r.json()) as BillingStatus & { detail?: string };
  if (!r.ok) throw new Error(data.detail ?? "Failed to load billing status");
  return data;
}

export async function createCheckoutSession(successUrl: string, cancelUrl: string): Promise<BillingCheckoutResponse> {
  const r = await fetch(`${API_BASE}/billing/checkout/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...clientHeaders() },
    body: JSON.stringify({ success_url: successUrl, cancel_url: cancelUrl }),
  });
  const data = (await r.json()) as BillingCheckoutResponse & { detail?: string };
  if (!r.ok) throw new Error(data.detail ?? "Failed to create checkout session");
  return data;
}

export async function createPortalSession(returnUrl: string): Promise<BillingPortalResponse> {
  const r = await fetch(`${API_BASE}/billing/portal/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...clientHeaders() },
    body: JSON.stringify({ return_url: returnUrl }),
  });
  const data = (await r.json()) as BillingPortalResponse & { detail?: string };
  if (!r.ok) throw new Error(data.detail ?? "Failed to create billing portal session");
  return data;
}
