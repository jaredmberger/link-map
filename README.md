# Ocean Liner Curator Link Map

Standalone internal-link visualization and audit tool for `https://oceanliners.net`.

## Cloudflare Pages deployment

Create a Cloudflare Pages project connected to `jaredmberger/link-map`.

Use these settings:

- Production branch: `main`
- Framework preset: None
- Build command: `npm run build`
- Build output directory: `public`
- Root directory: repository root / blank

The build copies `index.html` into the deployable `public/` directory. The Pages Function remains at the repository root:

`functions/api/link-map.js`

Cloudflare Pages exposes it automatically as:

`/api/link-map`

The generated `public/_routes.json` explicitly routes `/api/*` through Pages Functions.

The repository also includes `wrangler.toml` with `pages_build_output_dir = "./public"` so the expected Pages output is documented in code as well as in the dashboard settings.

### If `/api/link-map` returns 404

A 404 means the deployment contains the static page but not the Pages Function. Confirm that the Cloudflare project is a **Pages** project connected to this Git repository, not a static/direct upload or a standalone Worker deployment. Then confirm the build command and output directory above and redeploy the latest `main` commit.

Visiting `/api/link-map` directly should return JSON. Once that endpoint works, the Link Map UI will populate automatically.

## Optional KV cache

For faster repeat loads, create a Cloudflare KV namespace and bind it to the Pages project as:

`LINK_MAP_CACHE`

Without the binding the tool still works; it performs a fresh crawl whenever the endpoint is requested. With KV enabled, ordinary loads use the cached graph and the **Refresh crawl** button forces a rebuild.

## Suggested custom domain

A dedicated hostname keeps this tool isolated from CuratorOS deployment details. Good options include:

- `link-map.oceanliners.net`
- `links.oceanliners.net`

## Features

- live crawl of `oceanliners.net`
- interactive Cytoscape network graph
- touch-friendly pan and zoom
- page search
- filters by content type and connection count
- incoming / outgoing neighborhood views
- orphan and weak-page detection
- per-page link inspector
- potential connection suggestions based on shared graph neighbors
- CSV link-audit export
