"use client";

import { useEffect, useMemo, useState } from "react";
import { clientHeaders } from "../../../lib/usage";
import { getApiBase } from "../../../lib/api-base";

const API_BASE = getApiBase();

type ProductEventName =
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

type EventSummary = {
  generated_at_utc: string;
  window_days: number;
  totals: Record<ProductEventName, number>;
  by_day: Array<{
    day_utc: string;
    counts: Record<ProductEventName, number>;
    upgrade_click_rate?: number | null;
    export_block_rate?: number | null;
  }>;
  upgrade_click_rate?: number | null;
  export_block_rate?: number | null;
};

type PolicyAudit = {
  count: number;
  records: Array<{
    decision: "allowed" | "adjusted" | "blocked" | "clamped" | "observed";
    endpoint: string;
    reason?: string | null;
  }>;
};

function pct(v?: number | null): string {
  if (v == null || !Number.isFinite(v)) return "-";
  return `${(v * 100).toFixed(1)}%`;
}

export default function RevenueDashboardPage() {
  const [windowDays, setWindowDays] = useState(7);
  const [summary, setSummary] = useState<EventSummary | null>(null);
  const [audit, setAudit] = useState<PolicyAudit | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [summaryRes, auditRes] = await Promise.all([
          fetch(`${API_BASE}/events/summary?window_days=${windowDays}`, {
            method: "GET",
            headers: clientHeaders(),
          }),
          fetch(`${API_BASE}/policy/audit?limit=300`, {
            method: "GET",
            headers: clientHeaders(),
          }),
        ]);
        const summaryData = (await summaryRes.json()) as EventSummary & { detail?: string };
        if (!summaryRes.ok) throw new Error(summaryData.detail ?? "Failed to load event summary.");
        setSummary(summaryData);

        const auditData = (await auditRes.json()) as PolicyAudit & { detail?: string };
        if (!auditRes.ok) throw new Error(auditData.detail ?? "Failed to load policy audit summary.");
        setAudit(auditData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load dashboard data.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [windowDays]);

  const policyIncidents = useMemo(() => {
    if (!audit) return { blocked: 0, clamped: 0, adjusted: 0 };
    return audit.records.reduce(
      (acc, row) => {
        if (row.decision === "blocked") acc.blocked += 1;
        else if (row.decision === "clamped") acc.clamped += 1;
        else if (row.decision === "adjusted") acc.adjusted += 1;
        return acc;
      },
      { blocked: 0, clamped: 0, adjusted: 0 }
    );
  }, [audit]);

  return (
    <main style={{ maxWidth: 1120, margin: "0 auto", padding: "28px 22px 44px", lineHeight: 1.55 }}>
      <header style={{ display: "grid", gap: 10 }}>
        <h1 style={{ margin: 0, fontSize: 34, letterSpacing: "-0.02em" }}>OPC Lab Revenue Dashboard (Baseline)</h1>
        <p style={{ margin: 0, opacity: 0.78 }}>
          Funnel and quota baseline for Phase 2A. Dates are absolute UTC days.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <a className="model-guide-link" href="/opclab">Back to Lab</a>
          <a className="model-guide-link" href="/opclab/model-summary">Model Guide</a>
          <a className="model-guide-link" href="/opclab/benchmark-gallery">Benchmark Gallery</a>
          <a className="model-guide-link" href="/opclab/model-change-log">Model Change Log</a>
          <a className="model-guide-link" href="/opclab/trust-dashboard">Trust Dashboard</a>
        </div>
      </header>

      <section style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, fontWeight: 620, color: "rgba(22,34,54,0.76)" }}>Window</span>
        <div className="mini-seg">
          <button onClick={() => setWindowDays(7)} disabled={windowDays === 7}>7D</button>
          <button onClick={() => setWindowDays(14)} disabled={windowDays === 14}>14D</button>
          <button onClick={() => setWindowDays(30)} disabled={windowDays === 30}>30D</button>
        </div>
        {loading && <span className="small-note tiny-note">Loading...</span>}
        {summary && (
          <span className="small-note tiny-note">
            Generated {new Date(summary.generated_at_utc).toLocaleString()}
          </span>
        )}
      </section>

      {error && (
        <section style={{ marginTop: 14 }}>
          <div className="small-note" style={{ color: "#7f243e" }}>{error}</div>
        </section>
      )}

      {summary && (
        <>
          <section style={{ marginTop: 16, display: "grid", gap: 10, gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
            <MetricCard
              title="Upgrade Funnel"
              value={`${summary.totals.upgrade_prompt_clicked}/${summary.totals.upgrade_prompt_viewed}`}
              sub={`CTR ${pct(summary.upgrade_click_rate)}`}
            />
            <MetricCard
              title="Simulation Intent"
              value={`${summary.totals.run_sim_clicked}`}
              sub={`Sweep clicks ${summary.totals.sweep_run_clicked}`}
            />
            <MetricCard
              title="Export Pressure"
              value={`${summary.totals.export_blocked_quota}/${summary.totals.export_attempted}`}
              sub={`Blocked ${pct(summary.export_block_rate)}`}
            />
            <MetricCard
              title="Policy Incidents"
              value={`${policyIncidents.blocked}`}
              sub={`Clamped ${policyIncidents.clamped}, Adjusted ${policyIncidents.adjusted}`}
            />
          </section>

          <section style={{ marginTop: 18 }}>
            <h2 style={{ margin: 0, fontSize: 22, letterSpacing: "-0.01em" }}>Daily Trend</h2>
            <div style={{ marginTop: 10, border: "1px solid rgba(33,44,64,0.12)", borderRadius: 14, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "rgba(240,245,252,0.8)" }}>
                    <th style={thStyle}>Day (UTC)</th>
                    <th style={thStyle}>Upgrade V/C</th>
                    <th style={thStyle}>Run/Sweep Clicks</th>
                    <th style={thStyle}>Export Block Rate</th>
                    <th style={thStyle}>Quota Exhausted</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.by_day.map((d) => (
                    <tr key={d.day_utc}>
                      <td style={tdStyle}>{d.day_utc}</td>
                      <td style={tdStyle}>
                        {d.counts.upgrade_prompt_clicked}/{d.counts.upgrade_prompt_viewed} ({pct(d.upgrade_click_rate)})
                      </td>
                      <td style={tdStyle}>
                        {d.counts.run_sim_clicked}/{d.counts.sweep_run_clicked}
                      </td>
                      <td style={tdStyle}>{pct(d.export_block_rate)}</td>
                      <td style={tdStyle}>{d.counts.usage_quota_exhausted}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </main>
  );
}

function MetricCard(props: { title: string; value: string; sub: string }) {
  const { title, value, sub } = props;
  return (
    <article
      style={{
        border: "1px solid rgba(33,44,64,0.14)",
        borderRadius: 14,
        background: "linear-gradient(180deg, rgba(255,255,255,0.95), rgba(246,250,255,0.88))",
        boxShadow: "0 12px 26px rgba(18,30,48,0.08)",
        padding: "12px 13px",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 680, letterSpacing: "0.04em", textTransform: "uppercase", color: "rgba(28,42,62,0.66)" }}>
        {title}
      </div>
      <div style={{ marginTop: 6, fontSize: 24, fontWeight: 730, letterSpacing: "-0.02em", color: "rgba(16,28,44,0.94)" }}>
        {value}
      </div>
      <div style={{ marginTop: 4, fontSize: 12, color: "rgba(22,34,54,0.68)" }}>{sub}</div>
    </article>
  );
}

const thStyle = {
  textAlign: "left" as const,
  padding: "10px 12px",
  borderBottom: "1px solid rgba(25,35,52,0.16)",
  borderRight: "1px solid rgba(25,35,52,0.12)",
  fontWeight: 650,
  fontSize: 13,
};

const tdStyle = {
  padding: "10px 12px",
  borderBottom: "1px solid rgba(25,35,52,0.12)",
  borderRight: "1px solid rgba(25,35,52,0.12)",
  fontSize: 13,
};
