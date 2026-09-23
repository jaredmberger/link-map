const GRAPH_SNAPSHOT_KEY = 'link-map:graph:v1';
const STALE_AFTER_MS = 72 * 60 * 60 * 1000;

export async function onRequestGet(context) {
  try {
    if (!context.env.LINK_MAP_CACHE) {
      return json({ ok: false, pages: [], edges: [], error: 'LINK_MAP_CACHE is not configured.' }, 503);
    }

    const payload = await context.env.LINK_MAP_CACHE.get(GRAPH_SNAPSHOT_KEY, 'json');
    if (!payload?.pages?.length || !Array.isArray(payload?.edges)) {
      return json({
        ok: false,
        pages: [],
        edges: [],
        error: 'No full Link Map graph snapshot has been published yet. Open Link Map and let one crawl complete.'
      }, 404);
    }

    const generatedAtMs = Date.parse(payload.generatedAt || '');
    const ageMs = Number.isFinite(generatedAtMs) ? Math.max(0, Date.now() - generatedAtMs) : null;
    const snapshotAgeHours = ageMs == null ? null : Math.round((ageMs / 36e5) * 10) / 10;
    const stale = ageMs == null || ageMs > STALE_AFTER_MS;
    return json({
      ...payload,
      stale,
      snapshotAgeHours,
      staleAfterHours: STALE_AFTER_MS / 36e5,
      freshness: stale ? 'stale' : 'fresh'
    });
  } catch (error) {
    return json({
      ok: false,
      pages: [],
      edges: [],
      error: error instanceof Error ? error.message : String(error)
    }, 500);
  }
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'access-control-allow-origin': '*'
    }
  });
}
