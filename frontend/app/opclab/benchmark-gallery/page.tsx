import { BENCHMARK_GALLERY } from "../../../lib/trust-assets";

export default function BenchmarkGalleryPage() {
  return (
    <main style={{ maxWidth: 1080, margin: "0 auto", padding: "28px 22px 44px", lineHeight: 1.55 }}>
      <header style={{ display: "grid", gap: 10 }}>
        <h1 style={{ margin: 0, fontSize: 34, letterSpacing: "-0.02em" }}>OPC Lab Benchmark Gallery</h1>
        <p style={{ margin: 0, opacity: 0.78 }}>
          Public benchmark set for reproducible behavior checks. This is an educational validation board, not sign-off qualification.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <a className="model-guide-link" href="/opclab/advanced-analytics">Advanced Analytics</a>
          <a className="model-guide-link" href="/opclab/model-summary">Model Guide</a>
          <a className="model-guide-link" href="/opclab/model-change-log">Model Change Log</a>
          <a className="model-guide-link" href="/opclab/trust-dashboard">Trust Dashboard</a>
          <a className="model-guide-link" href="/opclab/revenue-dashboard">Revenue Dashboard</a>
          <a className="model-guide-link" href="/opclab">Back to Lab</a>
        </div>
      </header>

      <section style={{ marginTop: 22, display: "grid", gap: 12 }}>
        {BENCHMARK_GALLERY.map((b) => (
          <article
            key={b.id}
            style={{
              border: "1px solid rgba(33,44,64,0.14)",
              borderRadius: 14,
              background: "linear-gradient(180deg, rgba(255,255,255,0.95), rgba(246,250,255,0.88))",
              boxShadow: "0 12px 26px rgba(18,30,48,0.08)",
              padding: "14px 14px 12px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <h2 style={{ margin: 0, fontSize: 21, letterSpacing: "-0.01em" }}>{b.title}</h2>
              <span style={pillStyle(b.status)}>{b.status.toUpperCase()}</span>
              <span style={{ fontSize: 12, opacity: 0.65 }}>Reviewed {b.lastReviewed}</span>
            </div>
            <p style={{ marginTop: 7, marginBottom: 10, color: "rgba(20,32,50,0.82)" }}>{b.intent}</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <KeyValue label="Preset" value={b.preset} />
              <KeyValue label="Mask" value={b.mask} />
              <KeyValue label="Setup" value={b.setup} full />
            </div>
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 650, color: "rgba(20,34,54,0.74)", marginBottom: 4 }}>Expected Behavior</div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {b.expected.map((e, idx) => (
                  <li key={`${b.id}-${idx}`} style={{ marginBottom: 2 }}>{e}</li>
                ))}
              </ul>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}

function KeyValue(props: { label: string; value: string; full?: boolean }) {
  const { label, value, full = false } = props;
  return (
    <div
      style={{
        gridColumn: full ? "1 / -1" : undefined,
        border: "1px solid rgba(33,44,64,0.12)",
        borderRadius: 10,
        background: "rgba(255,255,255,0.72)",
        padding: "7px 9px",
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 640, letterSpacing: "0.02em", color: "rgba(24,38,60,0.6)", textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 13, color: "rgba(16,28,44,0.9)" }}>{value}</div>
    </div>
  );
}

function pillStyle(status: "verified" | "partial" | "draft") {
  if (status === "verified") {
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
  if (status === "partial") {
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
    border: "1px solid rgba(66,90,130,0.28)",
    background: "linear-gradient(180deg, rgba(233,241,255,0.94), rgba(215,229,250,0.94))",
    color: "#2f4f82",
    borderRadius: 999,
    padding: "2px 9px",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.03em",
  } as const;
}
