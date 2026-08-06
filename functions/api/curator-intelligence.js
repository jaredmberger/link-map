const SNAPSHOT_KEY = 'search-intelligence:link-map:v2';

export async function onRequestGet(context) {
  try {
    if (!context.env.LINK_MAP_CACHE) {
      return json({ ok: false, error: 'LINK_MAP_CACHE is not configured.' }, 503);
    }

    const payload = await context.env.LINK_MAP_CACHE.get(SNAPSHOT_KEY, 'json');
    const pages = Array.isArray(payload?.pages) ? payload.pages : [];
    if (!payload?.ok || !pages.length) {
      return json({ ok: false, error: 'No Link Map integration snapshot has been published yet.' }, 404);
    }

    const weak = pages.filter(page => Number(page.inboundCount || 0) <= 1 && !page.orphan);
    const orphans = pages.filter(page => page.orphan);
    const opportunities = pages
      .filter(page => (page.orphan || Number(page.inboundCount || 0) <= 1) && Array.isArray(page.suggestions) && page.suggestions.length)
      .sort((a, b) => Number(a.inboundCount || 0) - Number(b.inboundCount || 0))
      .slice(0, 12)
      .map(page => ({
        title: page.orphan ? 'Orphan-risk page has linking opportunities' : 'Weakly supported page has linking opportunities',
        summary: `${page.path} has ${Number(page.inboundCount || 0)} inbound internal link${Number(page.inboundCount || 0) === 1 ? '' : 's'} and ${page.suggestions.length} suggested source page${page.suggestions.length === 1 ? '' : 's'}.`,
        entity: page.path,
        severity: page.orphan ? 'high' : 'medium',
        sources: ['Link Map'],
        kind: 'internal-link',
        signal: {
          inboundCount: Number(page.inboundCount || 0),
          outboundCount: Number(page.outboundCount || 0),
          orphan: Boolean(page.orphan),
          suggestions: page.suggestions,
        },
      }));

    return json({
      ok: true,
      generatedAt: payload.generatedAt || new Date().toISOString(),
      system: {
        id: 'link-map',
        name: 'Link Map',
        status: orphans.length ? 'warning' : 'good',
        statusLabel: orphans.length ? 'Attention' : 'Connected',
        value: `${pages.length} pages`,
        summary: `${payload.edgeCount || 0} internal-link edges mapped; ${orphans.length} orphan${orphans.length === 1 ? '' : 's'} and ${weak.length} weakly supported page${weak.length === 1 ? '' : 's'} detected.`,
        detail: `Snapshot ${payload.generatedAt || 'available'}`,
        url: 'https://link-map.oceanliners.net/',
      },
      summary: {
        pageCount: pages.length,
        edgeCount: Number(payload.edgeCount || 0),
        orphanCount: orphans.length,
        weakPageCount: weak.length,
      },
      pages: pages.map(page => ({
        path: page.path,
        title: page.title || '',
        inboundCount: Number(page.inboundCount || 0),
        outboundCount: Number(page.outboundCount || 0),
        orphan: Boolean(page.orphan),
        suggestions: Array.isArray(page.suggestions) ? page.suggestions : [],
      })),
      priorities: opportunities.filter(item => item.severity === 'high').slice(0, 6),
      opportunities: opportunities.slice(0, 8),
      activity: [
        {
          title: 'Link graph snapshot available',
          summary: `${pages.length} pages and ${payload.edgeCount || 0} internal-link relationships are available for correlation.`,
          meta: 'Link Map · live graph snapshot',
        },
      ],
    });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
      'x-content-type-options': 'nosniff',
    },
  });
}
