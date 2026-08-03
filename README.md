# Ocean Liner Curator Link Map

Standalone internal-link visualization and audit tool for `https://oceanliners.net`.

## Cloudflare Pages deployment

Create a Cloudflare Pages project connected to `jaredmberger/link-map`.

Recommended settings:

- Production branch: `main`
- Framework preset: None
- Build command: leave blank
- Build output directory: `/`

The repository root contains `index.html`, and the live crawler is implemented as a Pages Function at:

`/functions/api/link-map.js`

which is exposed as:

`/api/link-map`

The app calls that endpoint automatically and renders the current Ocean Liner Curator internal-link graph.

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
