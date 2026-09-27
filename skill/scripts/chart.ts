#!/usr/bin/env bun
// chart.ts: builds Quire charts (inline SVG inside <figure class="chart">) from a JSON spec.
//
//   bun chart.ts spec.json          # or:  bun chart.ts < spec.json
//   bun chart.ts --help             # usage and one example per type
//
// Prints the finished markup on stdout. Uses only the chart classes from templates/base.html
// (.grid .axis .s1-.s3 .l1-.l3 .area1 .marker .strong .legend .swatch .sparkline), sizes the
// label gutter from the longest label, keeps everything inside the viewBox, formats numbers
// with thousands separators, and makes the values available to screen readers through the
// SVG <title> and <desc>. Also importable: import { chart } from ".../chart.ts".

export type BarDatum = { label: string; value: number };
export type Series = { name?: string; values: number[] };
export type Marker = { at: number | string; label?: string };
export type Spec = {
  type: "hbar" | "bar" | "line" | "sparkline";
  title?: string;        // accessible name and default caption; say what the chart shows
  caption?: string;      // figcaption, HTML allowed; defaults to title
  figure?: number | string; // "Figure N." prefix for the caption
  id?: string;           // element id prefix; derived from the spec when omitted
  wide?: boolean;        // true when the figure has .wide (viewBox 920 instead of 600)
  unit?: string;         // "ms", "%", "GB": after the number, no space before "%"
  prefix?: string;       // "$", "EUR " : before the number
  decimals?: number;     // fixed decimals for values and ticks (default 0)
  max?: number;          // bar scale maximum (default: nice ceiling of the data)
  sort?: "asc" | "desc"; // hbar/bar: sort rows by value
  data?: BarDatum[];     // hbar, bar
  x?: string[];          // line, bar: one label per point; "" for a point without a tick label
  series?: Series[];     // line: one to three series
  yMax?: number;         // line/bar: axis maximum (default: nice ceiling)
  yStep?: number;        // line/bar: gridline step (default: nice step)
  marker?: Marker;       // line: dashed vertical line at an index or x label, optional text
  area?: boolean;        // line: fill under the first series
  legend?: boolean;      // line: show the legend (default: when a series has a name)
  values?: number[];     // sparkline
};

// ---------------------------------------------------------------------------
// Text measurement. Approximate advance widths (em) for the system sans stacks
// (SF Pro, Segoe UI, Roboto), padded so estimates err on the wide side.
// ---------------------------------------------------------------------------
const EM: Record<string, number> = {
  a: 0.55, b: 0.6, c: 0.52, d: 0.6, e: 0.55, f: 0.34, g: 0.6, h: 0.6, i: 0.26, j: 0.27, k: 0.54, l: 0.26, m: 0.9,
  n: 0.6, o: 0.58, p: 0.6, q: 0.6, r: 0.37, s: 0.5, t: 0.35, u: 0.6, v: 0.52, w: 0.78, x: 0.52, y: 0.52, z: 0.5,
  A: 0.68, B: 0.64, C: 0.7, D: 0.72, E: 0.6, F: 0.57, G: 0.74, H: 0.74, I: 0.28, J: 0.52, K: 0.64, L: 0.55, M: 0.88,
  N: 0.74, O: 0.78, P: 0.62, Q: 0.78, R: 0.64, S: 0.62, T: 0.6, U: 0.72, V: 0.67, W: 0.96, X: 0.66, Y: 0.62, Z: 0.62,
  "0": 0.6, "1": 0.6, "2": 0.6, "3": 0.6, "4": 0.6, "5": 0.6, "6": 0.6, "7": 0.6, "8": 0.6, "9": 0.6,
  " ": 0.3, ".": 0.28, ",": 0.28, ":": 0.28, ";": 0.28, "(": 0.34, ")": 0.34, "-": 0.36, "−": 0.6, "/": 0.36,
  "%": 0.82, "+": 0.6, "'": 0.22, '"': 0.4, "…": 0.9, "_": 0.5, "&": 0.7, "#": 0.6, "$": 0.6, "€": 0.6, "£": 0.6,
};
const SAFETY = 1.08;

export function textWidth(s: string, size = 13, weight = 400): number {
  let w = 0;
  for (const ch of s) w += EM[ch] ?? (ch.charCodeAt(0) > 0x2000 ? 1 : 0.62);
  return w * size * (weight >= 500 ? 1.05 : 1) * SAFETY;
}

/** Word-wrap a label into at most `maxLines` lines of `maxW` px; ellipsize the last line if it still does not fit. */
function fitLabel(label: string, maxW: number, size: number, weight: number, maxLines: number): { lines: string[]; truncated: boolean } {
  const words = label.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? cur + " " + w : w;
    if (textWidth(next, size, weight) <= maxW || !cur) cur = next;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  let truncated = false;
  if (lines.length > maxLines) {
    lines.splice(maxLines - 1, lines.length, lines.slice(maxLines - 1).join(" "));
  }
  const last = lines.length - 1;
  if (last >= 0 && textWidth(lines[last], size, weight) > maxW) {
    let t = lines[last];
    while (t.length > 1 && textWidth(t + "…", size, weight) > maxW) t = t.slice(0, -1);
    lines[last] = t.replace(/[\s,;:]+$/, "") + "…";
    truncated = true;
  }
  return { lines, truncated };
}

// ---------------------------------------------------------------------------
// Numbers and scales
// ---------------------------------------------------------------------------
function fmt(v: number, spec: Spec, decimals = spec.decimals ?? 0): string {
  const n = new Intl.NumberFormat("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(Math.abs(v));
  const unit = spec.unit ? (spec.unit === "%" ? "%" : " " + spec.unit) : "";
  return (v < 0 ? "−" : "") + (spec.prefix ?? "") + n + unit;
}

/** A tick step from {1, 2, 2.5, 5} x 10^k giving four or five gridlines, and the matching ceiling. */
export function niceScale(max: number, ticks = 4): { max: number; step: number } {
  if (!(max > 0)) return { max: 1, step: 0.25 };
  const rough = max / ticks;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((c) => c * pow).find((s) => max / s <= ticks + 0.5) ?? 10 * pow;
  return { step, max: Math.ceil(max / step - 1e-9) * step };
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const decimalsOf = (step: number) => Math.max(0, Math.min(3, -Math.floor(Math.log10(step) + 1e-9)));

function hashId(spec: Spec): string {
  const s = JSON.stringify(spec);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return "chart-" + h.toString(16).slice(0, 6);
}

function textEl(x: number, y: number, s: string, attrs = "", tooltip?: string): string {
  const t = tooltip ? `<title>${esc(tooltip)}</title>` : "";
  return `<text x="${r1(x)}" y="${r1(y)}"${attrs ? " " + attrs : ""}>${t}${esc(s)}</text>`;
}

// ---------------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------------
const FS = 13;       // label font size (--xs), in viewBox units = CSS px at 1:1
const LH = 16;       // line height for wrapped labels

function sortedData(spec: Spec): BarDatum[] {
  const data = (spec.data ?? []).map((d) => ({ label: String(d.label), value: Number(d.value) }));
  if (!data.length) throw new Error(`${spec.type}: "data" must be a non-empty array of { label, value }`);
  for (const d of data) if (!Number.isFinite(d.value) || d.value < 0) throw new Error(`${spec.type}: values must be numbers >= 0 ("${d.label}" is ${d.value})`);
  if (spec.sort === "desc") data.sort((a, b) => b.value - a.value);
  if (spec.sort === "asc") data.sort((a, b) => a.value - b.value);
  return data;
}

function hbar(spec: Spec, id: string): { svg: string; desc: string } {
  const data = sortedData(spec);
  const W = spec.wide ? 920 : 600;
  const barH = 16, gap = 10;
  const labelWeight = 500;
  const gutterMax = Math.floor(W * 0.45);
  const longest = Math.max(...data.map((d) => textWidth(d.label, FS, labelWeight)));
  const gutter = Math.max(60, Math.min(gutterMax, Math.ceil(longest) + 12));
  const labels = data.map((d) => fitLabel(d.label, gutter - 12, FS, labelWeight, 2));
  const valueStrs = data.map((d) => fmt(d.value, spec));
  const valueW = Math.ceil(Math.max(...valueStrs.map((s) => textWidth(s, FS)))) + 8;
  const barX = gutter + 10;
  const plotW = W - barX - valueW;
  const max = spec.max ?? niceScale(Math.max(...data.map((d) => d.value))).max;
  const rows = labels.map((l) => Math.max(barH, l.lines.length * LH));
  const H = rows.reduce((a, b) => a + b + gap, 0) - gap;

  const parts: string[] = [];
  let y = 0;
  data.forEach((d, i) => {
    const rowH = rows[i];
    const lines = labels[i].lines;
    const textTop = y + (rowH - lines.length * LH) / 2;
    const tspans = lines.map((ln, j) => `<tspan x="${gutter - 2}" y="${r1(textTop + j * LH + 12)}">${esc(ln)}</tspan>`).join("");
    const tip = labels[i].truncated || lines.length > 1 ? `<title>${esc(d.label)}</title>` : "";
    parts.push(`  <text class="strong" text-anchor="end">${tip}${tspans}</text>`);
    const len = r1((d.value / max) * plotW);
    const by = y + (rowH - barH) / 2;
    parts.push(`  <rect class="s1" x="${barX}" y="${r1(by)}" width="${len}" height="${barH}"/>`);
    parts.push("  " + textEl(barX + len + 6, by + barH - 4, valueStrs[i]));
    y += rowH + gap;
  });
  const desc = data.map((d, i) => `${d.label} ${valueStrs[i]}`).join("; ") + ".";
  const svg = `<svg viewBox="0 0 ${W} ${r1(H)}" role="img" aria-labelledby="${id}-t ${id}-d">\n  <title id="${id}-t">${esc(spec.title!)}</title>\n  <desc id="${id}-d">${esc(desc)}</desc>\n${parts.join("\n")}\n</svg>`;
  return { svg, desc };
}

function bar(spec: Spec, id: string): { svg: string; desc: string } {
  const data = sortedData(spec);
  const W = spec.wide ? 920 : 600, H = 240;
  const n = data.length;
  const scale = spec.yMax !== undefined && spec.yStep !== undefined ? { max: spec.yMax, step: spec.yStep } : niceScale(spec.yMax ?? Math.max(...data.map((d) => d.value)));
  if (spec.yMax !== undefined) scale.max = spec.yMax;
  const tickDec = spec.decimals ?? decimalsOf(scale.step);
  const ticks: number[] = [];
  for (let v = 0; v <= scale.max + 1e-9; v += scale.step) ticks.push(r1(v));
  const tickStrs = ticks.map((v) => fmt(v, spec, tickDec));
  const left = Math.ceil(Math.max(...tickStrs.map((s) => textWidth(s, FS)))) + 10;
  const right = 8;
  const plotW = W - left - right;
  const slot = plotW / n;
  const labelW = slot - 6;
  const labels = data.map((d) => fitLabel(d.label, labelW, FS, 400, 2));
  const labelLines = Math.max(...labels.map((l) => l.lines.length));
  const valueStrs = data.map((d) => fmt(d.value, spec));
  const showValues = n <= 16 && Math.max(...valueStrs.map((s) => textWidth(s, FS))) <= slot - 4;
  const top = showValues ? 18 : 8;
  const bottom = labelLines * LH + 10;
  const plotH = H - top - bottom;
  const y = (v: number) => r1(top + plotH - (v / scale.max) * plotH);
  const barW = Math.min(48, slot * 0.62);

  const parts: string[] = [];
  ticks.forEach((v, i) => {
    parts.push(`  <line class="${v === 0 ? "axis" : "grid"}" x1="${left}" x2="${W - right}" y1="${y(v)}" y2="${y(v)}"/>`);
    parts.push("  " + textEl(left - 6, y(v) + 4, tickStrs[i], 'text-anchor="end"'));
  });
  data.forEach((d, i) => {
    const cx = left + slot * (i + 0.5);
    const x0 = r1(cx - barW / 2);
    parts.push(`  <rect class="s1" x="${x0}" y="${y(d.value)}" width="${r1(barW)}" height="${r1(y(0) - y(d.value))}"/>`);
    if (showValues) parts.push("  " + textEl(cx, y(d.value) - 5, valueStrs[i], 'text-anchor="middle"'));
    const l = labels[i];
    const tip = l.truncated || l.lines.length > 1 ? `<title>${esc(d.label)}</title>` : "";
    const tspans = l.lines.map((ln, j) => `<tspan x="${r1(cx)}" y="${r1(top + plotH + 14 + j * LH)}">${esc(ln)}</tspan>`).join("");
    parts.push(`  <text text-anchor="middle">${tip}${tspans}</text>`);
  });
  const desc = data.map((d, i) => `${d.label} ${valueStrs[i]}`).join("; ") + ".";
  const svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="${id}-t ${id}-d">\n  <title id="${id}-t">${esc(spec.title!)}</title>\n  <desc id="${id}-d">${esc(desc)}</desc>\n${parts.join("\n")}\n</svg>`;
  return { svg, desc };
}

function line(spec: Spec, id: string): { svg: string; desc: string; legend: string } {
  const series = (spec.series ?? []).map((s) => ({ name: s.name, values: s.values.map(Number) }));
  if (!series.length || series.length > 3) throw new Error('line: "series" must hold one to three { name, values }');
  const n = series[0].values.length;
  if (n < 2) throw new Error("line: each series needs at least two values");
  for (const s of series) {
    if (s.values.length !== n) throw new Error("line: all series must have the same number of values");
    if (s.values.some((v) => !Number.isFinite(v) || v < 0)) throw new Error("line: values must be numbers >= 0");
  }
  const x = spec.x ?? [];
  if (x.length !== n) throw new Error(`line: "x" must hold one label per point (${n}); use "" for points without a tick label`);
  const W = spec.wide ? 920 : 600, H = 220;
  const dataMax = Math.max(...series.flatMap((s) => s.values));
  const scale = spec.yMax !== undefined && spec.yStep !== undefined ? { max: spec.yMax, step: spec.yStep } : niceScale(spec.yMax ?? dataMax);
  if (spec.yMax !== undefined) scale.max = spec.yMax;
  const tickDec = spec.decimals ?? decimalsOf(scale.step);
  const ticks: number[] = [];
  for (let v = 0; v <= scale.max + 1e-9; v += scale.step) ticks.push(r1(v));
  const tickStrs = ticks.map((v) => fmt(v, spec, tickDec));
  const left = Math.ceil(Math.max(...tickStrs.map((s) => textWidth(s, FS)))) + 10;
  const lastLabel = [...x].reverse().find((l) => l) ?? "";
  const right = Math.max(12, Math.ceil(textWidth(lastLabel, FS) / 2) + 4);
  const markerIdx = spec.marker === undefined ? -1 : typeof spec.marker.at === "number" ? spec.marker.at : x.indexOf(String(spec.marker.at));
  if (spec.marker && (markerIdx < 0 || markerIdx >= n)) throw new Error(`line: marker.at "${spec.marker.at}" is not an index or x label`);
  const top = spec.marker?.label ? 26 : 12;
  const bottom = 28;
  const plotW = W - left - right, plotH = H - top - bottom;
  const px = (i: number) => r1(left + (i / (n - 1)) * plotW);
  const py = (v: number) => r1(top + plotH - (v / scale.max) * plotH);

  const parts: string[] = [];
  ticks.forEach((v, i) => {
    parts.push(`  <line class="${v === 0 ? "axis" : "grid"}" x1="${left}" x2="${W - right}" y1="${py(v)}" y2="${py(v)}"/>`);
    parts.push("  " + textEl(left - 6, py(v) + 4, tickStrs[i], 'text-anchor="end"'));
  });
  // x labels, thinned so they never overlap
  let lastRight = -Infinity;
  const kept: number[] = [];
  x.forEach((lab, i) => {
    if (!lab) return;
    const w = textWidth(lab, FS);
    if (px(i) - w / 2 >= lastRight + 8) { kept.push(i); lastRight = px(i) + w / 2; }
  });
  const lastIdx = x.length - 1;
  if (x[lastIdx] && !kept.includes(lastIdx) && kept.length > 1) {
    const prev = kept[kept.length - 1];
    const wPrev = textWidth(x[prev], FS), wLast = textWidth(x[lastIdx], FS);
    if (px(lastIdx) - wLast / 2 < px(prev) + wPrev / 2 + 8) kept.pop();
    kept.push(lastIdx);
  }
  kept.forEach((i) => parts.push("  " + textEl(px(i), H - 8, x[i], 'text-anchor="middle"')));
  if (markerIdx >= 0) {
    parts.push(`  <line class="marker" x1="${px(markerIdx)}" x2="${px(markerIdx)}" y1="${top}" y2="${top + plotH}"/>`);
    if (spec.marker?.label) {
      const w = textWidth(spec.marker.label, FS);
      const cx = Math.min(Math.max(px(markerIdx), left + w / 2), W - right - w / 2);
      parts.push("  " + textEl(cx, top - 8, spec.marker.label, 'text-anchor="middle"'));
    }
  }
  series.forEach((s, si) => {
    const d = s.values.map((v, i) => `${i ? "L" : "M"}${px(i)} ${py(v)}`).join(" ");
    if (spec.area && si === 0) parts.push(`  <path class="area1" d="${d} L${px(n - 1)} ${py(0)} L${px(0)} ${py(0)} Z"/>`);
    parts.push(`  <path class="l${si + 1}" d="${d}"/>`);
  });
  const first = x.find((l) => l) ?? "start", last = lastLabel || "end";
  const desc = series.map((s, si) => {
    const peak = Math.max(...s.values), peakAt = x[s.values.indexOf(peak)] || `point ${s.values.indexOf(peak) + 1}`;
    return `${s.name ?? `Series ${si + 1}`}: ${fmt(s.values[0], spec)} at ${first}, peak ${fmt(peak, spec)} at ${peakAt}, ${fmt(s.values[n - 1], spec)} at ${last}`;
  }).join(". ") + (markerIdx >= 0 ? `. Marker${spec.marker?.label ? ` "${spec.marker.label}"` : ""} at ${x[markerIdx] || `point ${markerIdx + 1}`}` : "") + ".";
  const showLegend = spec.legend ?? series.some((s) => s.name);
  const legend = showLegend
    ? `<div class="legend">${series.map((s, i) => `<span><i class="swatch${i ? ` s${i + 1}` : ""}"></i>${esc(s.name ?? `Series ${i + 1}`)}</span>`).join("")}</div>`
    : "";
  const svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="${id}-t ${id}-d">\n  <title id="${id}-t">${esc(spec.title!)}</title>\n  <desc id="${id}-d">${esc(desc)}</desc>\n${parts.join("\n")}\n</svg>`;
  return { svg, desc, legend };
}

export function sparkline(values: number[]): string {
  const v = values.map(Number);
  if (v.length < 2 || v.some((x) => !Number.isFinite(x))) throw new Error("sparkline: needs at least two numeric values");
  const w = 100, h = 20, max = Math.max(...v), min = Math.min(...v);
  const d = v.map((val, i) => `${i ? "L" : "M"}${r1((i / (v.length - 1)) * w)} ${r1(h - 2 - ((val - min) / (max - min || 1)) * (h - 4))}`).join(" ");
  return `<svg class="sparkline" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><path vector-effect="non-scaling-stroke" d="${d}"/></svg>`;
}

/** Build the markup for one spec: a <figure class="chart"> for hbar/bar/line, a bare <svg> for sparkline. */
export function chart(spec: Spec): string {
  if (!spec || typeof spec !== "object") throw new Error("spec must be a JSON object");
  if (spec.type === "sparkline") return sparkline(spec.values ?? []);
  if (!["hbar", "bar", "line"].includes(spec.type)) throw new Error(`unknown type "${spec.type}": use hbar, bar, line or sparkline`);
  if (!spec.title) throw new Error(`${spec.type}: "title" is required (the accessible name; say what the chart shows)`);
  const id = spec.id ?? hashId(spec);
  const built = spec.type === "hbar" ? hbar(spec, id) : spec.type === "bar" ? bar(spec, id) : line(spec, id);
  const legend = "legend" in built && built.legend ? "  " + built.legend + "\n" : "";
  const cap = spec.caption ?? esc(spec.title);
  const fig = spec.figure !== undefined && spec.figure !== "" ? `<b>Figure ${spec.figure}.</b> ` : "";
  const svg = built.svg.split("\n").map((l) => "  " + l).join("\n");
  return `<figure class="chart${spec.wide ? " wide" : ""}" id="${id}">\n${legend}${svg}\n  <figcaption>${fig}${cap}</figcaption>\n</figure>`;
}

const HELP = `usage: bun chart.ts spec.json        (or JSON on stdin; a JSON array builds several)
       bun chart.ts --help

Prints a <figure class="chart"> (or a bare <svg class="sparkline">) built from Quire's
chart classes. Paste the output into the page as is. Add "wide": true when the figure
should span the wide column. See design/DESIGN.md, "Charts", for the conventions.

Common fields: type, title (required, the accessible name), caption (HTML, defaults to
title), figure (number for "Figure N."), wide, unit, prefix, decimals, id.

hbar  (categories, long labels welcome; the label gutter is measured, labels wrap to two
       lines and are ellipsized with a tooltip beyond that)
  {"type":"hbar","title":"Where teams host internal pages","unit":"%","sort":"desc",
   "data":[{"label":"GitHub Pages","value":52},{"label":"Cloudflare (Pages, Workers, Drop, R2)","value":41}]}

bar   (columns; short labels such as months or years)
  {"type":"bar","title":"Pages published per month","figure":2,
   "data":[{"label":"Apr","value":12},{"label":"May","value":19},{"label":"Jun","value":31}]}

line  (one to three series over the same x labels; "" hides a tick label)
  {"type":"line","title":"Error rate around the deploy","unit":"%","wide":true,"area":true,
   "x":["13:30","","14:00","","14:30"],"marker":{"at":"14:00","label":"deploy"},
   "series":[{"name":"5xx rate","values":[0,1,38,63,20]},{"name":"Connections","values":[30,40,100,100,70]}]}

sparkline  (for a table cell; no axes, values stay in the table)
  {"type":"sparkline","values":[30,32,31,45,60,58,41]}
`;

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write(HELP);
    process.exit(0);
  }
  const file = args.find((a) => !a.startsWith("-"));
  const raw = file ? await Bun.file(file).text() : await Bun.stdin.text();
  let spec: Spec | Spec[];
  try {
    spec = JSON.parse(raw);
  } catch (e) {
    process.stderr.write(`chart: invalid JSON: ${(e as Error).message}\n`);
    process.exit(1);
  }
  try {
    const specs = Array.isArray(spec) ? spec : [spec];
    process.stdout.write(specs.map(chart).join("\n\n") + "\n");
  } catch (e) {
    process.stderr.write(`chart: ${(e as Error).message}\n`);
    process.exit(1);
  }
}
