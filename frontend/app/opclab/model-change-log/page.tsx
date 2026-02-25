import { MODEL_CHANGE_LOG } from "../../../lib/trust-assets";

export default function ModelChangeLogPage() {
  return (
    <main style={{ maxWidth: 1020, margin: "0 auto", padding: "28px 22px 44px", lineHeight: 1.55 }}>
      <header style={{ display: "grid", gap: 10 }}>
        <h1 style={{ margin: 0, fontSize: 34, letterSpacing: "-0.02em" }}>OPC Lab Model Change Log</h1>
        <p style={{ margin: 0, opacity: 0.78 }}>
          Transparent record of simulation/model-affecting updates. Dates below are absolute release dates for traceability.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <a className="model-guide-link" href="/opclab/advanced-analytics">Advanced Analytics</a>
          <a className="model-guide-link" href="/opclab/model-summary">Model Guide</a>
          <a className="model-guide-link" href="/opclab/benchmark-gallery">Benchmark Gallery</a>
          <a className="model-guide-link" href="/opclab/trust-dashboard">Trust Dashboard</a>
          <a className="model-guide-link" href="/opclab/revenue-dashboard">Revenue Dashboard</a>
          <a className="model-guide-link" href="/opclab">Back to Lab</a>
        </div>
      </header>

      <section style={{ marginTop: 20, display: "grid", gap: 12 }}>
        {MODEL_CHANGE_LOG.map((entry) => (
          <article
            key={entry.id}
            style={{
              border: "1px solid rgba(33,44,64,0.14)",
              borderRadius: 14,
              background: "linear-gradient(180deg, rgba(255,255,255,0.95), rgba(246,250,255,0.88))",
              boxShadow: "0 12px 26px rgba(18,30,48,0.08)",
              padding: "14px 14px 12px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={statusPill(entry.status)}>{entry.status.toUpperCase()}</span>
              <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.01em" }}>{entry.versionTag}</span>
              <span style={{ fontSize: 12, opacity: 0.66 }}>{entry.releasedOn}</span>
              <span style={scopePill}>{entry.scope.toUpperCase()}</span>
            </div>
            <p style={{ marginTop: 8, marginBottom: 8, color: "rgba(16,28,44,0.9)" }}>{entry.summary}</p>
            <div style={{ fontSize: 13, color: "rgba(20,32,50,0.86)" }}>
              <b>User impact:</b> {entry.userImpact}
            </div>
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 650, color: "rgba(20,34,54,0.74)", marginBottom: 4 }}>Validation Notes</div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {entry.validation.map((item, idx) => (
                  <li key={`${entry.id}-${idx}`} style={{ marginBottom: 2 }}>{item}</li>
                ))}
              </ul>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}

const scopePill = {
  border: "1px solid rgba(66,90,130,0.28)",
  background: "linear-gradient(180deg, rgba(233,241,255,0.94), rgba(215,229,250,0.94))",
  color: "#2f4f82",
  borderRadius: 999,
  padding: "2px 9px",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.03em",
} as const;

function statusPill(status: "active" | "rolled_back" | "experimental") {
  if (status === "active") {
    return {
      border: "1px solid rgba(27,133,84,0.34)",
      background: "linear-gradient(180deg, rgba(216,245,229,0.94), rgba(197,236,217,0.94))",
      color: "#176744",
      borderRadius: 999,
      padding: "2px 9px",
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: "0.03em",
    } as const;
  }
  if (status === "experimental") {
    return {
      border: "1px solid rgba(197,126,22,0.34)",
      background: "linear-gradient(180deg, rgba(255,238,208,0.94), rgba(252,225,178,0.94))",
      color: "#845313",
      borderRadius: 999,
      padding: "2px 9px",
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: "0.03em",
    } as const;
  }
  return {
    border: "1px solid rgba(132,57,70,0.32)",
    background: "linear-gradient(180deg, rgba(255,228,233,0.94), rgba(252,205,216,0.94))",
    color: "#7e2b3d",
    borderRadius: 999,
    padding: "2px 9px",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.03em",
  } as const;
}
