import type { CSSProperties } from "react";

export default function ModelSummaryPage() {
  return (
    <main style={{ maxWidth: 980, margin: "0 auto", padding: "28px 22px 44px", lineHeight: 1.6 }}>
      <h1 style={{ margin: 0, fontSize: 36, letterSpacing: "-0.02em" }}>OPC Lab Imaging & Limits Guide</h1>
      <p style={{ marginTop: 10, opacity: 0.78 }}>
        Educational approximation only. Not calibrated for manufacturing sign-off.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
        <a className="model-guide-link" href="/opclab/advanced-analytics">Advanced Analytics</a>
        <a className="model-guide-link" href="/opclab/benchmark-gallery">Benchmark Gallery</a>
        <a className="model-guide-link" href="/opclab/model-change-log">Model Change Log</a>
        <a className="model-guide-link" href="/opclab/trust-dashboard">Trust Dashboard</a>
        <a className="model-guide-link" href="/opclab/revenue-dashboard">Revenue Dashboard</a>
        <a className="model-guide-link" href="/opclab">Back to Lab</a>
      </div>

      <section style={{ marginTop: 28 }}>
        <h2 style={{ fontSize: 24, marginBottom: 10 }}>1) Model Scope</h2>
        <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid rgba(25,35,52,0.16)" }}>
          <thead>
            <tr style={{ background: "rgba(240,245,252,0.75)" }}>
              <th style={thStyle}>Layer</th>
              <th style={thStyle}>Current Model</th>
              <th style={thStyle}>Notes</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={tdStyle}>Mask</td>
              <td style={tdStyle}>Binary rectangle rasterization</td>
              <td style={tdStyle}>No absorber 3D, no full reflective EUV mask stack physics</td>
            </tr>
            <tr>
              <td style={tdStyle}>Optics</td>
              <td style={tdStyle}>FFT pupil low-pass + focus blur + diffraction blur</td>
              <td style={tdStyle}>Scalar coherent proxy, not full vector/partial coherence</td>
            </tr>
            <tr>
              <td style={tdStyle}>Print</td>
              <td style={tdStyle}>Single threshold on absolute aerial intensity</td>
              <td style={tdStyle}>Dose is an absolute threshold in [0,1], no per-pattern min-max normalization</td>
            </tr>
            <tr>
              <td style={tdStyle}>Contour</td>
              <td style={tdStyle}>Iso-contour from intensity field</td>
              <td style={tdStyle}>Contours are extracted at level = dose</td>
            </tr>
            <tr>
              <td style={tdStyle}>CD Metric</td>
              <td style={tdStyle}>Center-line simple CD + Rayleigh printability guard</td>
              <td style={tdStyle}>Sub-limit requested CD is treated as non-printing in this educational model</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section style={{ marginTop: 28 }}>
        <h2 style={{ fontSize: 24, marginBottom: 10 }}>2) Core Flow</h2>
        <pre style={preStyle}>{`Preset/Custom mask
  -> rasterize to binary mask
  -> FFT optics (pupil cutoff from NA/lambda + focus filter + diffraction filter)
  -> aerial intensity clip to [0,1] (absolute scale)
  -> threshold by dose
  -> contour extraction (iso-level = dose)
  -> metrics (simple CD + printability guard)`}</pre>
      </section>

      <section style={{ marginTop: 28 }}>
        <h2 style={{ fontSize: 24, marginBottom: 10 }}>3) DUV/EUV Limit Logic (Rayleigh Guard)</h2>
        <p>
          The app applies an industry-style printability criterion using
          <b> CD_min ~= k1 * lambda / NA</b>. If the requested nominal CD is below this floor,
          the result is treated as non-printing (contours removed, CD metric omitted).
        </p>
        <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid rgba(25,35,52,0.16)" }}>
          <thead>
            <tr style={{ background: "rgba(240,245,252,0.75)" }}>
              <th style={thStyle}>Regime</th>
              <th style={thStyle}>Preset</th>
              <th style={thStyle}>k1 (guard)</th>
              <th style={thStyle}>Approx CD_min</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={tdStyle}>DUV 193 Dry</td>
              <td style={tdStyle}>NA 0.93</td>
              <td style={tdStyle}>0.28</td>
              <td style={tdStyle}>~58 nm</td>
            </tr>
            <tr>
              <td style={tdStyle}>DUV 193 Immersion</td>
              <td style={tdStyle}>NA 1.35</td>
              <td style={tdStyle}>0.26</td>
              <td style={tdStyle}>~37 nm</td>
            </tr>
            <tr>
              <td style={tdStyle}>EUV Low-NA</td>
              <td style={tdStyle}>13.5 nm, NA 0.33</td>
              <td style={tdStyle}>0.30</td>
              <td style={tdStyle}>~12.3 nm</td>
            </tr>
            <tr>
              <td style={tdStyle}>EUV High-NA</td>
              <td style={tdStyle}>13.5 nm, NA 0.55</td>
              <td style={tdStyle}>0.26</td>
              <td style={tdStyle}>~6.4 nm</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section style={{ marginTop: 28 }}>
        <h2 style={{ fontSize: 24, marginBottom: 10 }}>4) Why Small SRAF-Like Lines Can Disappear</h2>
        <p>
          Very thin assist-like lines can be below the printability floor for the selected wavelength/NA pair.
          In that case, the model suppresses printed contour output by design. This prevents false-positive
          printing that can happen when each pattern is independently normalized.
        </p>
      </section>

      <section style={{ marginTop: 28 }}>
        <h2 style={{ fontSize: 24, marginBottom: 10 }}>5) Current Physics Simplifications</h2>
        <ul>
          <li>Optics: scalar coherent approximation in Fourier domain.</li>
          <li>Mask: binary transmission, rectangle-only primitives in current stage.</li>
          <li>Printing: single-threshold contour, no stochastic resist model.</li>
          <li>Limits: k1 values are conservative educational guardrails, not fab calibration.</li>
        </ul>
      </section>

      <section style={{ marginTop: 28 }}>
        <h2 style={{ fontSize: 24, marginBottom: 10 }}>6) FAQ</h2>
        <p><b>Q:</b> Is this sign-off accurate?<br /><b>A:</b> No. It is educational visualization only.</p>
        <p><b>Q:</b> Why does changing dose move contour strongly?<br /><b>A:</b> Dose is directly the absolute aerial threshold used for contour extraction.</p>
        <p><b>Q:</b> Can this be extended?<br /><b>A:</b> Yes. Next steps include partial coherence, resist model, and calibrated process data.</p>
      </section>

      <section style={{ marginTop: 28 }}>
        <h2 style={{ fontSize: 24, marginBottom: 10 }}>7) Reference Notes for k1 Guard</h2>
        <p>
          The k1 guard values in this app are hard-coded educational guardrails, selected from common
          industry Rayleigh ranges rather than copied from a single process-of-record.
        </p>
        <ul>
          <li>
            ASML Rayleigh criterion overview (CD = k1 * lambda / NA, physical bound near k1=0.25):{" "}
            <a href="https://www.asml.com/en/technology/lithography-principles/rayleigh-criterion" target="_blank" rel="noreferrer">
              asml.com/.../rayleigh-criterion
            </a>
          </li>
          <li>
            Micron photolithography educational material (practical k1 context beyond theoretical bound):{" "}
            <a
              href="https://www.micron.com/content/dam/micron/educatorhub/fabrication/photolithography/micron-fabrication-intro-to-photolithography-presentation.pdf"
              target="_blank"
              rel="noreferrer"
            >
              micron.com photolithography presentation
            </a>
          </li>
          <li>
            EUV symposium material used for NA/CD scaling intuition (0.33 NA vs high-NA trend):{" "}
            <a href="https://euvlsymposium.lbl.gov/pdf/2012/pres/V.%20Banine.pdf" target="_blank" rel="noreferrer">
              euvlsymposium.lbl.gov V. Banine
            </a>
          </li>
        </ul>
        <p>
          Current hard-coded values: DUV dry 0.28, DUV immersion 0.26, EUV low-NA 0.30, EUV high-NA 0.26.
        </p>
      </section>
    </main>
  );
}

const thStyle: CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  borderBottom: "1px solid rgba(25,35,52,0.16)",
  borderRight: "1px solid rgba(25,35,52,0.12)",
  fontWeight: 650,
  fontSize: 14,
};

const tdStyle: CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid rgba(25,35,52,0.12)",
  borderRight: "1px solid rgba(25,35,52,0.12)",
  fontSize: 14,
};

const preStyle: CSSProperties = {
  margin: 0,
  padding: "14px 16px",
  borderRadius: 12,
  border: "1px solid rgba(25,35,52,0.14)",
  background: "rgba(245,248,253,0.7)",
  fontSize: 14,
};
