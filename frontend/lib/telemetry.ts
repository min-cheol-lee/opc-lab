import { clientHeaders } from "./usage";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";
const EVENT_QUEUE_KEY = "opclab_event_queue_v1";
const EVENT_FLUSH_DELAY_MS = 1200;
const EVENT_FLUSH_BATCH = 120;
const EVENT_FLUSH_THRESHOLD = 24;

export type ProductEventName =
  | "run_sim_clicked"
  | "run_sim_succeeded"
  | "run_sim_failed"
  | "sweep_run_clicked"
  | "sweep_run_succeeded"
  | "sweep_run_failed"
  | "export_attempted"
  | "export_completed"
  | "export_blocked_quota"
  | "usage_quota_exhausted"
  | "upgrade_prompt_viewed"
  | "upgrade_prompt_clicked";

type EventPayloadValue = string | number | boolean | null;
type EventRecord = {
  name: ProductEventName;
  ts: string;
  payload: Record<string, EventPayloadValue>;
};

let flushPromise: Promise<void> | null = null;
let flushTimer: number | null = null;

function sanitizePayload(payload?: Record<string, unknown>): Record<string, EventPayloadValue> {
  if (!payload) return {};
  const out: Record<string, EventPayloadValue> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value == null) {
      out[key] = null;
      continue;
    }
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      out[key] = value;
      continue;
    }
    try {
      out[key] = JSON.stringify(value);
    } catch {
      out[key] = String(value);
    }
  }
  return out;
}

function readQueue(): EventRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(EVENT_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as EventRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(events: EventRecord[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(EVENT_QUEUE_KEY, JSON.stringify(events.slice(-400)));
  } catch {
    // Ignore telemetry write errors; never block product flow.
  }
}

function scheduleFlush() {
  if (typeof window === "undefined" || flushTimer != null) return;
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    void flushProductEvents();
  }, EVENT_FLUSH_DELAY_MS);
}

export async function flushProductEvents(maxBatch: number = EVENT_FLUSH_BATCH): Promise<void> {
  if (typeof window === "undefined") return;
  if (flushPromise) return flushPromise;

  flushPromise = (async () => {
    const batchSize = Math.max(1, Math.min(maxBatch, 200));
    while (true) {
      const queue = readQueue();
      if (!queue.length) break;
      const batch = queue.slice(0, batchSize);
      try {
        const r = await fetch(`${API_BASE}/events/ingest`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...clientHeaders() },
          body: JSON.stringify({ events: batch }),
        });
        if (!r.ok) break;
        writeQueue(queue.slice(batch.length));
      } catch {
        break;
      }
    }
  })();

  try {
    await flushPromise;
  } finally {
    flushPromise = null;
  }
}

export function trackProductEvent(name: ProductEventName, payload?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  const event: EventRecord = {
    name,
    ts: new Date().toISOString(),
    payload: sanitizePayload(payload),
  };
  const next = [...readQueue(), event].slice(-400);
  writeQueue(next);
  if (next.length >= EVENT_FLUSH_THRESHOLD) {
    void flushProductEvents();
  } else {
    scheduleFlush();
  }
  if (process.env.NODE_ENV !== "production") {
    console.debug("[opc-event]", event.name, event.payload);
  }
}
