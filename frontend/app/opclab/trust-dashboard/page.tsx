"use client";

import { useEffect, useState } from "react";
import { clientHeaders } from "../../../lib/usage";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

type BenchmarkCaseResult = {
  case_id: string;
  title: string;
  status: "passed" | "failed";
  checks_passed: number;
  checks_total: number;
  duration_ms: number;
  error?: string | null;
};

type BenchmarkRun = {
  run_id: string;
  generated_at_utc: string;
  model_version: string;
  suite_version: string;
  cases_total: number;
  cases_passed: number;
  pass_rate: number;
  artifact_file?: string | null;
  cases: BenchmarkCaseResult[];
};

type TrendPoint = {
  run_id: string;
  generated_at_utc: string;
  model_version: string;
  cases_total: number;
  cases_passed: number;
  pass_rate: number;
};

type TrustTrendResponse = {
  generated_at_utc: string;
  history_count: number;
  latest?: BenchmarkRun | null;
  trend: TrendPoint[];
};

function pct(v?: number | null): string {
  if (v == null || !Number.isFinite(v)) return "-";
  return `${(v * 100).toFixed(1)}%`;
}

export default function TrustDashboardPage() {
  const [limit, setLimit] = useState(20);
  const [data, setData] = useState<TrustTrendResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE}/trust/benchmarks/trend?limit=${limit}`, {
          method: "GET",
          headers: clientHeaders(),
        });
        const payload = (await res.json()) as TrustTrendResponse & { detail?: string };
        if (!res.ok) throw new Error(payload.detail ?? "Failed to load trust benchmark trend.");
        setData(payload);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load trust benchmark trend.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [limit]);

  const latest = data?.latest ?? null;

  return (
    <main style={{ maxWidth: 1120, margin: "0 auto", padding: "28px 22px 44px", lineHeight: 1.55 }}>
      <header style={{ display: "grid", gap: 10 }}>
        <h1 style={{ margin: 0, fontSize: 34, letterSpacing: "-0.02em" }}>OPC Lab Trust Dashboard</h1>
        <p style={{ margin: 0, opacity: 0.78 }}>
          Benchmark pass-rate trend by model version. Dates shown below are absolute UTC timestamps.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <a className="model-guide-link" href="/opclab">Back to Lab</a>
          <a className="model-guide-link" href="/opclab/benchmark-gallery">Benchmark Gallery</a>
          <a className="model-guide-link" href="/opclab/model-change-log">Model Change Log</a>
          <a className="model-guide-link" href="/opclab/revenue-dashboard">Revenue Dashboard</a>
        </div>
      </header>

      <section style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, fontWeight: 620, color: "rgba(22,34,54,0.76)" }}>History</span>
        <div className="mini-seg">
          <button onClick={() => setLimit(10)} disabled={limit === 10}>10</button>
          <button onClick={() => setLimit(20)} disabled={limit === 20}>20</button>
          <button onClick={() => setLimit(50)} disabled={limit === 50}>50</button>
        </div>
        {loading && <span className="small-note tiny-note">Loading...</span>}
        {data && (
          <span className="small-note tiny-note">
            Generated {new Date(data.generated_at_utc).toLocaleString()}
          </span>
        )}
      </section>

      {error && (
        <section style={{ marginTop: 14 }}>
          <div className="small-note" style={{ color: "#7f243e" }}>{error}</div>
        </section>
      )}

      {data && (
        <>
          <section style={{ marginTop: 16, display: "grid", gap: 10, gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
            <MetricCard title="Latest Pass Rate" value={latest ? pct(latest.pass_rate) : "-"} sub={latest ? `${latest.cases_passed}/${latest.cases_total}` : "No benchmark artifact yet"} />
            <MetricCard title="Model Version" value={latest?.model_version ?? "-"} sub={latest ? `Suite ${latest.suite_version}` : "Run benchmark suite first"} />
            <MetricCard title="History Rows" value={String(data.history_count)} sub={`Displayed ${data.trend.length}`} />
            <MetricCard title="Latest Run ID" value={latest?.run_id ?? "-"} sub={latest ? new Date(latest.generated_at_utc).toLocaleString() : "No run"} />
          </section>

          <section style={{ marginTop: 18 }}>
            <h2 style={{ margin: 0, fontSize: 22, letterSpacing: "-0.01em" }}>Version Trend</h2>
            <div style={{ marginTop: 10, border: "1px solid rgba(33,44,64,0.12)", borderRadius: 14, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "rgba(240,245,252,0.8)" }}>
                    <th style={thStyle}>Generated (UTC)</th>
                    <th style={thStyle}>Model Version</th>
                    <th style={thStyle}>Pass Rate</th>
                    <th style={thStyle}>Pass/Total</th>
                    <th style={thStyle}>Run ID</th>
                  </tr>
                </thead>
                <tbody>
                  {data.trend.length === 0 && (
                    <tr>
                      <td style={tdStyle} colSpan={5}>No benchmark history yet. Run `python scripts/run_benchmark_suite.py` in backend.</td>
                    </tr>
                  )}
                  {data.trend
                    .slice()
                    .reverse()
                    .map((row) => (
                      <tr key={row.run_id}>
                        <td style={tdStyle}>{row.generated_at_utc}</td>
                        <td style={tdStyle}>{row.model_version}</td>
                        <td style={tdStyle}>{pct(row.pass_rate)}</td>
                        <td style={tdStyle}>{row.cases_passed}/{row.cases_total}</td>
                        <td style={tdStyle}>{row.run_id}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>

          {latest && (
            <section style={{ marginTop: 18 }}>
              <h2 style={{ margin: 0, fontSize: 22, letterSpacing: "-0.01em" }}>Latest Case Status</h2>
              <div style={{ marginTop: 10, border: "1px solid rgba(33,44,64,0.12)", borderRadius: 14, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "rgba(240,245,252,0.8)" }}>
                      <th style={thStyle}>Case ID</th>
                      <th style={thStyle}>Title</th>
                      <th style={thStyle}>Status</th>
                      <th style={thStyle}>Checks</th>
                      <th style={thStyle}>Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {latest.cases.map((row) => (
                      <tr key={row.case_id}>
                        <td style={tdStyle}>{row.case_id}</td>
                        <td style={tdStyle}>{row.title}</td>
                        <td style={tdStyle}>{row.status.toUpperCase()}</td>
                        <td style={tdStyle}>{row.checks_passed}/{row.checks_total}</td>
                        <td style={tdStyle}>{row.duration_ms} ms</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
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
