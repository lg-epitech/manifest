// Builds skill/examples/example-report.html from base.html's stylesheet and script.
// Run from the repo root: bun design-src/build-example.ts
import { readFileSync, writeFileSync } from "node:fs";
import { chart as buildChart } from "../skill/scripts/chart.ts";

const BASE = `${import.meta.dir}/../skill/templates/base.html`;
const OUT = `${import.meta.dir}/../skill/examples/example-report.html`;

const base = readFileSync(BASE, "utf8");
const style = base.match(/<style>[\s\S]*?<\/style>/)![0];
const script = base.match(/<script>[\s\S]*?<\/script>/)![0];
const r1 = (n: number) => Math.round(n * 10) / 10;

const chart = buildChart({
  type: "line",
  wide: true,
  figure: 1,
  id: "fig-errors",
  title: "5xx rate and connection use for ingest-api, 13:30 to 15:30 UTC",
  caption: "Error rate and connection use for ingest-api, 12 September 2026, 13:30 to 15:30 UTC. The dashed line marks the start of the deploy at 14:00. Errors begin the moment connections reach the limit.",
  unit: "%",
  yMax: 100,
  yStep: 25,
  area: true,
  x: ["13:30", "", "", "", "14:00", "", "", "", "14:30", "", "", "", "15:00", "", "", "15:30"],
  marker: { at: "14:00" },
  series: [
    { name: "5xx rate", values: [0, 0, 0, 1, 2, 38, 61, 63, 60, 59, 20, 2, 0, 0, 0, 0] },
    { name: "Connections in use, as a share of the 100 limit", values: [30, 31, 30, 32, 40, 96, 100, 100, 100, 100, 100, 70, 34, 31, 30, 30] },
  ],
});

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta name="color-scheme" content="light dark">
<title>Ingest API outage on 12 September</title>
${style}
</head>
<body>

<header class="doc-header">
  <h1>Ingest API outage on 12 September</h1>
  <p class="summary">A deploy tripled the worker count per pod, the Postgres connection pool ran out, and the API returned 502s for 41 minutes. Nothing was lost: 18,400 requests failed, and all but 1,300 were retried by their clients.</p>
  <p class="meta">
    <time datetime="2026-09-14">14 September 2026</time>
    <span>Laurent Gonzalez</span>
    <span class="badge badge-ok">Resolved</span>
  </p>
</header>

<main>
  <div class="stats">
    <div class="stat">
      <span class="stat-value">41<small>min</small></span>
      <span class="stat-label">Duration</span>
      <span class="stat-note muted">14:07 to 14:48 UTC</span>
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
  </div>

  <h2>What happened</h2>
  <p>At 14:00 UTC on Friday 12 September we deployed ingest-api 2026.09.1. The release was about retry handling. It also carried, in the same PR, a change to <code>WORKERS</code> from 8 to 24 per pod that had been sitting in a branch since August. Nobody flagged it in review because the diff was two characters in a Helm values file and the PR description did not mention it.</p>
  <p>Seven minutes later the connection pool on the primary was full. Every new request from ingest-api waited five seconds for a connection, gave up, and returned a 502. The 5xx rate went from a baseline of 0.3% to 63% and stayed there until the rollback finished at 14:48.</p>
  <p>The alert took 14 minutes to fire. The 5xx alert averages over a 10-minute window, which is fine for a slow degradation and useless for a cliff. That part bothers me more than the outage itself. We were blind for a quarter of an hour on a Friday afternoon while the graph was vertical.</p>

  <ol class="timeline">
    <li><span class="when">14:00 UTC</span><p>Deploy of ingest-api 2026.09.1 starts. Workers per pod go from 8 to 24.</p></li>
    <li><span class="when">14:07</span><p>First <code>pool exhausted</code> errors in the logs. 5xx rate passes 30% within a minute.</p></li>
    <li><span class="when">14:21</span><p>Alert pages on-call (Tom). The 10-minute averaging window explains the delay.</p></li>
    <li><span class="when">14:33</span><p>Rollback started, after a short detour through "is it the database?". It was, but not in the way we thought.</p></li>
    <li><span class="when">14:48</span><p>Error rate back to baseline. Incident closed at 15:10 after the dead-letter queue was checked.</p></li>
  </ol>

  <h2>Why it happened</h2>
  <p>Each ingest-api worker holds one connection for the life of a request (<code>DB_POOL_MAX=1</code>). With 3 pods and 24 workers each, ingest-api alone can hold 72 connections. Add sync-worker, reporting and admin, and the total lands exactly on the <code>max_connections</code> of 100 that the primary has had since we set it up in 2024. We had never been close to the limit, so nobody treated it as a budget. It is one.</p>

  <div class="table-wrap wide">
    <table>
      <caption>Connection use by service, 12 September 2026, 14:00 to 15:00 UTC <span class="muted">(peak of one-minute samples)</span></caption>
      <thead>
        <tr>
          <th>Service</th>
          <th>Pool</th>
          <th class="num">Pods</th>
          <th class="num">Workers per pod</th>
          <th class="num">Peak connections</th>
          <th class="num">Share of limit (%)</th>
          <th class="num">Change from previous deploy</th>
        </tr>
      </thead>
      <tbody>
        <tr class="highlight">
          <td>ingest-api</td>
          <td>primary</td>
          <td class="num">3</td>
          <td class="num">24</td>
          <td class="num">72</td>
          <td class="num">72.0</td>
          <td class="num delta-bad">+48</td>
        </tr>
        <tr>
          <td>sync-worker</td>
          <td>primary</td>
          <td class="num">2</td>
          <td class="num">8</td>
          <td class="num">16</td>
          <td class="num">16.0</td>
          <td class="num">0</td>
        </tr>
        <tr>
          <td>reporting</td>
          <td>primary</td>
          <td class="num">1</td>
          <td class="num">8</td>
          <td class="num">8</td>
          <td class="num">8.0</td>
          <td class="num">0</td>
        </tr>
        <tr>
          <td>admin</td>
          <td>primary</td>
          <td class="num">1</td>
          <td class="num">4</td>
          <td class="num">4</td>
          <td class="num">4.0</td>
          <td class="num">0</td>
        </tr>
        <tr class="total">
          <th scope="row">Total</th>
          <td></td>
          <td class="num">7</td>
          <td class="num"></td>
          <td class="num">100</td>
          <td class="num">100.0</td>
          <td class="num">+48</td>
        </tr>
      </tbody>
    </table>
  </div>
  <p class="table-note">Reads go to the replica through a separate pool and are not counted here.</p>

  <div class="note note-info">
    <p class="note-title">Why the limit is 100</p>
    <p>Because 100 is the Postgres default and we never had a reason to change it. Each connection is a backend process with roughly 10 MB of memory, so on this instance 100 is also close to what it can comfortably run. Raising it is not free.</p>
  </div>

  ${chart.split("\n").join("\n  ")}

  <div class="note note-warn">
    <p class="note-title">The alert fired late</p>
    <p>The 5xx alert has a 10-minute averaging window, so the page went out 14 minutes after the first failed request. This is fixed in the follow-ups below but was true during the incident, and it will be true again for any other alert that uses the same template.</p>
  </div>

  <h2>Impact</h2>
  <p>18,400 requests failed between 14:07 and 14:48, all on <code>POST /transactions</code> and <code>POST /sync</code>. Reads were unaffected because they go to the replica.</p>
  <p>Most clients retry with backoff, so 17,100 of those requests were accepted within the hour. The other 1,300 came from the nightly reconciliation job, which does not retry. We replayed them by hand from the dead-letter queue on Monday morning. The idempotency key did its job: no duplicate rows, checked with the query in the appendix.</p>

  <div class="table-wrap">
    <table class="table-compact">
      <caption>Failed requests by endpoint and what happened to them</caption>
      <thead>
        <tr>
          <th>Endpoint</th>
          <th class="num">Failed</th>
          <th class="num">Retried by client</th>
          <th class="num">Replayed by hand</th>
        </tr>
      </thead>
      <tbody>
        <tr><td><code>POST /transactions</code></td><td class="num">15,900</td><td class="num">15,200</td><td class="num">700</td></tr>
        <tr><td><code>POST /sync</code></td><td class="num">2,500</td><td class="num">1,900</td><td class="num">600</td></tr>
        <tr class="total"><th scope="row">Total</th><td class="num">18,400</td><td class="num">17,100</td><td class="num">1,300</td></tr>
      </tbody>
    </table>
  </div>

  <h2>What we are changing</h2>
  <div class="note note-decision">
    <p class="note-title">Decision</p>
    <p>Put PgBouncer in transaction mode in front of the primary and cap ingest-api at 8 workers per pod. Agreed with Anna and Tom on 13 September.</p>
  </div>

  <ol class="steps">
    <li><p>Deploy PgBouncer next to the primary in transaction mode with <code>default_pool_size = 20</code>. Laurent, by 19 September.</p></li>
    <li><p>Set <code>WORKERS</code> back to 8, point ingest-api at the bouncer port, and shorten the 5xx alert window to 2 minutes. Tom, by 19 September.</p></li>
    <li><p>Add a check to CI that sums workers times pods across services and fails when the total passes 80% of <code>max_connections</code>. Anna, by 26 September.</p></li>
  </ol>

  <p>We are not raising <code>max_connections</code>. It would have bought time on Friday and it would have hidden the actual mistake, which is that nobody knew the budget existed.</p>

  <h2>Open questions</h2>
  <ul>
    <li>Should sync-worker also go through the bouncer? It holds long transactions, which is the one thing transaction pooling handles badly.</li>
    <li>The retry-handling change that motivated the release is still not deployed. It needs its own PR, alone this time.</li>
  </ul>

  <details>
    <summary>Query used to check for duplicate rows (8 lines)</summary>
    <pre><code>SELECT idempotency_key, count(*)
FROM transactions
WHERE created_at BETWEEN '2026-09-12 14:00+00' AND '2026-09-12 16:00+00'
GROUP BY idempotency_key
HAVING count(*) > 1;
-- 0 rows</code></pre>
  </details>

  <h2>Sources</h2>
  <ol class="sources">
    <li>Grafana, dashboard "ingest-api / overview", panels "5xx rate" and "pg connections", 12 September 2026, 13:30 to 15:30 UTC.</li>
    <li>PR 4821 (release 2026.09.1) and PR 4830 (rollback), and the deploy log for both.</li>
    <li>PostgreSQL documentation, "Connections and Authentication", <a href="https://www.postgresql.org/docs/current/runtime-config-connection.html">postgresql.org</a>.</li>
    <li>PgBouncer documentation, pool modes, <a href="https://www.pgbouncer.org/config.html">pgbouncer.org</a>.</li>
  </ol>
</main>

<footer class="doc-footer">
  <p>Written by Laurent Gonzalez, 14 September 2026. Numbers come from Grafana and the incident channel; the dashboard retention is 30 days.</p>
</footer>

${script}
</body>
</html>
`;

writeFileSync(OUT, html);
console.log(`wrote ${OUT} (${(html.length / 1024).toFixed(1)} KB)`);
