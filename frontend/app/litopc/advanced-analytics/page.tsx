type BossungSeries = {
  label: string;
  color: string;
  points: Array<{ x: number; y: number }>;
};

const bossungSample: BossungSeries[] = [
  { label: "Dose 0.35", color: "#2f7dff", points: [{ x: -60, y: 102 }, { x: -30, y: 95 }, { x: 0, y: 88 }, { x: 30, y: 94 }, { x: 60, y: 101 }] },
  { label: "Dose 0.45", color: "#0a84ff", points: [{ x: -60, y: 95 }, { x: -30, y: 87 }, { x: 0, y: 80 }, { x: 30, y: 86 }, { x: 60, y: 93 }] },
  { label: "Dose 0.55", color: "#ff9f0a", points: [{ x: -60, y: 89 }, { x: -30, y: 81 }, { x: 0, y: 74 }, { x: 30, y: 79 }, { x: 60, y: 86 }] },
];

const processWindowSample: Array<{ dose: number; focus: number; pass: boolean }> = (() => {
  const out: Array<{ dose: number; focus: number; pass: boolean }> = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 10; c++) {
      const dose = 0.3 + c * 0.05;
      const focus = -70 + r * 20;
      const pass = Math.abs(focus) < 52 && dose >= 0.4 && dose <= 0.7 && !(focus > 40 && dose < 0.5);
      out.push({ dose, focus, pass });
    }
  }
  return out;
})();

export default function AdvancedAnalyticsPage() {
  return (
    <main style={{ maxWidth: 1120, margin: "0 auto", padding: "28px 22px 44px", lineHeight: 1.55 }}>
      <header style={{ display: "grid", gap: 10 }}>
        <h1 style={{ margin: 0, fontSize: 34, letterSpacing: "-0.02em" }}>Advanced Analytics Preview</h1>
        <p style={{ margin: 0, opacity: 0.78 }}>
          Phase 2 skeleton for Bossung curve and process window map. This preview is UI-only with sample data.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <a className="model-guide-link" href="/litopc/model-summary">Model Guide</a>
          <a className="model-guide-link" href="/litopc/benchmark-gallery">Benchmark Gallery</a>
          <a className="model-guide-link" href="/litopc/model-change-log">Model Change Log</a>
          <a className="model-guide-link" href="/litopc/trust-dashboard">Trust Dashboard</a>
          <a className="model-guide-link" href="/litopc/revenue-dashboard">Revenue Dashboard</a>
          <a className="model-guide-link" href="/litopc">Back to Lab</a>
        </div>
      </header>

      <section style={{ marginTop: 18, display: "grid", gridTemplateColumns: "320px 1fr", gap: 12 }}>
        <aside
          style={{
            border: "1px solid rgba(33,44,64,0.14)",
            borderRadius: 14,
            background: "linear-gradient(180deg, rgba(255,255,255,0.95), rgba(246,250,255,0.88))",
            boxShadow: "0 12px 26px rgba(18,30,48,0.08)",
            padding: 12,
            display: "grid",
            gap: 10,
            alignContent: "start",
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(20,34,54,0.64)" }}>
            Controls (Skeleton)
          </div>
          <label>
            <div style={labelStyle}>Mode</div>
            <select style={inputStyle} defaultValue="bossung" disabled>
              <option value="bossung">Bossung</option>
              <option value="window">Process Window</option>
            </select>
          </label>
          <label>
            <div style={labelStyle}>Dose Conditions</div>
            <input style={inputStyle} defaultValue="0.35, 0.45, 0.55" disabled />
          </label>
          <label>
            <div style={labelStyle}>Focus Range (nm)</div>
            <input style={inputStyle} defaultValue="-60 ~ 60, step 15" disabled />
          </label>
          <label>
            <div style={labelStyle}>CD Tolerance (nm)</div>
            <input style={inputStyle} defaultValue="10" disabled />
          </label>
          <button className="run-sweep-btn" style={{ width: "100%" }} disabled>
            Pro Analytics (Phase 2)
          </button>
          <div className="small-note tiny-note">
            This panel is a structural scaffold for endpoint integration. Final behavior will bind to backend advanced endpoints.
          </div>
        </aside>

        <div style={{ display: "grid", gap: 12 }}>
          <article style={panelStyle}>
            <div style={titleRowStyle}>
              <h2 style={titleStyle}>Bossung Curve (CD vs Focus)</h2>
              <span style={chipStyle}>Preview</span>
            </div>
            <BossungChart series={bossungSample} />
          </article>

          <article style={panelStyle}>
            <div style={titleRowStyle}>
              <h2 style={titleStyle}>Process Window Map (Dose-Focus Pass/Fail)</h2>
              <span style={chipStyle}>Preview</span>
            </div>
            <ProcessWindowGrid />
          </article>
        </div>
      </section>
    </main>
  );
}

function BossungChart(props: { series: BossungSeries[] }) {
  const { series } = props;
  const w = 760;
  const h = 280;
  const left = 52;
  const top = 20;
  const plotW = w - left - 18;
  const plotH = h - top - 32;
  const xs = series.flatMap((s) => s.points.map((p) => p.x));
  const ys = series.flatMap((s) => s.points.map((p) => p.y));
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const toX = (v: number) => left + ((v - minX) / Math.max(1e-9, maxX - minX)) * plotW;
  const toY = (v: number) => top + plotH - ((v - minY) / Math.max(1e-9, maxY - minY)) * plotH;

  return (
    <div className="sweep-chart-wrap">
      <svg viewBox={`0 0 ${w} ${h}`} className="sweep-chart" role="img" aria-label="Bossung curve preview">
        <rect x={left} y={top} width={plotW} height={plotH} rx={9} className="sweep-chart-bg" />
        <line x1={left} y1={top + plotH} x2={left + plotW} y2={top + plotH} className="sweep-axis" />
        <line x1={left} y1={top} x2={left} y2={top + plotH} className="sweep-axis" />
        {series.map((s) => {
          const d = s.points.map((p, idx) => `${idx === 0 ? "M" : "L"} ${toX(p.x).toFixed(1)} ${toY(p.y).toFixed(1)}`).join(" ");
          return <path key={s.label} d={d} className="sweep-line" style={{ stroke: s.color }} />;
        })}
        {series.map((s) =>
          s.points.map((p, idx) => (
            <circle
              key={`${s.label}-${idx}`}
              cx={toX(p.x)}
              cy={toY(p.y)}
              r={2.8}
              className="sweep-point"
              style={{ stroke: s.color, fill: "#fff" }}
            />
          ))
        )}
        <text x={left} y={h - 8} className="sweep-label">Focus (nm)</text>
        <text x={8} y={top + 10} className="sweep-label">CD (nm)</text>
        <text x={left} y={top + plotH + 16} className="sweep-tick">{minX.toFixed(0)}</text>
        <text x={left + plotW} y={top + plotH + 16} textAnchor="end" className="sweep-tick">{maxX.toFixed(0)}</text>
      </svg>
      <div className="sweep-series-legend">
        {series.map((s) => (
          <span key={s.label} className="sweep-series-item">
            <i style={{ background: s.color }} /> {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function ProcessWindowGrid() {
  const rows = Array.from(new Set(processWindowSample.map((v) => v.focus))).sort((a, b) => b - a);
  const cols = Array.from(new Set(processWindowSample.map((v) => v.dose))).sort((a, b) => a - b);
  return (
    <div
      style={{
        border: "1px solid rgba(33,44,64,0.14)",
        borderRadius: 10,
        padding: 8,
        background: "linear-gradient(180deg, rgba(255,255,255,0.84), rgba(246,250,255,0.72))",
      }}
    >
      <div style={{ display: "grid", gridTemplateColumns: `66px repeat(${cols.length}, 1fr)`, gap: 4, alignItems: "center" }}>
        <div />
        {cols.map((c) => (
          <div key={`d-${c}`} style={{ textAlign: "center", fontSize: 11, color: "rgba(24,38,58,0.72)" }}>{c.toFixed(2)}</div>
        ))}
        {rows.map((r) => (
          <>
            <div key={`f-${r}`} style={{ fontSize: 11, color: "rgba(24,38,58,0.72)" }}>{r.toFixed(0)}nm</div>
            {cols.map((c) => {
              const cell = processWindowSample.find((v) => v.focus === r && v.dose === c);
              const pass = !!cell?.pass;
              return (
                <div
                  key={`cell-${r}-${c}`}
                  title={`focus=${r}, dose=${c.toFixed(2)} ${pass ? "PASS" : "FAIL"}`}
                  style={{
                    height: 18,
                    borderRadius: 6,
                    border: pass ? "1px solid rgba(30,122,78,0.42)" : "1px solid rgba(130,64,78,0.34)",
                    background: pass
                      ? "linear-gradient(180deg, rgba(216,245,229,0.94), rgba(194,236,215,0.94))"
                      : "linear-gradient(180deg, rgba(255,230,235,0.94), rgba(252,206,216,0.94))",
                  }}
                />
              );
            })}
          </>
        ))}
      </div>
      <div style={{ marginTop: 8, display: "flex", gap: 10, fontSize: 12, color: "rgba(20,34,54,0.74)" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <i style={{ width: 10, height: 10, borderRadius: 4, background: "rgba(42,145,92,0.9)" }} /> Pass
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <i style={{ width: 10, height: 10, borderRadius: 4, background: "rgba(175,70,98,0.9)" }} /> Fail
        </span>
      </div>
    </div>
  );
}

const panelStyle = {
  border: "1px solid rgba(33,44,64,0.14)",
  borderRadius: 14,
  background: "linear-gradient(180deg, rgba(255,255,255,0.95), rgba(246,250,255,0.88))",
  boxShadow: "0 12px 26px rgba(18,30,48,0.08)",
  padding: 12,
};

const titleRowStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  marginBottom: 8,
};

const titleStyle = {
  margin: 0,
  fontSize: 20,
  letterSpacing: "-0.01em",
};

const chipStyle = {
  border: "1px solid rgba(66,90,130,0.28)",
  background: "linear-gradient(180deg, rgba(233,241,255,0.94), rgba(215,229,250,0.94))",
  color: "#2f4f82",
  borderRadius: 999,
  padding: "2px 9px",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.03em",
} as const;

const labelStyle = {
  fontSize: 11,
  fontWeight: 640,
  letterSpacing: "0.03em",
  textTransform: "uppercase" as const,
  color: "rgba(24,38,58,0.62)",
  marginBottom: 3,
};

const inputStyle = {
  width: "100%",
  minHeight: 34,
  border: "1px solid rgba(33,44,64,0.14)",
  borderRadius: 8,
  padding: "5px 8px",
  background: "#fff",
};

