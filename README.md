# manifest

Ask your coding agent to share something as a page, and get back a link.

A manifest is one self-contained HTML file: a report, an incident write-up, a plan, a comparison. The agent writes it, a small CLI checks it and uploads it, and a Cloudflare Worker serves it at a link nobody can guess. Everything runs on your own Cloudflare account, and the free plan is enough.

Example: [How manifest works](https://m.productivitymarket.work/Bg86Wg41dz7aMGoeQAeYMA). It's a manifest about manifest, with key figures, a chart, sortable and filterable tables, tabs, a timeline and a live calculator.

## What you get

- Pages in one design language, Quire, so every manifest reads like part of the same report, whichever agent wrote it.
- Links with 128 bits of randomness. Search engines are told not to index them.
- A strict Content-Security-Policy on every page. Inline CSS and JavaScript run; outside scripts, stylesheets, fonts and network calls don't. Each page runs in a sandboxed origin, away from your domain's cookies.
- Updates in place (same link), optional expiry, and list, fetch and delete.
- A `check` step before every upload that rejects whatever the policy would block and anything that looks like a secret.

## The skill

`skill/` is an agent skill for Claude Code and Codex. It holds the workflow, the page template, the component gallery, the design rules, a chart generator and the publishing CLI. When you say "make this a manifest" or "send me a link to this", the agent starts from the template, writes the page, runs `check`, publishes it and hands you the URL. If the content looks internal or has customer data in it, the agent asks you before it publishes.

```sh
./install.sh             # copies skill/ to ~/.claude/skills and ~/.agents/skills
./install.sh some-host   # same, on another machine over ssh
```

## Host your own

You need a free Cloudflare account and [Bun](https://bun.sh).

1. Install the Worker's dependencies and log in to Cloudflare:

   ```sh
   git clone https://github.com/lg-epitech/manifest && cd manifest/worker
   bun install
   bunx wrangler login
   ```

2. Create the KV namespace that stores the pages:

   ```sh
   bunx wrangler kv namespace create manifest-pages
   ```

   Put the `id` it prints into `kv_namespaces` in `worker/wrangler.jsonc`.

3. Pick the URL. In `wrangler.jsonc`, either set the `routes` pattern to a hostname on a domain you have on Cloudflare, or delete `routes` and set `"workers_dev": true` to serve from `manifest.<your-subdomain>.workers.dev`.

4. Deploy:

   ```sh
   bunx wrangler deploy
   ```

5. Create a publish token, give it to the Worker, then install the skill and log the CLI in:

   ```sh
   TOKEN="$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n')"
   printf %s "$TOKEN" | bunx wrangler secret put PUBLISH_TOKEN
   cd .. && ./install.sh
   printf %s "$TOKEN" | bun skill/scripts/manifest.ts login https://<your-worker-url>
   unset TOKEN
   bun skill/scripts/manifest.ts doctor
   ```

   `login` keeps the token in the macOS Keychain, or in `~/.config/manifest/token` elsewhere. `MANIFEST_URL` and `MANIFEST_TOKEN` override both.

Then ask your agent to publish something.

## Layout

```
worker/      the Worker (src/index.ts) and its wrangler config
skill/       the agent skill: SKILL.md, templates, design rules, CLI, chart generator
design-src/  scripts that rebuild the component gallery and the example report
```

## License

MIT
