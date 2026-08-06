const GRAPH_SNAPSHOT_KEY = 'link-map:graph:v1';

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

    return json(payload);
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
