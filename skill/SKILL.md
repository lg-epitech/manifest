---
name: manifest
description: Turn any content (a report, investigation write-up, plan, comparison, dashboard, explainer, meeting notes) into a single self-contained HTML page called a manifest, publish it to a shareable URL on the user's manifest server, and manage published manifests. Use when the user asks to publish or share something as a page or link, says "make this a manifest", "share this as a page", "send me a link", "publish this", or wants to update, list, fetch or delete a published manifest. Not for ordinary local HTML, CSS or web-development work.
---

# Manifest

A manifest is one HTML file, published at an unguessable URL, that other people read. Every manifest uses the same design language (Quire) so they all look like they came from the same hand. This skill lives in a directory; call it `SKILL_DIR` below (Claude Code and Codex both tell you where the skill was loaded from).

Files in this skill and when to read them:

- `design/DESIGN.md`: the design language. Read the Principles, Writing rules and the Recipe for your content type before writing. Consult Tokens and Do/don't when unsure.
- `templates/base.html`: the template every manifest starts from. Copy it; never write a page from scratch.
- `templates/components.html`: every component with its markup. Search it for `component: <name>` and copy the live markup for the components you use.
- `examples/example-report.html`: a finished manifest. Read it once to calibrate tone and structure.
- `scripts/chart.ts`: builds charts from a JSON spec (`--help` shows one per type).
- `scripts/manifest.ts`: the publishing CLI (check, publish, list, get, delete).

## Workflow

1. Decide the content first. Before touching HTML, write down: the title, the one-sentence conclusion (the summary line), the three to five numbers a reader should carry away, the sections in order, and which component each part needs. Pick the recipe for the content type in `design/DESIGN.md`. If the source material is thin, ask rather than pad.

2. Start from the template. Copy `SKILL_DIR/templates/base.html` to a scratch file, `$TMPDIR/manifest-<short-name>.html` (or `/tmp` if `TMPDIR` is unset). Do not write it into the user's repository unless asked. Keep the `<style>` block exactly as it is. Replace every `[[placeholder]]` in the header, main and footer, and delete the `PLACEHOLDER:` comments.

3. Write the page with the components in `templates/components.html`. The rules that matter most:
   - `<title>` is the same text as the `h1`, under 70 characters; it is what `list` shows.
   - Header: title, one-sentence summary that states the conclusion, meta line with date and author, optional status badge last. The author is the user: use their name (if you don't know it, try `git config user.name`, else ask).
   - Every table inside `<div class="table-wrap">`; numeric columns get `class="num"` on `th` and `td`; caption above; units in the header; `.wide` on the wrap when there are more than four or five columns.
   - Charts come from `bun SKILL_DIR/scripts/chart.ts spec.json` (`hbar`, `bar`, `line`, `sparkline`); paste its output as is and never hand-build SVG. The caption states the one thing the chart shows.
   - Images as `data:` URIs, compressed, under 150 KB each. Page under 500 KB.
   - At most two info or warning callouts (a decision callout doesn't count). Bold once per screen. No emoji, no icons, no new colors, no inline styles.
   - Any JavaScript is optional: the page reads fully without it, results are pre-rendered in the HTML, scripts are wrapped in `try/catch`, and nothing touches `localStorage`, `sessionStorage`, cookies or IndexedDB (they throw in the sandboxed origin). The base template's script already handles tabs, table filtering and sortable tables.

4. Unslop the prose. This step is required, not optional. Once the content is complete, invoke the `unslop` skill on every piece of prose in the page: title, summary, headings, paragraphs, list items, captions, callout titles and bodies, table captions and notes, disclosure summaries, footer. In Claude Code use the Skill tool with `unslop`; in Codex invoke the `unslop` skill. If no `unslop` skill is installed, edit the prose by hand against the Writing rules in `design/DESIGN.md`. Apply its edits in the HTML, then re-read the page top to bottom once as the recipient would. One exception: the page carries the user's byline, so skip unslop's "have opinions" and "use I" advice wherever it would put views or feelings in the user's mouth that they didn't express.

5. Check locally:
   ```
   bun SKILL_DIR/scripts/manifest.ts check <file>
   ```
   It reports the size (budget 500 KB), a missing `<title>`, leftover `[[placeholders]]` and `PLACEHOLDER:` comments, anything the CSP would block, storage API use and likely secrets, and exits 1 on blocking issues. Fix the page and re-run; do not use `--force` unless the user explicitly asks for it. If a headless browser is available, take a screenshot at 1280px and at 390px wide and look at it; do not block on this if none is.

6. Safety gate, before publishing:
   - Search the page for secrets: API keys, tokens, passwords, connection strings, private keys, session cookies, `.env` contents. Remove them. (`check` also scans for common token formats, but that is a backstop, not a substitute for reading the page.) Never publish personal data (emails, phone numbers, home addresses, customer names) unless the user put it there on purpose and knows the page is shareable.
   - If the content includes internal company or customer data (customer names, account or wallet identifiers, balances, transactions, internal metrics, incident details, source code), stop and ask the user for explicit confirmation before publishing. Say plainly: the URL is unguessable, but anyone who has the link can read the page, and links get forwarded. Do not publish until they confirm.

7. Publish:
   ```
   bun SKILL_DIR/scripts/manifest.ts publish <file> [--ttl 7d|30d|90d|<n>h|<n>d|none]
   ```
   Default is no expiry; use `--ttl` when the content is time-bound (`--ttl none` clears an expiry on update). The command runs `check` first and prints the URL on the last line of stdout. `--force` overrides page errors only. A suspected secret blocks publishing until you remove it; pass `--allow-secret` only when the user confirms the match is a false positive. A page containing the publish token itself is always refused. Publishing needs network access. In a sandboxed Codex session, request escalated permissions for this one command; do not try to work around the sandbox.
   If it fails with "no endpoint" or "no publish token", run `bun SKILL_DIR/scripts/manifest.ts doctor` and ask the user to store their Worker URL and token themselves with `printf %s "$TOKEN" | bun SKILL_DIR/scripts/manifest.ts login https://<their-worker>` (or set `MANIFEST_URL` and `MANIFEST_TOKEN`). Never ask for the token in the chat and never write it into a file or a page.

8. Report back with the URL exactly as printed (do not shorten, reformat or wrap it in a Markdown link with different text), the title, the expiry if one was set, and the path of the scratch file in case the user wants to edit and republish.

## Managing manifests

- Update in place (same URL): edit the scratch file (or `get` it first), then
  `bun SKILL_DIR/scripts/manifest.ts publish <file> --update <slug-or-url>`.
- List: `bun SKILL_DIR/scripts/manifest.ts list` (or `--json`) shows slug, title, updated, expires, size, url.
- Fetch: `bun SKILL_DIR/scripts/manifest.ts get <slug-or-url> -o "$TMPDIR/manifest-<short-name>.html"`.
- Delete: `bun SKILL_DIR/scripts/manifest.ts delete <slug-or-url>`. Confirm with the user before deleting anything you did not just publish in this session. Edge caches can keep serving a deleted page for up to a minute.

Every publish, update and delete needs network access; in a sandboxed Codex session request escalated permissions for the command.

## Writing

Write as a careful engineer writing for a colleague, then let `unslop` remove what is left. In practice:

- Plain words, specific facts, numbers with units. "41 minutes", "18,400 requests", "from 0.3% to 63%". Not "significant downtime".
- The summary line states the conclusion. A reader who stops after the header should know the answer.
- Headings in sentence case, short, concrete. "Why it happened", not "Root Cause Analysis".
- The byline is the user's. State opinions and first-person views only when the user expressed them, or attribute them; label your own recommendation as yours. Short sentences mixed with longer ones. No puffery, no "crucial", "robust", "seamless", "leverage", "delve", "landscape".
- No em dashes; use periods, commas or parentheses. Straight quotes. No emoji. No inline-header bullets ("**Performance:** ..."). No chatbot phrases.
- Dates: "12 September 2026" in prose and the meta line (ISO goes in the `datetime` attribute), ISO in tables and timelines, times in UTC. Thousands with commas, a real minus sign, the same decimals down a column.
- Full rules, including captions and numbers: `design/DESIGN.md`, "Writing rules".

## Hosting constraints

Pages are served from `<endpoint>/<slug>` (the endpoint `doctor` prints) under a strict Content-Security-Policy: `default-src 'none'`, inline styles and scripts allowed, images from `data:`/`blob:`/`https:`, fonts from `data:` only, no `connect-src`, no form submission, and the page runs in a sandboxed opaque origin. Consequences:

- Exactly one HTML file. All CSS and JS inline. No external stylesheets, scripts, web fonts, CDNs, analytics, `fetch` or `XMLHttpRequest`. System font stacks only.
- Images as `data:` URIs. `https:` images load but are discouraged (they leak the reader's IP and can disappear).
- `localStorage`, `sessionStorage`, `document.cookie` and IndexedDB throw. Wrap any such access in `try/catch`; better, do not use them.
- Forms cannot submit anywhere. Inputs are for in-page interactivity only.
- Maximum upload 10 MB; aim well under 500 KB.
- Pages are `noindex` at the edge; the template keeps `<meta name="robots" content="noindex">` anyway.

The base template already satisfies all of this. It stops being true the moment a page adds an external reference, which is what `check` catches.
