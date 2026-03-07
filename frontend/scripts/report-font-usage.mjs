#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DIST_DIR = process.env.NEXT_DIST_DIR || ".next";
const CSS_DIR = path.join(ROOT, DIST_DIR, "static", "css");
const PUBLIC_FONTS_DIR = path.join(ROOT, "public", "fonts");
const GLOBALS_CSS = path.join(ROOT, "app", "globals.css");
const LAYOUT_TSX = path.join(ROOT, "app", "layout.tsx");
const OUT_MD = path.join(ROOT, "..", "docs", "reports", "font-usage-report.md");

const FONT_EXT_RE = /\.(ttf|otf|woff2?|eot)$/i;
const LICENSE_FILE_RE = /(licen[sc]e|ofl|copyright|readme|fontlog|trademark|info)/i;
const GENERIC_FAMILY = new Set([
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-serif",
  "ui-sans-serif",
  "ui-monospace",
  "ui-rounded",
  "emoji",
  "math",
  "fangsong",
  "inherit",
  "initial",
  "unset",
]);

function fail(msg) {
  console.error(`[font-report] ${msg}`);
  process.exit(1);
}

function toPosix(p) {
  return p.split(path.sep).join("/");
}

function relPosix(base, p) {
  return toPosix(path.relative(base, p));
}

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    const entries = fs.readdirSync(cur, { withFileTypes: true });
    for (const entry of entries) {
      const abs = path.join(cur, entry.name);
      if (entry.isDirectory()) stack.push(abs);
      else out.push(abs);
    }
  }
  return out;
}

function normalizeFamilyToken(token) {
  const cleaned = token.trim().replace(/^['"]|['"]$/g, "");
  return cleaned;
}

function parseFontFamilyList(value) {
  return value
    .split(",")
    .map((t) => normalizeFamilyToken(t))
    .filter(Boolean);
}

function parseFontFaceBlocks(cssText) {
  const blocks = cssText.match(/@font-face\s*{[\s\S]*?}/gi) ?? [];
  const items = [];
  for (const block of blocks) {
    const famMatch = block.match(/font-family\s*:\s*([^;]+);/i);
    const srcMatches = [...block.matchAll(/url\(([^)]+)\)/gi)];
    if (!famMatch) continue;
    const family = normalizeFamilyToken(famMatch[1]);
    const urls = srcMatches.map((m) => normalizeFamilyToken(m[1]));
    items.push({ family, urls });
  }
  return items;
}

function parseFontFamilyUsage(cssText) {
  const noFace = cssText.replace(/@font-face\s*{[\s\S]*?}/gi, "");
  const matches = [...noFace.matchAll(/font-family\s*:\s*([^;{}]+);/gi)];
  const counts = new Map();
  for (const m of matches) {
    const list = parseFontFamilyList(m[1]);
    for (const family of list) {
      if (!family || family.startsWith("var(")) continue;
      const key = family.toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}

function parseGoogleFontsFromLayout(layoutText) {
  const importMatch = layoutText.match(/import\s*{\s*([^}]+)\s*}\s*from\s*["']next\/font\/google["']/);
  if (!importMatch) return [];
  return importMatch[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function collectPackageLicenseFiles(packageDir) {
  return walk(packageDir)
    .filter((p) => LICENSE_FILE_RE.test(path.basename(p)))
    .map((p) => relPosix(ROOT, p))
    .sort();
}

function readUtf8Safe(absPath) {
  try {
    return fs.readFileSync(absPath, "utf8");
  } catch {
    return "";
  }
}

function assessCommercialStatusFromLicenseText(text) {
  const t = (text ?? "").toLowerCase();
  if (!t.trim()) {
    return {
      commercialUse: "Unknown",
      status: "Review required",
      confidence: "Low",
      signal: "No readable license text",
    };
  }
  if (/personal use only|non-commercial use only|for personal use only/.test(t)) {
    return {
      commercialUse: "No",
      status: "Restricted",
      confidence: "High",
      signal: "Personal/non-commercial only wording found",
    };
  }
  if (/sil open font license|open font license|ofl-?1\.1/.test(t)) {
    return {
      commercialUse: "Yes (with OFL terms)",
      status: "Likely allowed",
      confidence: "Medium",
      signal: "SIL Open Font License marker detected",
    };
  }
  if (/ubuntu font licence|ubuntu font license/.test(t)) {
    return {
      commercialUse: "Yes (with Ubuntu terms)",
      status: "Likely allowed",
      confidence: "Medium",
      signal: "Ubuntu Font Licence marker detected",
    };
  }
  if (/apache license|mit license/.test(t)) {
    return {
      commercialUse: "Yes (with license terms)",
      status: "Likely allowed",
      confidence: "Medium",
      signal: "Permissive license marker detected",
    };
  }
  if (/free for commercial use/.test(t)) {
    return {
      commercialUse: "Likely yes",
      status: "Likely allowed",
      confidence: "Low",
      signal: "Commercial-use-friendly wording found",
    };
  }
  if (/freeware|100% free/.test(t) && /commercial license|complete family/.test(t)) {
    return {
      commercialUse: "Potentially restricted (variant-dependent)",
      status: "Review required",
      confidence: "Low",
      signal: "Mixed freeware/commercial-license wording found",
    };
  }
  if (/freeware|100% free/.test(t)) {
    return {
      commercialUse: "Likely yes",
      status: "Likely allowed",
      confidence: "Low",
      signal: "Freeware wording found",
    };
  }
  if (/commercial use/.test(t) && /contact|purchase|paid|license required|permission/.test(t)) {
    return {
      commercialUse: "Potentially restricted",
      status: "Review required",
      confidence: "Low",
      signal: "Commercial terms mention contact/purchase/permission",
    };
  }
  return {
    commercialUse: "Unknown",
    status: "Review required",
    confidence: "Low",
    signal: "No known license signature matched",
  };
}

if (!fs.existsSync(CSS_DIR)) {
  fail(`Build CSS folder not found: ${CSS_DIR}. Run \`npm run build\` (or set NEXT_DIST_DIR) first.`);
}

const cssFiles = walk(CSS_DIR).filter((p) => p.endsWith(".css")).sort();
if (cssFiles.length === 0) fail(`No CSS files found under ${CSS_DIR}`);

const cssTexts = cssFiles.map((p) => fs.readFileSync(p, "utf8"));
const combinedCss = cssTexts.join("\n");
const fontFaceBlocks = parseFontFaceBlocks(combinedCss);
const usageCounts = parseFontFamilyUsage(combinedCss);

const familyToUrls = new Map();
for (const item of fontFaceBlocks) {
  const key = item.family;
  const prev = familyToUrls.get(key) ?? new Set();
  for (const url of item.urls) prev.add(url);
  familyToUrls.set(key, prev);
}

const buildLocalFontUrls = new Set();
for (const [, urls] of familyToUrls) {
  for (const url of urls) {
    if (url.startsWith("/fonts/")) buildLocalFontUrls.add(url);
  }
}

const localFontFiles = walk(PUBLIC_FONTS_DIR).filter((p) => FONT_EXT_RE.test(path.basename(p))).sort();
const localUsed = [];
const localUnused = [];
for (const file of localFontFiles) {
  const rel = relPosix(PUBLIC_FONTS_DIR, file);
  const webPath = `/fonts/${rel}`;
  const packageName = rel.split("/")[0] ?? "unknown";
  const entry = { file: rel, webPath, packageName };
  if (buildLocalFontUrls.has(webPath)) localUsed.push(entry);
  else localUnused.push(entry);
}

const packageDirs = fs.existsSync(PUBLIC_FONTS_DIR)
  ? fs.readdirSync(PUBLIC_FONTS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()
  : [];
const packageLicenses = new Map();
for (const pkg of packageDirs) {
  packageLicenses.set(pkg, collectPackageLicenseFiles(path.join(PUBLIC_FONTS_DIR, pkg)));
}
const packageCommercialInfo = new Map();
for (const pkg of packageDirs) {
  const docs = packageLicenses.get(pkg) ?? [];
  const combined = docs
    .map((rel) => readUtf8Safe(path.join(ROOT, rel)))
    .join("\n\n");
  packageCommercialInfo.set(pkg, assessCommercialStatusFromLicenseText(combined));
}

const globalsCssText = fs.existsSync(GLOBALS_CSS) ? fs.readFileSync(GLOBALS_CSS, "utf8") : "";
const globalsFace = parseFontFaceBlocks(globalsCssText);
const globalsFaceFamilies = [...new Set(globalsFace.map((f) => f.family))];
const usageFamilySet = new Set([...usageCounts.keys()]);
const globalsFaceUsage = globalsFaceFamilies.map((family) => {
  const used = usageFamilySet.has(family.toLowerCase());
  return { family, used };
});

const layoutText = fs.existsSync(LAYOUT_TSX) ? fs.readFileSync(LAYOUT_TSX, "utf8") : "";
const googleFamilies = parseGoogleFontsFromLayout(layoutText);
const googleLicenseInfo = {
  Inter: {
    license: "SIL OFL 1.1",
    url: "https://raw.githubusercontent.com/google/fonts/main/ofl/inter/OFL.txt",
    commercialUse: "Yes (with OFL terms)",
    signal: "Google Fonts OFL",
  },
  Jost: {
    license: "SIL OFL 1.1",
    url: "https://raw.githubusercontent.com/google/fonts/main/ofl/jost/OFL.txt",
    commercialUse: "Yes (with OFL terms)",
    signal: "Google Fonts OFL",
  },
  Montserrat: {
    license: "SIL OFL 1.1",
    url: "https://raw.githubusercontent.com/google/fonts/main/ofl/montserrat/OFL.txt",
    commercialUse: "Yes (with OFL terms)",
    signal: "Google Fonts OFL",
  },
  Poppins: {
    license: "SIL OFL 1.1",
    url: "https://raw.githubusercontent.com/google/fonts/main/ofl/poppins/OFL.txt",
    commercialUse: "Yes (with OFL terms)",
    signal: "Google Fonts OFL",
  },
};
const usageTokens = [...usageCounts.keys()];
const googleFamilyUsage = googleFamilies.map((fam) => ({
  family: fam,
  inBuildCss: usageTokens.some((tok) => tok.includes(`__${fam.toLowerCase()}_`)),
}));

const nonGenericUsage = [...usageCounts.entries()]
  .filter(([family]) => !GENERIC_FAMILY.has(family))
  .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

const md = [];
md.push("# Font Usage Report (Build-Based)");
md.push("");
md.push(`Generated: ${new Date().toISOString()}`);
md.push(`Scanned Build CSS: ${cssFiles.length} file(s)`);
md.push("");
md.push("## 1) Build-Referenced @font-face Families");
md.push("");
md.push("| Family | Source URLs |");
md.push("|---|---|");
for (const [family, urls] of [...familyToUrls.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  md.push(`| ${family} | ${[...urls].sort().map((u) => `\`${u}\``).join("<br>")} |`);
}
if (familyToUrls.size === 0) md.push("| (none) | - |");
md.push("");
md.push("## 2) Local Font Files Usage (`public/fonts`)");
md.push("");
md.push(`Used in build CSS: **${localUsed.length}**`);
md.push("");
md.push("| Font File | Package | License Docs |");
md.push("|---|---|---|");
for (const item of localUsed) {
  const licenses = packageLicenses.get(item.packageName) ?? [];
  md.push(`| \`${item.file}\` | \`${item.packageName}\` | ${licenses.length ? licenses.map((p) => `\`${p}\``).join("<br>") : "-"} |`);
}
if (localUsed.length === 0) md.push("| (none) | - | - |");
md.push("");
md.push(`Unused in build CSS: **${localUnused.length}**`);
md.push("");
md.push("| Font File | Package | License Docs |");
md.push("|---|---|---|");
for (const item of localUnused) {
  const licenses = packageLicenses.get(item.packageName) ?? [];
  md.push(`| \`${item.file}\` | \`${item.packageName}\` | ${licenses.length ? licenses.map((p) => `\`${p}\``).join("<br>") : "-"} |`);
}
if (localUnused.length === 0) md.push("| (none) | - | - |");
md.push("");
md.push("## 3) Source @font-face Usage (`app/globals.css`)");
md.push("");
md.push("| Family | Referenced by `font-family` in build CSS |");
md.push("|---|---|");
for (const row of globalsFaceUsage) {
  md.push(`| ${row.family} | ${row.used ? "Yes" : "No"} |`);
}
if (globalsFaceUsage.length === 0) md.push("| (none) | - |");
md.push("");
md.push("## 4) `font-family` Tokens Seen in Build CSS (non-generic)");
md.push("");
md.push("| Family token | Occurrences |");
md.push("|---|---|");
for (const [family, count] of nonGenericUsage) {
  md.push(`| \`${family}\` | ${count} |`);
}
if (nonGenericUsage.length === 0) md.push("| (none) | 0 |");
md.push("");
md.push("## 5) `next/font/google` Families");
md.push("");
md.push("| Family | In Build CSS | License |");
md.push("|---|---|---|");
for (const fam of googleFamilies) {
  const meta = googleLicenseInfo[fam];
  const usage = googleFamilyUsage.find((g) => g.family === fam)?.inBuildCss ? "Yes" : "No";
  md.push(`| ${fam} | ${usage} | ${meta?.url ? `[${meta.license}](${meta.url})` : "Check upstream license"} |`);
}
if (googleFamilies.length === 0) md.push("| (none) | - | - |");
md.push("");
md.push("## 6) Commercial Use Assessment (Best-Effort)");
md.push("");
md.push("| Source | Font / Package | In Build CSS | License Signal | Commercial Use | Confidence | Evidence |");
md.push("|---|---|---|---|---|---|---|");
for (const item of localUsed) {
  const review = packageCommercialInfo.get(item.packageName) ?? {
    commercialUse: "Unknown",
    confidence: "Low",
    signal: "No package assessment",
  };
  const docs = packageLicenses.get(item.packageName) ?? [];
  md.push(
    `| local file | \`${item.file}\` | Yes | ${review.signal} | ${review.commercialUse} | ${review.confidence} | ${docs.length ? docs.map((p) => `\`${p}\``).join("<br>") : "-"} |`
  );
}
for (const row of googleFamilyUsage) {
  const meta = googleLicenseInfo[row.family];
  md.push(
    `| next/font/google | ${row.family} | ${row.inBuildCss ? "Yes" : "No"} | ${meta?.signal ?? "Unknown"} | ${meta?.commercialUse ?? "Unknown"} | ${meta ? "Medium" : "Low"} | ${meta?.url ? `[license](${meta.url})` : "-"} |`
  );
}
if (localUsed.length === 0 && googleFamilyUsage.length === 0) md.push("| (none) | - | - | - | - | - | - |");
md.push("");
md.push("## 7) Caveats");
md.push("");
md.push("- This report is build-artifact based. It shows fonts referenced by compiled CSS, not per-device final fallback resolution.");
md.push("- System fallback fonts (e.g., SF Pro, Segoe UI) depend on user OS and are not bundled assets.");
md.push("- Review local package license text for redistribution obligations (reserved names, attribution, trademark clauses).");
md.push("- This is an engineering best-effort report, not legal advice.");
md.push("");

fs.mkdirSync(path.dirname(OUT_MD), { recursive: true });
fs.writeFileSync(OUT_MD, md.join("\n"), "utf8");

console.log(`[font-report] Wrote ${path.relative(ROOT, OUT_MD)}`);
console.log(`[font-report] Used local font files: ${localUsed.length}, Unused: ${localUnused.length}`);
