const SNAPSHOT_KEY = 'search-intelligence:link-map:v2';
const GRAPH_SNAPSHOT_KEY = 'link-map:graph:v1';

export async function onRequestGet(context) {
  try {
    if (!context.env.LINK_MAP_CACHE) {
      return json({ ok: false, pages: [], error: 'LINK_MAP_CACHE is not configured.' }, 503);
    }
    const payload = await context.env.LINK_MAP_CACHE.get(SNAPSHOT_KEY, 'json');
    if (!payload?.pages?.length) {
      return json({ ok: false, pages: [], error: 'No Link Map integration snapshot has been published yet. Open Link Map and let a crawl complete.' }, 404);
    }
    return json(payload);
  } catch (error) {
    return json({ ok: false, pages: [], error: error instanceof Error ? error.message : String(error) }, 500);
  }
}

export async function onRequestPost(context) {
  try {
    if (!context.env.LINK_MAP_CACHE) {
      return json({ ok: false, error: 'LINK_MAP_CACHE is not configured.' }, 503);
    }
    const raw = await context.request.json();
    const snapshot = normalizeSnapshot(raw);
    if (!snapshot.pages.length) return json({ ok: false, error: 'Snapshot contains no pages.' }, 400);

    const payload = buildIntegrationPayload(snapshot);
    await Promise.all([
      context.env.LINK_MAP_CACHE.put(SNAPSHOT_KEY, JSON.stringify(payload), {
        expirationTtl: 60 * 60 * 24 * 14,
      }),
      context.env.LINK_MAP_CACHE.put(GRAPH_SNAPSHOT_KEY, JSON.stringify({
        ok: true,
        source: 'CuratorOS Link Map',
        generatedAt: snapshot.generatedAt,
        site: snapshot.site,
        pageCount: snapshot.pages.length,
        edgeCount: snapshot.edges.length,
        pages: snapshot.pages,
        edges: snapshot.edges,
      }), {
        expirationTtl: 60 * 60 * 24 * 14,
      }),
    ]);

    return json({
      ok: true,
      generatedAt: payload.generatedAt,
      pages: payload.pageCount,
      edges: payload.edgeCount,
      precomputed: true,
      graphPublished: true,
    });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 400);
  }
}

function normalizeSnapshot(payload) {
  const pages = Array.isArray(payload?.pages) ? payload.pages : [];
  const edges = Array.isArray(payload?.edges) ? payload.edges : [];
  const cleanPages = pages
    .map(item => ({ url: normalizeUrl(item?.url || item?.id || ''), title: String(item?.title || '').trim() }))
    .filter(item => item.url);
  const known = new Set(cleanPages.map(item => item.url));
  const cleanEdges = edges
    .map(item => ({ source: normalizeUrl(item?.source || ''), target: normalizeUrl(item?.target || '') }))
    .filter(item => item.source && item.target && item.source !== item.target && known.has(item.source) && known.has(item.target));
  return {
    site: 'https://oceanliners.net',
    generatedAt: payload?.generatedAt || new Date().toISOString(),
    pages: dedupeBy(cleanPages, item => item.url),
    edges: dedupeBy(cleanEdges, item => `${item.source}>${item.target}`),
  };
}

function buildIntegrationPayload(snapshot) {
  const incoming = new Map(snapshot.pages.map(page => [page.url, new Set()]));
  const outgoing = new Map(snapshot.pages.map(page => [page.url, new Set()]));
  for (const edge of snapshot.edges) {
    outgoing.get(edge.source)?.add(edge.target);
    incoming.get(edge.target)?.add(edge.source);
  }

  const pages = snapshot.pages.map(page => {
    const inbound = incoming.get(page.url) || new Set();
    const outbound = outgoing.get(page.url) || new Set();
    return {
      path: toPath(page.url),
      title: page.title || '',
      inboundCount: inbound.size,
      outboundCount: outbound.size,
      orphan: inbound.size === 0,
      suggestions: suggestSourcesFast(page.url, snapshot.pages, incoming, outgoing),
    };
  });

  return {
    ok: true,
    source: 'CuratorOS Link Map',
    generatedAt: snapshot.generatedAt,
    pageCount: pages.length,
    edgeCount: snapshot.edges.length,
    pages,
  };
}

function suggestSourcesFast(target, pages, incoming, outgoing) {
  const alreadyInbound = incoming.get(target) || new Set();
  const targetSection = sectionFor(target);
  const targetNeighbors = new Set([...(incoming.get(target) || []), ...(outgoing.get(target) || [])]);
  const candidates = [];

  for (const page of pages) {
    const source = page.url;
    if (source === target || alreadyInbound.has(source)) continue;
    let score = 0;
    if (sectionFor(source) === targetSection) score += 2;
    const sourceOut = outgoing.get(source) || new Set();
    let checked = 0;
    for (const neighbor of targetNeighbors) {
      if (sourceOut.has(neighbor)) score += 1;
      checked += 1;
      if (checked >= 12) break;
    }
    if (score > 0) candidates.push({ from: toPath(source), anchor: pageTitleFromUrl(target), score });
  }

  return candidates.sort((a, b) => b.score - a.score || a.from.localeCompare(b.from)).slice(0, 6);
}

function sectionFor(value) {
  try { return new URL(value).pathname.split('/').filter(Boolean)[0] || '/'; } catch { return '/'; }
}

function pageTitleFromUrl(value) {
  try {
    const part = new URL(value).pathname.split('/').filter(Boolean).pop() || 'Ocean Liner Curator';
    return part.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  } catch { return null; }
}

function normalizeUrl(value) {
  try {
    const url = new URL(value, 'https://oceanliners.net');
    if (!['https://oceanliners.net', 'https://www.oceanliners.net'].includes(url.origin)) return '';
    url.protocol = 'https:';
    url.host = 'oceanliners.net';
    url.hash = '';
    url.search = '';
    url.pathname = url.pathname.replace(/\/index\.html?$/i, '/').replace(/\.html?$/i, '');
    return url.href.replace(/\/$/, url.pathname === '/' ? '/' : '');
  } catch { return ''; }
}

function toPath(value) {
  try { return new URL(value).pathname || '/'; } catch { return value; }
}

function dedupeBy(values, keyFn) {
  const map = new Map();
  for (const value of values) if (!map.has(keyFn(value))) map.set(keyFn(value), value);
  return [...map.values()];
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}
