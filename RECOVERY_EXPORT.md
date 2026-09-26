# Link Map Recovery Export

A complete, read-only backup of `LINK_MAP_CACHE` is available at `GET /api/recovery-export`.

Configure the Pages secret `RECOVERY_EXPORT_TOKEN` and send it as `X-Curator-Recovery-Key`. If the secret is absent, the endpoint remains disabled.

The exporter paginates the full namespace, preserves exact key/value pairs, and includes SHA-256 integrity metadata. The shared `CURATOR_ERROR_RECORDS` namespace is intentionally excluded because Error Bus owns that recovery boundary.

On iPad/iPhone, use Shortcuts with:

- URL: `https://link-map.oceanliners.net/api/recovery-export`
- Method: GET
- Header: `X-Curator-Recovery-Key` = the configured recovery token
- Save File

Validate with:

```bash
node scripts/validate-recovery-backup.mjs /path/to/backup.json
```

There is intentionally no production restore endpoint.
