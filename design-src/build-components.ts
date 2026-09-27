// Builds skill/templates/components.html from base.html's stylesheet plus a list of component snippets.
// Run from the repo root: bun design-src/build-components.ts
import { readFileSync, writeFileSync } from "node:fs";
import { chart, sparkline } from "../skill/scripts/chart.ts";

const BASE = `${import.meta.dir}/../skill/templates/base.html`;
const OUT = `${import.meta.dir}/../skill/templates/components.html`;

const base = readFileSync(BASE, "utf8");
const style = base.match(/<style>[\s\S]*?<\/style>/)![0];
const script = base.match(/<script>[\s\S]*?<\/script>/)![0];

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const dedent = (s: string) => {
  const lines = s.replace(/^\n/, "").replace(/\n\s*$/, "").split("\n");
  const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => l.match(/^\s*/)![0].length));
  return lines.map((l) => l.slice(indent)).join("\n");
};

// ---------- chart helpers (the generated SVG is static in the output) ----------
const r1 = (n: number) => Math.round(n * 10) / 10;


// tiny placeholder images as data URIs (an SVG rectangle with a label)
function placeholder(w: number, h: number, label: string) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'><rect width='${w}' height='${h}' fill='%23dcdcd8'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-family='system-ui,sans-serif' font-size='16' fill='%236b6d76'>${label}</text></svg>`;
  return `data:image/svg+xml;utf8,${svg.replace(/#/g, "%23")}`;
}

// ---------- components ----------
type Section = { id: string; title: string; intro?: string; html: string; note?: string; showMarkup?: boolean };
const sections: Section[] = [];
const add = (s: Section) => sections.push({ ...s, html: dedent(s.html) });

add({
  id: "header",
  title: "Page header",
  intro: `Every manifest opens the same way: a title, one sentence that states the conclusion or the contents, and a meta line with the date and author. An optional status badge goes at the end of the meta line, never above the title. The header of this page is the live example; the markup is below.`,
  html: `
    <header class="doc-header">
      <h1>Ingest API outage on 12 September</h1>
      <p class="summary">A worker-count change exhausted the Postgres connection pool; 41 minutes of 502s, no data loss.</p>
      <p class="meta">
        <time datetime="2026-09-14">14 September 2026</time>
        <span>Laurent Gonzalez</span>
        <span class="badge badge-ok">Resolved</span>
      </p>
    </header>`,
  showMarkup: true,
});

add({
  id: "text",
  title: "Headings and body text",
  intro: `Sections use h2, subsections h3. Reach for h4 rarely. Headings are sentence case and short. Body text is a serif at the measure; do not widen it.`,
  html: `
    <h3>A subsection heading</h3>
    <p>Body text is set in a serif at about 75 characters per line. Paragraphs are separated by space, not indented. Use <strong>bold</strong> for the one phrase a skimming reader must not miss, <em>italics</em> for titles and emphasis, and <code>inline code</code> for identifiers, paths and commands. Press <kbd>Cmd</kbd> <kbd>K</kbd> to search. The <abbr title="Content Security Policy">CSP</abbr> blocks external requests.</p>
    <h4>A rare fourth level</h4>
    <p>Keep h4 for long reference documents. If you need it in a short page, the structure is probably wrong.</p>
    <ul>
      <li>Unordered lists for items with no sequence.</li>
      <li>Keep each item to one or two lines. Longer items want to be paragraphs.
        <ul><li>Nest one level at most.</li></ul>
      </li>
    </ul>
    <ol>
      <li>Ordered lists only when order matters.</li>
      <li>For processes and timelines, use the steps or timeline components instead.</li>
    </ol>
    <blockquote>
      <p>Quotations from a source, a ticket or a person. Attribute them in the paragraph that follows.</p>
    </blockquote>`,
});

add({
  id: "links",
  title: "Links",
  intro: `Inline links are teal and underlined, the only decorated text in a paragraph. Standalone links get an arrow and are for "where next" at the end of a section; keep them to a handful per page. External links can carry the outward arrow when it helps the reader know they are leaving.`,
  html: `
    <p>The retry change shipped in <a href="https://example.com/pr/4821">PR 4821</a> and the runbook lives in <a class="ext" href="https://example.com/runbooks/ingest">the ops wiki</a>.</p>
    <p><a class="link-more" href="#tables">See the full table</a></p>`,
});

add({
  id: "tables",
  title: "Tables",
  intro: `Tables are sans, one size smaller than body text, with hairlines between rows and no zebra striping. Wrap every table in <code>&lt;div class="table-wrap"&gt;</code> so it scrolls sideways on a phone instead of widening the page. Numeric columns carry <code>class="num"</code> on both the header and the cells: right-aligned, tabular figures, same number of decimals down the column. Units go in the header, not in every cell. Put the caption above the table and say what the numbers are and when they were taken.`,
  html: `
    <div class="table-wrap">
    <table>
      <caption>Connection use by service, 12 September 2026, 14:00 to 15:00 UTC <span class="muted">(sampled every minute)</span></caption>
      <thead>
        <tr>
          <th>Service</th>
          <th>Pool</th>
          <th class="num">Workers</th>
          <th class="num">Peak connections</th>
          <th class="num">Share (%)</th>
          <th class="num">Change</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>ingest-api</td>
          <td>primary</td>
          <td class="num">24</td>
          <td class="num">72</td>
          <td class="num">72.0</td>
          <td class="num delta-bad">+48</td>
        </tr>
        <tr class="highlight">
          <td>sync-worker</td>
          <td>primary</td>
          <td class="num">8</td>
          <td class="num">16</td>
          <td class="num">16.0</td>
          <td class="num">0</td>
        </tr>
        <tr>
          <td>reporting</td>
          <td>replica</td>
          <td class="num">4</td>
          <td class="num">8</td>
          <td class="num">8.0</td>
          <td class="num delta-good">&minus;2</td>
        </tr>
        <tr class="dim">
          <td>admin</td>
          <td>primary</td>
          <td class="num">2</td>
          <td class="num">4</td>
          <td class="num">4.0</td>
          <td class="num">0</td>
        </tr>
        <tr class="total">
          <th scope="row">Total</th>
          <td></td>
          <td class="num">38</td>
          <td class="num">100</td>
          <td class="num">100.0</td>
          <td class="num">+46</td>
        </tr>
      </tbody>
    </table>
    </div>
    <p class="table-note">Peak is the highest one-minute sample. Change is against the previous deploy.</p>`,
  note: `Row emphasis: <code>tr.total</code> for a totals row (bold, rule above), <code>tr.highlight</code> for the one row the text is about, <code>tr.dim</code> for rows the reader can skip. Delta colors <code>.delta-good</code> and <code>.delta-bad</code> mean better and worse, not up and down. Use a real minus sign (<code>&amp;minus;</code>).`,
});

add({
  id: "tables-variants",
  title: "Table variants",
  intro: `Add <code>.wide</code> on the <code>.table-wrap</code> when the table has more than four or five columns. <code>.table-compact</code> tightens padding for long reference tables. <code>.table-sticky</code> keeps the header visible while scrolling a long table; on screens wider than a phone the wrapper stops scrolling so the header can stick, so keep the columns within the wide width. <code>.sortable</code> makes headers clickable when JS is on. Add <code>.nowrap</code> to a cell whose text must not break (identifiers, dates).`,
  html: `
    <div class="table-wrap wide">
      <table class="table-compact table-sticky sortable" id="endpoints">
        <caption>Endpoint latency, last 7 days</caption>
        <thead>
          <tr>
            <th>Endpoint</th>
            <th>Owner</th>
            <th class="num">Requests</th>
            <th class="num">p50 (ms)</th>
            <th class="num">p95 (ms)</th>
            <th class="num">Errors (%)</th>
            <th>Trend</th>
          </tr>
        </thead>
        <tbody>
          <tr><td><code>POST /transactions</code></td><td>ingest</td><td class="num">1,204,311</td><td class="num">84</td><td class="num">420</td><td class="num">0.31</td><td>${sparkline([30, 32, 31, 45, 60, 58, 41])}</td></tr>
          <tr><td><code>GET /balances</code></td><td>ledger</td><td class="num">842,020</td><td class="num">61</td><td class="num">310</td><td class="num">0.08</td><td>${sparkline([20, 22, 21, 23, 22, 24, 23])}</td></tr>
          <tr><td><code>POST /sync</code></td><td>ingest</td><td class="num">96,400</td><td class="num">140</td><td class="num">275</td><td class="num">1.20</td><td>${sparkline([10, 14, 12, 30, 28, 16, 12])}</td></tr>
          <tr><td><code>POST /auth/token</code></td><td>platform</td><td class="num">402,118</td><td class="num">22</td><td class="num">120</td><td class="num">0.02</td><td>${sparkline([5, 5, 6, 5, 5, 6, 5])}</td></tr>
          <tr><td><code>GET /health</code></td><td>platform</td><td class="num">2,600,000</td><td class="num">3</td><td class="num">40</td><td class="num">0.00</td><td>${sparkline([1, 1, 1, 1, 1, 1, 1])}</td></tr>
          <tr class="empty"><td class="empty" colspan="7">No endpoints match.</td></tr>
        </tbody>
      </table>
    </div>
    <p class="table-note">A note under a wide table spans the same width, so it lines up with the table's left edge.</p>`,
  note: `An empty state is a single <code>td.empty</code> spanning all columns, with a sentence that says why it is empty and what would fill it. The <code>tr.empty</code> row above is hidden by JS until a filter matches nothing; without JS you would include it only when the table really is empty.`,
});

add({
  id: "stats",
  title: "Key figures",
  intro: `A row of three to five figures the reader should carry away. Each has a rule above, the number, and a label that says what the number is (with unit and period). Optional note underneath for a comparison. Use <code>.wide</code> for five figures.`,
  html: `
    <div class="stats">
      <div class="stat">
        <span class="stat-value">41<small>min</small></span>
        <span class="stat-label">Duration of the outage</span>
      </div>
      <div class="stat">
        <span class="stat-value">18,400</span>
        <span class="stat-label">Requests failed</span>
        <span class="stat-note muted">0.6% of the day</span>
      </div>
      <div class="stat">
        <span class="stat-value">63%</span>
        <span class="stat-label">Peak error rate</span>
        <span class="stat-note delta-bad">from 0.3% baseline</span>
      </div>
      <div class="stat">
        <span class="stat-value">14<small>min</small></span>
        <span class="stat-label">Time to first alert</span>
      </div>
    </div>`,
});

add({
  id: "callouts",
  title: "Callouts",
  intro: `Three kinds, all on the same neutral surface with a colored rule on the left. Plain <code>.note</code> for an aside; <code>.note-info</code> for context the reader needs before going on; <code>.note-warn</code> for a caveat, a risk or a known limitation; <code>.note-decision</code> for what was decided and who decided it. One or two per page. If everything is a callout, nothing is.`,
  html: `
    <div class="note">
      <p class="note-title">Note</p>
      <p>Numbers in this page come from the Grafana dashboard on 14 September; the retention window is 30 days.</p>
    </div>
    <div class="note note-info">
      <p class="note-title">How the pool is sized</p>
      <p>Each worker holds one connection for the life of a request. With 24 workers per pod and 3 pods, ingest-api alone can take 72 of the 100 connections Postgres allows.</p>
    </div>
    <div class="note note-warn">
      <p class="note-title">The alert fired late</p>
      <p>The 5xx alert has a 10-minute window, so the page went out 14 minutes after the first failed request. This is fixed in the follow-ups but was true during the incident.</p>
    </div>
    <div class="note note-decision">
      <p class="note-title">Decision</p>
      <p>Put PgBouncer in transaction mode in front of the primary and cap ingest-api at 8 workers per pod. Owner: Laurent. Due: 26 September.</p>
    </div>`,
});

add({
  id: "badges",
  title: "Badges and status",
  intro: `Small sans labels for state. The neutral badge is the default; the colored ones only when the color means something (green is good, amber needs attention, red is broken, teal is "active" or "current"). Never more than one badge per row or per heading.`,
  html: `
    <p>
      <span class="badge">Draft</span>
      <span class="badge badge-ok">Resolved</span>
      <span class="badge badge-warn">Degraded</span>
      <span class="badge badge-bad">Failing</span>
      <span class="badge badge-accent">Current</span>
    </p>`,
});

add({
  id: "code",
  title: "Code",
  intro: `Inline code for identifiers. Blocks for commands, config and logs, with a short sentence before them saying what the reader is looking at. Blocks scroll sideways rather than wrapping. No syntax highlighting: it would need colors outside the tokens, and it is not what the reader is here for.`,
  html: `
    <p>The pool size comes from <code>DB_POOL_MAX</code>, read once at startup:</p>
    <pre><code>$ kubectl get deploy ingest-api -o jsonpath='{.spec.template.spec.containers[0].env}'
[{"name":"WORKERS","value":"24"},{"name":"DB_POOL_MAX","value":"1"}]

2026-09-12T14:07:41Z  ERROR  pool exhausted: 100/100 connections in use, waited 5000ms
2026-09-12T14:07:41Z  WARN   returning 502 for POST /transactions (req_3f9a...)</code></pre>`,
});

add({
  id: "figures",
  title: "Images and figures",
  intro: `Images are <code>data:</code> URIs (compressed; a screenshot should be under 150 KB). Every figure has a caption that says what is shown and, where it matters, when. Add <code>.framed</code> to screenshots so their white edges do not dissolve into the page. Use <code>.wide</code> for images that need the room, <code>.figure-inline</code> for a small illustrative one, and <code>.figure-pair</code> for a before/after.`,
  html: `
    <figure class="wide">
      <img class="framed" src="${placeholder(1200, 420, "Full-width figure (wide)")}" alt="Grafana panel showing 5xx rate rising to 63% at 14:07 and recovering at 14:48" width="1200" height="420">
      <figcaption><b>Figure 1.</b> 5xx rate for ingest-api, 12 September 2026, 13:30 to 15:30 UTC. The dashed line is the deploy.</figcaption>
    </figure>
    <figure class="figure-inline">
      <img src="${placeholder(480, 300, "Inline figure")}" alt="Diagram of three pods sharing one Postgres primary" width="480" height="300">
      <figcaption>Three pods, one primary, one pool limit.</figcaption>
    </figure>
    <div class="figure-pair wide">
      <figure>
        <img class="framed" src="${placeholder(600, 340, "Before")}" alt="Connection graph before the change, flat at 30" width="600" height="340">
        <figcaption>Before: 30 connections at peak.</figcaption>
      </figure>
      <figure>
        <img class="framed" src="${placeholder(600, 340, "After")}" alt="Connection graph after the change, pinned at 100" width="600" height="340">
        <figcaption>After: pinned at the 100-connection limit.</figcaption>
      </figure>
    </div>`,
});

add({
  id: "charts",
  title: "Charts",
  intro: `Charts are inline SVG built from the chart tokens, inside a <code>figure.chart</code> with a caption. Rules: one message per chart, stated in the caption. Horizontal bars for comparing categories (labels read naturally). Lines for change over time, with at most three series, a light grid, and the y-axis starting at zero. Label values directly where you can instead of adding a legend. Sparklines in tables show shape only, no axes. No 3D, no gradients, no pie charts.`,
  html: `
    ${chart({
      type: "hbar",
      figure: 2,
      unit: "ms",
      title: "p95 latency by endpoint, last 7 days",
      caption: "p95 latency by endpoint, last 7 days. Transactions is 35% slower than the next endpoint.",
      data: [
        { label: "POST /transactions", value: 420 },
        { label: "GET /balances", value: 310 },
        { label: "POST /sync", value: 275 },
        { label: "POST /auth/token", value: 120 },
        { label: "GET /health", value: 40 },
      ],
    })}
    ${chart({
      type: "line",
      wide: true,
      figure: 3,
      unit: "%",
      yMax: 100,
      yStep: 25,
      area: true,
      title: "Error rate and connection use, 13:30 to 15:30 UTC",
      caption: "Error rate and connection use, 12 September 2026, 13:30 to 15:30 UTC. Connections is shown as percent of the 100 limit. The dashed line marks the deploy at 14:00.",
      x: ["13:30", "", "", "", "14:00", "", "", "", "14:30", "", "", "", "15:00", "", "", "15:30"],
      marker: { at: "14:00" },
      series: [
        { name: "5xx rate", values: [0, 0, 0, 1, 2, 38, 61, 63, 60, 59, 20, 2, 0, 0, 0, 0] },
        { name: "Connections in use", values: [30, 31, 30, 32, 40, 96, 100, 100, 100, 100, 100, 70, 34, 31, 30, 30] },
      ],
    })}`,
  note: `Building one: never hand-compute coordinates. Write a JSON spec and run <code>bun SKILL_DIR/scripts/chart.ts spec.json</code>; it prints the whole <code>figure.chart</code> (legend, SVG, caption) ready to paste. Types: <code>hbar</code>, <code>bar</code>, <code>line</code>, <code>sparkline</code>; <code>bun SKILL_DIR/scripts/chart.ts --help</code> shows a spec for each. It measures the label gutter from the longest label, wraps long labels, keeps text inside the <code>viewBox</code>, formats numbers, and names the chart for screen readers with <code>&lt;title&gt;</code> and <code>&lt;desc&gt;</code> listing the values. Both charts above come from it. Dark mode works automatically because every color is a CSS variable.`,
});

add({
  id: "kv",
  title: "Key-value metadata",
  intro: `A definition list for facts about the thing the page is about: environment, versions, owners, ticket numbers. Labels left in small sans, values right in body text. It stacks on narrow screens.`,
  html: `
    <dl class="kv">
      <dt>Service</dt><dd>ingest-api, version 2026.09.1</dd>
      <dt>Environment</dt><dd>production, eu-west-1</dd>
      <dt>Window</dt><dd>2026-09-12 14:07 to 14:48 UTC</dd>
      <dt>Ticket</dt><dd><a href="https://example.com/INC-231">INC-231</a></dd>
      <dt>Owner</dt><dd>Laurent Gonzalez</dd>
    </dl>`,
});

add({
  id: "details",
  title: "Disclosure",
  intro: `For material a reader can skip: raw logs, long method notes, the full query. The summary line says what is inside and roughly how much. Do not hide the conclusion or anything a skimming reader needs. Consecutive disclosures share their rules.`,
  html: `
    <details>
      <summary>Full query used for the connection counts (12 lines)</summary>
      <pre><code>SELECT application_name, state, count(*)
FROM pg_stat_activity
WHERE datname = 'ingest'
GROUP BY 1, 2
ORDER BY 3 DESC;</code></pre>
    </details>
    <details>
      <summary>Why not just raise max_connections?</summary>
      <p>Each Postgres connection costs a backend process and roughly 10 MB of memory. Raising the limit from 100 to 300 would have bought time but the box has 4 GB, and the worker count was the actual mistake.</p>
    </details>`,
});

add({
  id: "tabs",
  title: "Tabs",
  intro: `Tabs are for the same data cut different ways (by region, by month), not for hiding sections. Without JS the panels simply follow each other with their headings, so each panel must make sense on its own. Put an h3 first in each panel; JS turns it into the tab label.`,
  html: `
    <div class="tabs" id="cut">
      <section class="tabpanel">
        <h3>By service</h3>
        <div class="table-wrap"><table>
          <thead><tr><th>Service</th><th class="num">Failed requests</th></tr></thead>
          <tbody>
            <tr><td>ingest-api</td><td class="num">17,900</td></tr>
            <tr><td>sync-worker</td><td class="num">500</td></tr>
          </tbody>
        </table></div>
      </section>
      <section class="tabpanel">
        <h3>By customer tier</h3>
        <div class="table-wrap"><table>
          <thead><tr><th>Tier</th><th class="num">Failed requests</th></tr></thead>
          <tbody>
            <tr><td>Enterprise</td><td class="num">11,200</td></tr>
            <tr><td>Standard</td><td class="num">7,200</td></tr>
          </tbody>
        </table></div>
      </section>
    </div>`,
});

add({
  id: "steps",
  title: "Steps and timeline",
  intro: `Steps are a numbered process where order matters (a runbook, a rollout plan). A timeline is what happened when: the time on the left in a fixed column, the event on the right, in UTC unless the page says otherwise. Both use rules, not cards.`,
  html: `
    <ol class="steps">
      <li><p>Deploy PgBouncer next to the primary in transaction mode with <code>default_pool_size = 20</code>.</p></li>
      <li><p>Point ingest-api at the bouncer port and cut <code>WORKERS</code> to 8.</p></li>
      <li><p>Watch <code>pgbouncer_pools_client_waiting</code> for a day before touching sync-worker.</p></li>
    </ol>
    <ol class="timeline">
      <li><span class="when">14:00 UTC</span><p>Deploy of ingest-api 2026.09.1 starts (workers 8 to 24).</p></li>
      <li><span class="when">14:07</span><p>First <code>pool exhausted</code> errors; 5xx rate climbs past 30%.</p></li>
      <li><span class="when">14:21</span><p>Alert pages on-call. The 10-minute window explains the delay.</p></li>
      <li><span class="when">14:33</span><p>Rollback started after a short detour through "is it the database?".</p></li>
      <li><span class="when">14:48</span><p>Error rate back to baseline. Incident closed at 15:10.</p></li>
    </ol>`,
});

add({
  id: "sources",
  title: "Footnotes and sources",
  intro: `Reference sources with a footnote number in the text and a numbered list at the end of the page under a "Sources" heading. Each entry says what the source is and where; link it if the reader can open it. Internal dashboards and tickets go here too, as plain text if they are not reachable from a link.`,
  html: `
    <p>Postgres allocates one backend process per connection,<sup class="fn" id="ref1"><a href="#src1">1</a></sup> which is why the limit is low by default.</p>
    <h2>Sources</h2>
    <ol class="sources">
      <li id="src1">PostgreSQL documentation, "Connections and Authentication", <a href="https://www.postgresql.org/docs/current/runtime-config-connection.html">postgresql.org</a>.</li>
      <li>Grafana, dashboard "ingest-api / overview", panels "5xx rate" and "pg connections", 12 September 2026.</li>
      <li>Incident ticket INC-231 and the deploy log for release 2026.09.1.</li>
    </ol>`,
});

add({
  id: "dividers",
  title: "Dividers",
  intro: `A horizontal rule separates parts of a page that are not separate sections, for example the end of the findings and the start of the appendix. Headings already separate sections; do not put a rule under every heading.`,
  html: `
    <p>End of the findings.</p>
    <hr>
    <p>Appendix material starts here.</p>`,
});

add({
  id: "controls",
  title: "Inputs and controls",
  intro: `Controls exist only for in-page interaction: filtering a table, a small calculator, toggling a view. Forms cannot submit anywhere. Label every control. The primary button is for the one main action; everything else is secondary. Keep the whole form on one line with <code>.form-inline</code> when it is three or four fields; use stacked <code>.field</code> blocks for more.`,
  html: `
    <div class="form-inline">
      <div class="field grow">
        <label for="q">Filter endpoints</label>
        <input type="search" id="q" data-filter="#endpoints" placeholder="Type to filter the table above">
      </div>
      <div class="field">
        <label for="region">Region</label>
        <select id="region">
          <option>All regions</option>
          <option>eu-west-1</option>
          <option>us-east-1</option>
        </select>
      </div>
      <div class="field">
        <label for="min">Min requests</label>
        <input type="number" id="min" value="1000" min="0" step="1000">
      </div>
      <button type="button" class="btn btn-primary">Apply</button>
      <button type="button" class="btn">Reset</button>
    </div>
    <div class="form-inline">
      <label class="check"><input type="checkbox" checked> Include health checks</label>
      <label class="check"><input type="radio" name="unit" checked> Milliseconds</label>
      <label class="check"><input type="radio" name="unit"> Seconds</label>
      <label class="check"><input type="checkbox" class="switch" checked> Show trend</label>
    </div>
    <div class="form-inline" id="calc">
      <div class="field">
        <label for="pods">Pods</label>
        <input type="number" id="pods" value="3" min="1">
      </div>
      <div class="field">
        <label for="workers">Workers per pod</label>
        <input type="number" id="workers" value="24" min="1">
      </div>
      <div class="field">
        <label for="limit">Postgres limit</label>
        <input type="number" id="limit" value="100" min="1">
      </div>
      <p class="field"><span class="muted">Pool use</span><output id="use" for="pods workers limit">72 of 100 (72%)</output></p>
    </div>
    <script>
    (function () {
      try {
        var ids = ['pods', 'workers', 'limit'], out = document.getElementById('use');
        function calc() {
          var v = ids.map(function (id) { return Number(document.getElementById(id).value) || 0; });
          var used = v[0] * v[1];
          out.textContent = used.toLocaleString('en-US') + ' of ' + v[2].toLocaleString('en-US') + ' (' + Math.round(100 * used / (v[2] || 1)) + '%)';
          out.className = used > v[2] ? 'delta-bad' : '';
        }
        ids.forEach(function (id) { document.getElementById(id).addEventListener('input', calc); });
        calc();
      } catch (e) {}
    })();
    </script>`,
  note: `The search field above filters the endpoint table in the table variants section (the base script wires any <code>input[data-filter]</code> to the table it points at). The calculator is a page-specific script of a dozen lines; write your own, inline, in a try/catch, with the result already present in the HTML so the page reads without JS.`,
});

add({
  id: "layout",
  title: "Layout: measure and wide",
  intro: `Prose sits in a centered column at the measure (38rem). Anything with <code>.wide</code> spans the full column (58rem), centered on the same axis, so wide tables and figures look deliberate rather than overflowing. On a phone both are the same width. Do not nest wide inside wide, and do not put prose in a wide element.`,
  html: `
    <p>This paragraph is at the measure.</p>
    <div class="wide" style="border-top: 1px solid var(--line-2); border-bottom: 1px solid var(--line-2); padding: var(--s2) 0; font-family: var(--font-ui); font-size: var(--small); color: var(--ink-3); text-align: center;">This block is wide.</div>
    <p>And prose returns to the measure. (The inline style above exists only to make the wide box visible; do not write inline styles in a manifest.)</p>`,
});

// ---------- assemble ----------
const toc = sections.map((s) => `<li><a href="#${s.id}">${s.title}</a></li>`).join("\n      ");

const body = sections
  .map((s) => {
    const markup = s.showMarkup === false ? "" : `
  <details>
    <summary>Markup</summary>
    <pre><code>${esc(s.html)}</code></pre>
  </details>`;
    const live = s.id === "header" ? "" : `
  <!-- component: ${s.id} -->
${s.html.split("\n").map((l) => "  " + l).join("\n")}
  <!-- /component: ${s.id} -->`;
    return `
<section id="${s.id}">
  <h2>${s.title}</h2>
  ${s.intro ? `<p>${s.intro}</p>` : ""}${live}${s.note ? `\n  <p>${s.note}</p>` : ""}${markup}
</section>`;
  })
  .join("\n");

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta name="color-scheme" content="light dark">
<title>Quire components</title>
${style}
</head>
<body>

<!-- component: header -->
<header class="doc-header">
  <h1>Quire components</h1>
  <p class="summary">Every component of the manifest design language, rendered with the base stylesheet, with its markup underneath.</p>
  <p class="meta">
    <time datetime="2026-09-19">19 September 2026</time>
    <span>Reference</span>
    <span class="badge badge-accent">Current</span>
  </p>
</header>
<!-- /component: header -->

<main>
  <p>This page is generated from the same stylesheet as <code>templates/base.html</code>. Each section shows a component in context, then the markup to copy. Agents: search this file for <code>component: &lt;name&gt;</code> to jump to the live markup of a component; the escaped copy under "Markup" is for people reading the rendered page.</p>
  <details>
    <summary>Contents</summary>
    <ul>
      ${toc}
    </ul>
  </details>
${body}
</main>

<footer class="doc-footer">
  <p>Quire is the design language for manifests. Tokens and rules: <code>design/DESIGN.md</code>. Template: <code>templates/base.html</code>.</p>
</footer>

${script}
</body>
</html>
`;

writeFileSync(OUT, html);
console.log(`wrote ${OUT} (${(html.length / 1024).toFixed(1)} KB)`);
