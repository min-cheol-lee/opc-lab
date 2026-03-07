import type { BatchSimResponse, RunRecord, SimRequest, SimResponse } from "./types";

const EXPORT_FONT =
  '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"';

export type ExportViewState = {
  legend?: boolean;
  mainContour?: boolean;
  aerial?: boolean;
  rulers?: boolean;
  compare?: boolean;
  scalePct?: number;
};

export type ExportSweepPoint = { x: number; y: number };
export type ExportSweepSeries = {
  label: string;
  color: string;
  dashed?: boolean;
  points: ExportSweepPoint[];
};
export type ExportSweepPayload = {
  title: string;
  xLabel: string;
  yLabel: string;
  series: ExportSweepSeries[];
};

function pad2(v: number): string {
  return String(v).padStart(2, "0");
}

function nowStamp(): string {
  const d = new Date();
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
}

function nowHuman(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function safeToken(v: string): string {
  return v.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 900);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = reject;
    fr.readAsDataURL(blob);
  });
}

function imageFromSrc(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function serializeSvg(svg: SVGSVGElement): Blob {
  const xml = new XMLSerializer().serializeToString(svg);
  return new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
}

function viewStateText(view?: ExportViewState): string {
  if (!view) return "";
  const l = view.legend ? "L:on" : "L:off";
  const c = view.mainContour ? "C:on" : "C:off";
  const a = view.aerial ? "A:on" : "A:off";
  const r = view.rulers ? "R:on" : "R:off";
  const cmp = view.compare ? "CMP:on" : "CMP:off";
  const z = Number.isFinite(view.scalePct) ? `Z:${Math.round(view.scalePct ?? 100)}%` : "";
  return [l, c, a, r, cmp, z].filter(Boolean).join(" ");
}

function compactMeta(req: SimRequest, sim: SimResponse | null, view?: ExportViewState): string {
  const template = req.mask.mode === "CUSTOM" ? "CUSTOM" : req.mask.template_id ?? "TEMPLATE";
  const nmPx = sim?.nm_per_pixel != null ? sim.nm_per_pixel.toFixed(2) : "-";
  const cd = sim?.metrics?.cd_nm != null ? `${sim.metrics.cd_nm.toFixed(1)} nm` : "-";
  const viewTxt = viewStateText(view);
  return `plan ${req.plan} · preset ${req.preset_id} · mask ${template} · grid ${req.grid} · dose ${req.dose.toFixed(2)} · nm/px ${nmPx} · CD ${cd}${viewTxt ? ` · ${viewTxt}` : ""}`;
}

function splitMetaLinesForCard(text: string, maxChars: number): string[] {
  const tokens = text.split(" · ");
  const lines: string[] = [];
  let line = "";
  for (const token of tokens) {
    const candidate = line ? `${line} · ${token}` : token;
    if (candidate.length <= maxChars) {
      line = candidate;
    } else {
      if (line) lines.push(line);
      line = token;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function attachExportStyle(svg: SVGSVGElement) {
  const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
  style.textContent = `
    text { font-family: ${EXPORT_FONT}; text-rendering: geometricPrecision; font-kerning: normal; }
    path, line, polyline, circle, rect { shape-rendering: geometricPrecision; }
  `;
  svg.insertBefore(style, svg.firstChild);
}

function attachExportBackdrop(svg: SVGSVGElement, vbW: number, vbH: number) {
  const ns = "http://www.w3.org/2000/svg";
  const defs = document.createElementNS(ns, "defs");

  const lg = document.createElementNS(ns, "linearGradient");
  lg.setAttribute("id", "export-bg-grad");
  lg.setAttribute("x1", "0");
  lg.setAttribute("y1", "0");
  lg.setAttribute("x2", "1");
  lg.setAttribute("y2", "1");
  const s1 = document.createElementNS(ns, "stop");
  s1.setAttribute("offset", "0%");
  s1.setAttribute("stop-color", "#223958");
  const s2 = document.createElementNS(ns, "stop");
  s2.setAttribute("offset", "44%");
  s2.setAttribute("stop-color", "#16293f");
  const s3 = document.createElementNS(ns, "stop");
  s3.setAttribute("offset", "100%");
  s3.setAttribute("stop-color", "#0a1628");
  lg.appendChild(s1);
  lg.appendChild(s2);
  lg.appendChild(s3);
  defs.appendChild(lg);

  const rg = document.createElementNS(ns, "radialGradient");
  rg.setAttribute("id", "export-bg-bloom");
  rg.setAttribute("cx", "50%");
  rg.setAttribute("cy", "44%");
  rg.setAttribute("r", "66%");
  const r1 = document.createElementNS(ns, "stop");
  r1.setAttribute("offset", "0%");
  r1.setAttribute("stop-color", "rgba(174,208,255,0.12)");
  const r2 = document.createElementNS(ns, "stop");
  r2.setAttribute("offset", "100%");
  r2.setAttribute("stop-color", "rgba(100,140,200,0)");
  rg.appendChild(r1);
  rg.appendChild(r2);
  defs.appendChild(rg);

  const pattern = document.createElementNS(ns, "pattern");
  pattern.setAttribute("id", "export-bg-grid");
  pattern.setAttribute("width", "72");
  pattern.setAttribute("height", "72");
  pattern.setAttribute("patternUnits", "userSpaceOnUse");
  const path = document.createElementNS(ns, "path");
  path.setAttribute("d", "M 72 0 L 0 0 0 72");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "rgba(170,194,230,0.07)");
  path.setAttribute("stroke-width", "1");
  pattern.appendChild(path);
  defs.appendChild(pattern);

  const first = svg.firstChild;
  if (first) svg.insertBefore(defs, first);
  else svg.appendChild(defs);

  const bgBase = document.createElementNS(ns, "rect");
  bgBase.setAttribute("x", "0");
  bgBase.setAttribute("y", "0");
  bgBase.setAttribute("width", String(vbW));
  bgBase.setAttribute("height", String(vbH));
  bgBase.setAttribute("fill", "url(#export-bg-grad)");

  const bgBloom = document.createElementNS(ns, "rect");
  bgBloom.setAttribute("x", "0");
  bgBloom.setAttribute("y", "0");
  bgBloom.setAttribute("width", String(vbW));
  bgBloom.setAttribute("height", String(vbH));
  bgBloom.setAttribute("fill", "url(#export-bg-bloom)");

  const bgGrid = document.createElementNS(ns, "rect");
  bgGrid.setAttribute("x", "0");
  bgGrid.setAttribute("y", "0");
  bgGrid.setAttribute("width", String(vbW));
  bgGrid.setAttribute("height", String(vbH));
  bgGrid.setAttribute("fill", "url(#export-bg-grid)");
  bgGrid.setAttribute("opacity", "0.45");

  const insertRef = defs.nextSibling;
  if (insertRef) {
    svg.insertBefore(bgGrid, insertRef);
    svg.insertBefore(bgBloom, insertRef);
    svg.insertBefore(bgBase, insertRef);
  } else {
    svg.appendChild(bgBase);
    svg.appendChild(bgBloom);
    svg.appendChild(bgGrid);
  }
}

function attachExportMetaOverlay(svg: SVGSVGElement, req: SimRequest, sim: SimResponse | null, vbW: number, vbH: number, view?: ExportViewState) {
  const ns = "http://www.w3.org/2000/svg";
  const g = document.createElementNS(ns, "g");

  const cardX = vbW * 0.02;
  const cardY = vbH * 0.02;
  const detailLines = splitMetaLinesForCard(compactMeta(req, sim, view), Math.max(84, Math.floor(vbW / 14))).slice(0, 2);
  const cardW = vbW * 0.96;
  const cardH = vbH * (detailLines.length > 1 ? 0.16 : 0.13);
  const r = Math.max(8, Math.round(vbW * 0.008));

  const bg = document.createElementNS(ns, "rect");
  bg.setAttribute("x", cardX.toFixed(2));
  bg.setAttribute("y", cardY.toFixed(2));
  bg.setAttribute("width", cardW.toFixed(2));
  bg.setAttribute("height", cardH.toFixed(2));
  bg.setAttribute("rx", String(r));
  bg.setAttribute("fill", "rgba(10,16,28,0.68)");
  bg.setAttribute("stroke", "rgba(228,238,255,0.24)");
  bg.setAttribute("stroke-width", "1");
  g.appendChild(bg);

  const title = document.createElementNS(ns, "text");
  title.setAttribute("x", (cardX + cardW * 0.03).toFixed(2));
  title.setAttribute("y", (cardY + cardH * 0.34).toFixed(2));
  title.setAttribute("fill", "rgba(236,244,255,0.96)");
  title.setAttribute("font-size", Math.max(12, vbW * 0.013).toFixed(2));
  title.setAttribute("font-weight", "620");
  title.textContent = `litopc Export · ${nowHuman()}`;
  g.appendChild(title);

  const sub = document.createElementNS(ns, "text");
  sub.setAttribute("x", (cardX + cardW * 0.03).toFixed(2));
  sub.setAttribute("y", (cardY + cardH * 0.62).toFixed(2));
  sub.setAttribute("fill", "rgba(206,222,248,0.92)");
  sub.setAttribute("font-size", Math.max(10, vbW * 0.0095).toFixed(2));
  sub.setAttribute("font-weight", "520");
  const lineGap = Math.max(12, vbH * 0.028);
  detailLines.forEach((line, i) => {
    const t = document.createElementNS(ns, "tspan");
    t.setAttribute("x", (cardX + cardW * 0.03).toFixed(2));
    t.setAttribute("dy", i === 0 ? "0" : String(lineGap));
    t.textContent = line;
    sub.appendChild(t);
  });
  g.appendChild(sub);
  if (req.plan === "FREE") {
    const wm = document.createElementNS(ns, "text");
    wm.setAttribute("x", (vbW * 0.985).toFixed(2));
    wm.setAttribute("y", (vbH * 0.035).toFixed(2));
    wm.setAttribute("fill", "rgba(255,255,255,0.82)");
    wm.setAttribute("font-size", Math.max(10, vbW * 0.009).toFixed(2));
    wm.setAttribute("font-weight", "600");
    wm.setAttribute("text-anchor", "end");
    wm.textContent = "litopc Free";
    g.appendChild(wm);
  }

  svg.appendChild(g);
}

function getSweepBounds(sweep: ExportSweepPayload) {
  const xs = sweep.series.flatMap((s) => s.points.map((p) => p.x));
  const ys = sweep.series.flatMap((s) => s.points.map((p) => p.y));
  if (!xs.length || !ys.length) return null;
  let minX = Math.min(...xs);
  let maxX = Math.max(...xs);
  let minY = Math.min(...ys);
  let maxY = Math.max(...ys);
  if (minX === maxX) {
    minX -= 0.5;
    maxX += 0.5;
  }
  if (minY === maxY) {
    minY -= 0.5;
    maxY += 0.5;
  }
  const padX = (maxX - minX) * 0.05;
  const padY = (maxY - minY) * 0.08;
  return { minX: minX - padX, maxX: maxX + padX, minY: minY - padY, maxY: maxY + padY };
}

function attachSweepSvgOverlay(svg: SVGSVGElement, vbW: number, vbH: number, sweep: ExportSweepPayload) {
  if (!sweep.series.length) return;
  const bounds = getSweepBounds(sweep);
  if (!bounds) return;

  const ns = "http://www.w3.org/2000/svg";
  const cardW = vbW * 0.34;
  const cardH = vbH * 0.24;
  const x = vbW - cardW - vbW * 0.02;
  const y = vbH - cardH - vbH * 0.02;

  const left = 34;
  const right = 12;
  const top = 24;
  const bottom = 26;
  const plotW = cardW - left - right;
  const plotH = cardH - top - bottom;
  const sx = (v: number) => x + left + ((v - bounds.minX) / Math.max(1e-9, bounds.maxX - bounds.minX)) * plotW;
  const sy = (v: number) => y + top + (1 - (v - bounds.minY) / Math.max(1e-9, bounds.maxY - bounds.minY)) * plotH;

  const g = document.createElementNS(ns, "g");

  const bg = document.createElementNS(ns, "rect");
  bg.setAttribute("x", x.toFixed(2));
  bg.setAttribute("y", y.toFixed(2));
  bg.setAttribute("width", cardW.toFixed(2));
  bg.setAttribute("height", cardH.toFixed(2));
  bg.setAttribute("rx", String(Math.max(8, cardW * 0.02)));
  bg.setAttribute("fill", "rgba(11,18,32,0.74)");
  bg.setAttribute("stroke", "rgba(224,236,255,0.22)");
  bg.setAttribute("stroke-width", "1");
  g.appendChild(bg);

  const title = document.createElementNS(ns, "text");
  title.setAttribute("x", (x + 12).toFixed(2));
  title.setAttribute("y", (y + 15).toFixed(2));
  title.setAttribute("fill", "rgba(236,244,255,0.94)");
  title.setAttribute("font-size", "10");
  title.setAttribute("font-weight", "620");
  title.textContent = sweep.title;
  g.appendChild(title);

  const axisX = document.createElementNS(ns, "line");
  axisX.setAttribute("x1", (x + left).toFixed(2));
  axisX.setAttribute("y1", (y + top + plotH).toFixed(2));
  axisX.setAttribute("x2", (x + left + plotW).toFixed(2));
  axisX.setAttribute("y2", (y + top + plotH).toFixed(2));
  axisX.setAttribute("stroke", "rgba(226,238,255,0.35)");
  axisX.setAttribute("stroke-width", "1");
  g.appendChild(axisX);

  const axisY = document.createElementNS(ns, "line");
  axisY.setAttribute("x1", (x + left).toFixed(2));
  axisY.setAttribute("y1", (y + top).toFixed(2));
  axisY.setAttribute("x2", (x + left).toFixed(2));
  axisY.setAttribute("y2", (y + top + plotH).toFixed(2));
  axisY.setAttribute("stroke", "rgba(226,238,255,0.35)");
  axisY.setAttribute("stroke-width", "1");
  g.appendChild(axisY);

  sweep.series.forEach((s) => {
    if (s.points.length < 2) return;
    const d = s.points
      .map((p, i) => `${i === 0 ? "M" : "L"} ${sx(p.x).toFixed(2)} ${sy(p.y).toFixed(2)}`)
      .join(" ");
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", d);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", s.color);
    path.setAttribute("stroke-width", "1.7");
    if (s.dashed) path.setAttribute("stroke-dasharray", "5 3");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    g.appendChild(path);
  });

  let lx = x + 12;
  const ly = y + cardH - 10;
  sweep.series.forEach((s) => {
    const sw = document.createElementNS(ns, "line");
    sw.setAttribute("x1", lx.toFixed(2));
    sw.setAttribute("y1", ly.toFixed(2));
    sw.setAttribute("x2", (lx + 10).toFixed(2));
    sw.setAttribute("y2", ly.toFixed(2));
    sw.setAttribute("stroke", s.color);
    sw.setAttribute("stroke-width", "2");
    if (s.dashed) sw.setAttribute("stroke-dasharray", "4 3");
    g.appendChild(sw);

    const label = document.createElementNS(ns, "text");
    label.setAttribute("x", (lx + 14).toFixed(2));
    label.setAttribute("y", (ly + 3).toFixed(2));
    label.setAttribute("fill", "rgba(225,237,255,0.9)");
    label.setAttribute("font-size", "9");
    label.textContent = s.label;
    g.appendChild(label);

    lx += 16 + Math.max(22, s.label.length * 4.8);
  });

  svg.appendChild(g);
}

function drawSweepOnCanvas(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  sweep: ExportSweepPayload
) {
  if (!sweep.series.length) return;
  const bounds = getSweepBounds(sweep);
  if (!bounds) return;

  const left = 36;
  const right = 10;
  const top = 22;
  const bottom = 26;
  const plotW = w - left - right;
  const plotH = h - top - bottom;

  const sx = (v: number) => x + left + ((v - bounds.minX) / Math.max(1e-9, bounds.maxX - bounds.minX)) * plotW;
  const sy = (v: number) => y + top + (1 - (v - bounds.minY) / Math.max(1e-9, bounds.maxY - bounds.minY)) * plotH;

  ctx.save();
  ctx.fillStyle = "rgba(8,14,24,0.68)";
  ctx.strokeStyle = "rgba(228,238,255,0.22)";
  ctx.lineWidth = 1;
  const r = 10;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = "rgba(226,238,255,0.35)";
  ctx.beginPath();
  ctx.moveTo(x + left, y + top + plotH);
  ctx.lineTo(x + left + plotW, y + top + plotH);
  ctx.moveTo(x + left, y + top);
  ctx.lineTo(x + left, y + top + plotH);
  ctx.stroke();

  sweep.series.forEach((s) => {
    if (s.points.length < 2) return;
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 1.8;
    ctx.setLineDash(s.dashed ? [5, 3] : []);
    ctx.beginPath();
    s.points.forEach((p, i) => {
      const px = sx(p.x);
      const py = sy(p.y);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
  });
  ctx.setLineDash([]);

  ctx.fillStyle = "rgba(236,244,255,0.94)";
  ctx.font = `600 ${Math.round(h * 0.09)}px ${EXPORT_FONT}`;
  ctx.fillText(sweep.title, x + 10, y + 14);

  let lx = x + 12;
  const ly = y + h - 11;
  sweep.series.forEach((s) => {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 2;
    ctx.setLineDash(s.dashed ? [4, 3] : []);
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.lineTo(lx + 10, ly);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(220,234,255,0.9)";
    ctx.font = `500 ${Math.round(h * 0.07)}px ${EXPORT_FONT}`;
    ctx.fillText(s.label, lx + 14, ly + 3);
    lx += 16 + Math.max(22, s.label.length * 5);
  });

  ctx.restore();
}
function prepareSvgForExport(
  svgEl: SVGSVGElement,
  req: SimRequest,
  sim: SimResponse | null,
  opts?: { includeMetaOverlay?: boolean; view?: ExportViewState; sweep?: ExportSweepPayload | null }
): { svg: SVGSVGElement; outW: number; outH: number } {
  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");

  const rect = svgEl.getBoundingClientRect();
  const cssW = Math.max(1, Math.round(rect.width));
  const cssH = Math.max(1, Math.round(rect.height));

  const vb = clone.viewBox.baseVal;
  const vbW = vb && vb.width > 0 ? vb.width : cssW;
  const vbH = vb && vb.height > 0 ? vb.height : cssH;
  clone.setAttribute("viewBox", `0 0 ${vbW} ${vbH}`);

  const outW = req.plan === "PRO"
    ? clamp(Math.round(cssW * 2.4), 1600, 4200)
    : clamp(Math.round(cssW * 1.35), 900, 1800);
  const outH = Math.round((outW * vbH) / Math.max(1, vbW));
  clone.setAttribute("width", String(outW));
  clone.setAttribute("height", String(outH));

  attachExportStyle(clone);
  const desc = document.createElementNS("http://www.w3.org/2000/svg", "desc");
  desc.textContent = `litopc Export | ${compactMeta(req, sim, opts?.view)}`;
  clone.insertBefore(desc, clone.firstChild);
  attachExportBackdrop(clone, vbW, vbH);
  if (opts?.includeMetaOverlay ?? true) {
    attachExportMetaOverlay(clone, req, sim, vbW, vbH, opts?.view);
  }
  if (opts?.sweep) {
    attachSweepSvgOverlay(clone, vbW, vbH, opts.sweep);
  }

  return { svg: clone, outW, outH };
}

function wrapTextByWidth(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const candidate = line ? `${line} ${w}` : w;
    if (ctx.measureText(candidate).width <= maxWidth) {
      line = candidate;
    } else {
      if (line) lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function buildExportBaseName(req: SimRequest): string {
  const mode = req.mask.mode === "CUSTOM" ? "CUSTOM" : req.mask.template_id ?? "TEMPLATE";
  return safeToken(`litopc_${req.preset_id}_${mode}_${req.plan}_${nowStamp()}`);
}

export function buildMetaLines(req: SimRequest, sim: SimResponse | null): string[] {
  return [
    `plan=${req.plan}`,
    `preset=${req.preset_id}`,
    `mask_mode=${req.mask.mode}`,
    `template=${req.mask.template_id ?? ""}`,
    `grid=${req.grid}`,
    `dose=${req.dose.toFixed(2)}`,
    `focus=${req.focus.toFixed(2)}`,
    `nm_per_pixel=${sim?.nm_per_pixel != null ? sim.nm_per_pixel.toFixed(3) : ""}`,
    `cd_nm=${sim?.metrics?.cd_nm != null ? sim.metrics.cd_nm.toFixed(2) : ""}`,
  ];
}

export function exportSvgWithMeta(svgEl: SVGSVGElement, req: SimRequest, sim: SimResponse | null, view?: ExportViewState, sweep?: ExportSweepPayload | null) {
  const { svg } = prepareSvgForExport(svgEl, req, sim, { includeMetaOverlay: true, view, sweep });
  const blob = serializeSvg(svg);
  downloadBlob(blob, `${buildExportBaseName(req)}.svg`);
}

export async function exportPngWithMeta(svgEl: SVGSVGElement, req: SimRequest, sim: SimResponse | null, view?: ExportViewState, sweep?: ExportSweepPayload | null) {
  const prepared = prepareSvgForExport(svgEl, req, sim, { includeMetaOverlay: false, view });
  const svgBlob = serializeSvg(prepared.svg);
  const src = await blobToDataUrl(svgBlob);
  const img = await imageFromSrc(src);

  const width = prepared.outW;
  const height = prepared.outH;
  const footerH = sweep ? clamp(Math.round(height * 0.26), 340, 620) : clamp(Math.round(height * 0.115), 120, 230);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height + footerH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, width, height);

  const grad = ctx.createLinearGradient(0, height, 0, height + footerH);
  grad.addColorStop(0, "rgba(8,14,24,0.92)");
  grad.addColorStop(1, "rgba(8,12,20,0.98)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, height, width, footerH);

  ctx.fillStyle = "rgba(236,244,255,0.96)";
  ctx.font = `600 ${Math.round(footerH * 0.24)}px ${EXPORT_FONT}`;
  ctx.textBaseline = "top";
  ctx.fillText("litopc Export", Math.round(width * 0.02), height + Math.round(footerH * 0.13));

  const detail = compactMeta(req, sim, view);
  ctx.fillStyle = "rgba(202,220,248,0.92)";
  ctx.font = `500 ${Math.round(footerH * 0.18)}px ${EXPORT_FONT}`;
  const lines = wrapTextByWidth(ctx, detail, Math.round(width * 0.95));
  const maxLines = sweep ? 1 : 2;
  for (let i = 0; i < Math.min(maxLines, lines.length); i++) {
    ctx.fillText(lines[i], Math.round(width * 0.02), height + Math.round(footerH * (0.44 + i * 0.25)));
  }

  if (sweep) {
    const chartX = Math.round(width * 0.02);
    const chartY = height + Math.round(footerH * 0.34);
    const chartW = Math.round(width * 0.96);
    const chartH = Math.round(footerH * 0.58);
    drawSweepOnCanvas(ctx, chartX, chartY, chartW, chartH, sweep);
  }

  if (req.plan === "FREE") {
    ctx.fillStyle = "rgba(255,255,255,0.86)";
    ctx.font = `600 ${Math.round(footerH * 0.18)}px ${EXPORT_FONT}`;
    const wm = "litopc Free";
    const wmW = ctx.measureText(wm).width;
    ctx.fillText(wm, width - wmW - Math.round(width * 0.02), height + Math.round(footerH * 0.13));
  }

  const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!out) return;
  downloadBlob(out, `${buildExportBaseName(req)}.png`);
}

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[\",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function exportRunsCsv(runs: RunRecord[]) {
  if (!runs.length) return;
  const header = [
    "id",
    "created_at",
    "label",
    "plan",
    "preset_id",
    "mask_mode",
    "template_id",
    "grid",
    "dose",
    "focus",
    "nm_per_pixel",
    "cd_nm",
    "epe_mean_nm",
    "epe_max_nm",
  ];
  const lines = [header.join(",")];
  for (const r of runs) {
    const row = [
      r.id,
      r.created_at,
      r.label,
      r.request.plan,
      r.request.preset_id,
      r.request.mask.mode,
      r.request.mask.template_id ?? "",
      r.request.grid,
      r.request.dose,
      r.request.focus,
      r.response.nm_per_pixel,
      r.response.metrics.cd_nm ?? "",
      r.response.metrics.epe_mean_nm ?? "",
      r.response.metrics.epe_max_nm ?? "",
    ];
    lines.push(row.map(csvCell).join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  downloadBlob(blob, `litopc_runs_${nowStamp()}.csv`);
}

export function exportSweepCsv(
  main: BatchSimResponse | null,
  compareA?: BatchSimResponse | null,
  compareB?: BatchSimResponse | null
) {
  if (!main || !main.points.length) return;
  const header = [
    "index",
    "param",
    "value",
    "main_cd_nm",
    "main_epe_mean_nm",
    "main_epe_max_nm",
    "a_cd_nm",
    "a_epe_mean_nm",
    "a_epe_max_nm",
    "b_cd_nm",
    "b_epe_mean_nm",
    "b_epe_max_nm",
  ];
  const lines = [header.join(",")];
  for (let i = 0; i < main.points.length; i++) {
    const m = main.points[i];
    const a = compareA?.points?.[i];
    const b = compareB?.points?.[i];
    const row = [
      i + 1,
      main.param,
      m.value,
      m.metrics.cd_nm ?? "",
      m.metrics.epe_mean_nm ?? "",
      m.metrics.epe_max_nm ?? "",
      a?.metrics.cd_nm ?? "",
      a?.metrics.epe_mean_nm ?? "",
      a?.metrics.epe_max_nm ?? "",
      b?.metrics.cd_nm ?? "",
      b?.metrics.epe_mean_nm ?? "",
      b?.metrics.epe_max_nm ?? "",
    ];
    lines.push(row.map(csvCell).join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  downloadBlob(blob, `litopc_sweep_${safeToken(main.param)}_${nowStamp()}.csv`);
}









