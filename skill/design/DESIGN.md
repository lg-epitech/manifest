# Quire, the manifest design language

A quire is a few sheets folded into a small booklet. Every manifest is one.

## Identity

Quire is a typeset document, not an interface. One centered column of serif text at a comfortable measure. One system sans for everything structural: headings, the meta line, tables, labels, controls. One teal accent that appears only where the reader can act (links, focus, the primary button) and as the first chart series. Rules instead of boxes. Whitespace and type weight carry the hierarchy; color carries meaning and nothing else.

The test: two manifests on different subjects, written by different agents, should look like pages from the same report.

## Principles

1. Typeset, not designed. The page should look like a careful person set it in a good text editor, not like a product. No hero, no cards, no icons, no emoji, no gradients, no shadows, no rounded panels.
2. Color is meaning. Teal means "you can act on this". Green, amber and red mean good, needs attention, broken. Everything else is ink and grey. If a color does not carry one of those meanings, it does not belong.
3. Rules, not boxes. Separate things with hairlines and space. The only filled surfaces are code blocks and callouts, in a neutral tint one step off the background.
4. The measure holds. Prose sits at 38rem (about 75 characters). Tables, figures and stat rows may break out to 58rem with `.wide`, centered on the same axis, so a wide table looks deliberate rather than overflowing.
5. One file, no dependencies. Everything inline, system fonts, `data:` images, JavaScript optional. The page must read in full with JS off and with no network.
6. Say it once, at the top. The title names the subject, the summary states the conclusion, the key figures carry the numbers. A reader who stops after the header should still know the answer.
7. Fewer things, placed well. Remove one component before publishing. If everything is a callout, nothing is.

## Tokens

All tokens live in `templates/base.html` as CSS custom properties. Use them by class and element; never write inline styles or new colors, sizes or fonts.

### Color

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--bg` | `#ffffff` | `#17181c` | Page background |
| `--surface` | `#f5f5f3` | `#1f2126` | Code blocks, callouts, inline code |
| `--ink` | `#1b1c20` | `#e7e7e4` | Body text, headings, numbers |
| `--ink-2` | `#4b4d55` | `#b4b5ba` | Summary, table headers, blockquotes, labels |
| `--ink-3` | `#6b6d76` | `#8b8d94` | Meta, captions, notes, chart labels, muted cells |
| `--line` | `#e3e3df` | `#2c2e35` | Hairlines: table rows, dividers, footer rule |
| `--line-2` | `#c9c9c4` | `#44464e` | Strong rules: header rule, table header, stat rule |
| `--control-border` | `#8a8c93` | `#6e7078` | Borders of inputs, selects and secondary buttons, the unchecked switch track (3:1 against the background) |
| `--accent` | `#0b6c78` | `#6fc6d1` | Links, focus ring, primary button, selected tab, chart series 1 |
| `--accent-ink` | `#085660` | `#9ad9e1` | Link and button hover |
| `--accent-soft` | `#e6f2f3` | `#1a2f33` | Highlighted table row, accent badge background, selection |
| `--ok` / `--ok-soft` | `#2f6f3e` / `#e8f2ea` | `#7fc48f` / `#1c2a1f` | Good: badge, delta |
| `--warn` / `--warn-soft` | `#8f5a00` / `#f9f0dc` | `#e0b05a` / `#2e2717` | Needs attention: badge, warning callout rule |
| `--bad` / `--bad-soft` | `#a83a32` / `#f8e7e5` | `#ef8a82` / `#33201f` | Broken or worse: badge, delta, chart marker |
| `--chart-1` | = `--accent` | = `--accent` | First (or only) series |
| `--chart-2` | `#8d8f97` | `#8d8f97` | Second series |
| `--chart-3` | `#a87414` | `#d7a24a` | Third series (last resort) |
| `--chart-grid` | = `--line` | = `--line` | Gridlines |

Dark mode follows `prefers-color-scheme`; there is no toggle (the sandboxed origin cannot remember one anyway). Every text color meets 4.5:1 on its background in both schemes. Print forces the light palette with pure black ink.

### Type

| Token | Value | Notes |
| --- | --- | --- |
| `--font-text` | `Charter, "Iowan Old Style", "Source Serif 4", "Source Serif Pro", Georgia, "Noto Serif", serif` | Reading: body, summary, lists, callout text, blockquotes, sources |
| `--font-ui` | `system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif` | Structure and data: headings, meta, tables, captions, labels, badges, controls, chart text |
| `--font-mono` | `ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace` | Code, identifiers, logs |
| `--text` | 17px (16px under 40rem) | Body, line-height 1.55 |
| `--summary` | 20px (18px) | One-line summary under the title, `--ink-2` |
| `--h1` | 32px (26px) | Sans 600, letter-spacing -0.02em |
| `--h2` | 22px (20px) | Sans 600, 48px above, 12px below |
| `--h3` | 17px | Sans 600, 32px above, 8px below |
| `--small` | 14px | Tables, captions, meta, controls, footnotes, sources |
| `--xs` | 13px | Badges, chart labels, table notes, stat notes |
| `--stat` | 28px (24px) | Key figure value, sans 500, tabular figures |

Headings are sentence case, sans, semibold. Body is serif. Numbers in tables, stats, timelines and inputs use `font-variant-numeric: tabular-nums`. Bold is 700 and rare; italics for titles and emphasis.

### Space

4px base: `--s1` 4, `--s2` 8, `--s3` 12, `--s4` 16, `--s5` 24, `--s6` 32, `--s7` 48, `--s8` 64. Paragraphs are separated by `--s4`. Components (tables, figures, callouts, lists) end with `--s5`. Sections start with `--s7` above the h2. The header has `--s7` above the title and `--s6` below its rule; the footer has `--s8` above.

### Layout

| Token | Value | Notes |
| --- | --- | --- |
| `--measure` | 38rem (608px) | Prose column, about 75 characters of Charter at 17px |
| `--wide` | 58rem (928px) | `.wide` elements and the header and footer rules |
| `--gutter` | 20px (16px under 40rem) | Side padding; the only horizontal margin on a phone |

The body is centered at `--wide` plus gutters. Direct children of `header`, `main`, `footer`, `section`, `article`, `.tabs` and `.tabpanel` are held to the measure and centered; anything with `.wide` spans the full column. The rule that does this is the last one in the stylesheet, so component rules must set `margin-block`, never the `margin` shorthand, or they will knock the element off-axis.

Breakpoints: 40rem (640px) is the phone breakpoint (smaller type, tighter gutter, stacked timeline, single-column figure pairs); 30rem stacks key-value lists.

### Borders, radii, focus

Hairline `1px solid var(--line)` for table rows, dividers, disclosure edges, the footer rule. Strong rule `1px solid var(--line-2)` for the header rule, table headers, totals rows and stat tops. Inputs, selects and secondary buttons use `1px solid var(--control-border)` so their edges meet the 3:1 contrast minimum. Callouts have a 3px left rule in the semantic color; blockquotes a 2px left rule in `--line-2`. Radius is 4px on inputs, buttons, badges, code and the right side of callouts; 0 everywhere else. Nothing has a shadow.

Focus: `:focus-visible` gets `2px solid var(--accent)` with 2px offset, on every focusable element, in both schemes.

### Print

Light palette with black ink, 10.5pt body, no controls or tab bars, all tab panels visible, table headers repeated across pages, no page breaks inside table rows, figures, callouts, steps or timeline items, and the URL printed after each external link in the main text.

## Components

All components are shown with markup in `templates/components.html`; search that file for `component: <name>`.

| Component | Class or element | When |
| --- | --- | --- |
| Header | `.doc-header` with `h1`, `.summary`, `.meta` | Always. Title, one-sentence conclusion, date and author, optional status badge last in the meta line |
| Footer | `.doc-footer` | Always. Who wrote it, when, where the data came from |
| Sections | `h2`, `h3` | Sentence case. `h4` only in long reference pages |
| Text | `p`, `ul`, `ol`, `blockquote`, `strong`, `em`, `code`, `kbd`, `abbr` | Bold once per screen at most |
| Links | `a`, `a.ext`, `a.link-more` | Inline links in prose; `.link-more` for "where next" at the end of a section, a handful per page |
| Tables | `.table-wrap > table`, `th.num td.num`, `caption`, `tr.total`, `tr.highlight`, `tr.dim`, `td.empty`, `.table-compact`, `.table-sticky`, `.sortable`, `.nowrap`, `.table-note`, `.delta-good`, `.delta-bad` | Every table in `.table-wrap`; `.wide` on the wrap for more than four or five columns; no zebra |
| Key figures | `.stats > .stat` with `.stat-value`, `.stat-label`, `.stat-note` | Three to five numbers right under the header. Five needs `.wide` |
| Callouts | `.note`, `.note-info`, `.note-warn`, `.note-decision` with `.note-title` | At most two info or warning callouts per page; a decision callout doesn't count toward that. Decision callouts say who decided and when |
| Badges | `.badge`, `.badge-ok`, `.badge-warn`, `.badge-bad`, `.badge-accent` | One per row or heading, colored only when the color means something |
| Code | `code`, `pre > code` | No syntax highlighting. A sentence before a block says what it is |
| Figures | `figure > img[.framed] + figcaption`, `.figure-inline`, `.figure-pair`, `.wide` | `data:` images, compressed; `.framed` on screenshots; every figure captioned |
| Charts | `figure.chart` built by `scripts/chart.ts` (inline SVG using `.grid`, `.axis`, `.s1` to `.s3`, `.l1` to `.l3`, `.area1`, `.marker`, `.strong`; `.legend` with `.swatch`; `.sparkline`) | Horizontal bars for categories, lines for time, sparklines in tables. Never hand-build the SVG: write a JSON spec and paste the script's output |
| Key-value | `dl.kv` | Facts about the subject: versions, environments, owners, tickets |
| Disclosure | `details > summary` | Material the reader can skip; never the conclusion |
| Tabs | `.tabs > .tabpanel` each starting with an `h3` | Same data cut different ways. Reads as stacked sections without JS |
| Steps | `ol.steps` | Ordered process with owners and dates |
| Timeline | `ol.timeline > li > .when + p` | What happened when. `.when` holds `HH:MM` when the day is given by the caption or heading, or `2026-09-12 14:07 UTC` across days; the column grows to fit |
| Sources | `ol.sources`, `sup.fn` | Numbered list under a "Sources" h2 at the end |
| Divider | `hr` | Between parts that are not sections |
| Controls | `.form-inline`, `.field`, `label`, inputs, `select`, `.check`, `.switch`, `.btn`, `.btn-primary`, `output` | In-page only: filter, calculator, toggle. Labelled. One primary button |

## Do and don't

Do:

- Copy `templates/base.html` and fill it in. Keep the stylesheet intact.
- Put the conclusion in the summary line and the numbers in a stats row, so the header answers the question.
- Use `h2` for every section and keep headings under about eight words.
- Wrap every table in `.table-wrap`, mark numeric columns `.num` on both `th` and `td`, put units in the header, keep the same decimals down a column, add a caption that says what and when.
- Mark the one row the text is about with `tr.highlight`, totals with `tr.total`.
- Give every figure and chart a caption that states the one thing it shows.
- Build every chart with `bun SKILL_DIR/scripts/chart.ts spec.json` (types `hbar`, `bar`, `line`, `sparkline`; `--help` prints a spec for each). It sizes the label gutter from the longest label, keeps text inside the viewBox, formats numbers and writes the screen-reader `<title>` and `<desc>`. Never hand-type coordinates.
- Put a `.table-note` right after its `.table-wrap`; under a `.table-wrap.wide` it widens to match.
- Compress images before inlining (a screenshot should be under 150 KB, the page under 500 KB).
- Make interactive parts optional: content visible without JS, results pre-rendered in the HTML, every script in a `try/catch`, no storage APIs.

Don't:

- Don't add a `<style>` rule, an inline `style=""`, a color, a font or a size that is not in the tokens. If a component seems to need one, use an existing component differently or leave it out.
- Don't use cards, panels, shadows, gradients, icons, emoji, background images or decorative rules.
- Don't center text, justify text, or widen the prose column.
- Don't put a badge, label or eyebrow above the title. The meta line is where status lives.
- Don't put an arrow or icon on inline links. `.link-more` is for standalone links only.
- Don't use zebra striping, vertical table borders, or colored header rows.
- Don't hide the conclusion in a disclosure or a tab.
- Don't use pie charts, 3D, more than three series, or a y-axis that does not start at zero.
- Don't use bold for more than one phrase per screen, or all caps anywhere.
- Don't load anything from the network: no fonts, stylesheets, scripts, analytics, images by https (allowed but discouraged), fetch or XHR. The hosting CSP blocks all of it and the page must stand alone.

## Writing rules

The `unslop` skill is applied to every piece of prose before publishing; these rules are the parts of it that apply to a manifest, plus the house conventions.

Titles. Name the subject and, where it fits, the finding: "Ingest API outage on 12 September", "Queue options for the sync pipeline", "Q3 connector reliability". Sentence case, no colon-plus-subtitle, no "Report:" prefix, under 70 characters. The `<title>` is the same text as the `h1`.

Summary. One sentence, sometimes two, that states the conclusion or what the page contains, with the key number in it. "A deploy tripled the worker count, the connection pool ran out, and the API returned 502s for 41 minutes." Not "This document describes an incident."

Headings. Sentence case, short, specific. "Why it happened", not "Root Cause Analysis". Questions are fine when the section answers one.

Body. Plain words, short sentences mixed with longer ones, specific facts over adjectives. Say who, when, how many. The byline is the user's, so the page speaks in their voice: include opinions, judgements and first-person statements only when the user expressed them (or attribute them to whoever did). Never invent the author's views or feelings; when a page needs a recommendation the user didn't give, label it as the agent's. No puffery, no "crucial", "robust", "seamless", "leverage", "delve", "landscape". No em dashes; use periods, commas or parentheses. No colons as mid-sentence connectors. Straight quotes. No emoji. No bold on every noun. No "In conclusion". No chatbot phrases.

Captions. Sans, small, under the figure or above the table. Say what is shown and when: "5xx rate for ingest-api, 12 September 2026, 13:30 to 15:30 UTC." Number figures when the text refers to them ("Figure 1."). Put the one takeaway in the caption when the chart has one.

Callouts. A short title in sentence case and one or two sentences. Decision callouts name the decision, who agreed, and the date.

Numbers. Thousands with commas (18,400). Same number of decimals down a column. Units in the table header ("p95 (ms)") or after a space in prose ("420 ms", "3.4 GB"), except percent (63%) and currency ($1,200; EUR 1,200 for other currencies). A real minus sign (&minus;) for negatives. Right-aligned with tabular figures in tables and stats. Round to what the reader needs: "18,400", not "18,412". Say what a percentage is a share of.

Dates and times. In prose and in the meta line, write "12 September 2026"; the meta line puts ISO in the attribute: `<time datetime="2026-09-14">14 September 2026</time>`. In tables and timelines use ISO 8601 (2026-09-12) and 24-hour times with the zone (14:07 UTC). Durations as "41 min", "3 h 20 min", "2 days".

Names. Services, endpoints, flags, files and commands in `code`. People by first name and last name on first mention.

## Recipes

Which components a content type usually needs, in order.

- Investigation or incident: header with status badge, stats row, "What happened" with a timeline, "Why it happened" with a table and a chart, "Impact", a decision callout with steps, "Open questions", sources.
- Report or status update: header, stats row, one section per topic with a table or chart each, "What is next" as steps, sources.
- Plan or proposal: header with a "Draft" badge, a key-value list (owner, scope, dates), "Goal", "Approach" as steps, "Risks" as a warning callout, "Decision needed" as a decision callout, "Alternatives considered" in disclosures.
- Comparison: header with the recommendation in the summary, a wide comparison table with the chosen row highlighted, a chart for the deciding metric, a section per option only where the table cannot say it, a decision callout, sources.
- Dashboard: header with the period in the summary, a wide stats row, two or three wide charts with captions, one wide compact table, a table note for definitions. No prose sections beyond a short "Reading this page".
- Explainer: header, prose sections with figures, an info callout for the one thing people get wrong, a key-value list for definitions, sources.
- Meeting notes: header with date and attendees in the meta line, "Decisions" as decision callouts, "Actions" as steps with owners and dates, "Discussed" as short prose, "Open" as a list.
