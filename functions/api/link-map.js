const SITE='https://oceanliners.net';
const MAX_PAGES=2000;
const CACHE_TTL_SECONDS=60*60*6;
const CACHE_KEY='link-map-v3';
const SEED_PATHS=['/','/ships/ships','/site-map','/explore'];

export async function onRequestGet(context){
  try{
    const url=new URL(context.request.url);
    const force=url.searchParams.get('refresh')==='1';
    const cache=context.env.LINK_MAP_CACHE||null;
    if(!force&&cache){
      const cached=await cache.get(CACHE_KEY,'json');
      if(cached?.generatedAt&&Array.isArray(cached.pages)&&Array.isArray(cached.edges))return json(cached,200);
    }
    const result=await crawl();
    if(cache)await cache.put(CACHE_KEY,JSON.stringify(result),{expirationTtl:CACHE_TTL_SECONDS});
    return json(result,200);
  }catch(error){return json({error:error instanceof Error?error.message:String(error)},500)}
}

async function crawl(){
  const discovered=new Set(SEED_PATHS);
  const sitemap=await sitemapPaths();
  sitemap.forEach(p=>discovered.add(p));

  // Archive/index pages are valuable seeds, but some site indexes are rendered by JS.
  // Pull every href we can from the authored HTML, then also inspect JS files that
  // commonly contain canonical ship/page lists (random-ship.js, related-liners.js, etc.).
  for(const p of await archivePaths('/ships/ships'))discovered.add(p);
  for(const p of await archivePaths('/site-map'))discovered.add(p);
  for(const p of await archivePaths('/explore'))discovered.add(p);
  for(const p of await scriptSeedPaths())discovered.add(p);

  const queue=[...discovered];
  const pages=[];
  const pageSeen=new Set();
  const edges=[];
  const edgeSeen=new Set();
  let cursor=0;
  const workers=Array.from({length:10},()=>worker());
  await Promise.all(workers);

  async function worker(){
    while(true){
      const i=cursor++;
      if(i>=queue.length||pageSeen.size>=MAX_PAGES)return;
      const path=queue[i];
      const url=new URL(path,SITE).href;
      let res;
      try{res=await fetch(url,{headers:{'user-agent':'OceanLinerCurator-LinkMap/3.0','accept':'text/html,application/xhtml+xml'}})}catch{continue}
      if(!res.ok||!(res.headers.get('content-type')||'').includes('text/html'))continue;
      const html=await res.text();
      const canonical=normalize(extractCanonical(html)||url);
      if(!canonical||pageSeen.has(canonical))continue;
      pageSeen.add(canonical);
      const links=extractLinks(html,url);
      pages.push({url:canonical,title:extractTitle(html)||friendlyTitle(canonical)});
      for(const raw of links){
        const target=normalize(raw);if(!target)continue;
        const key=`${canonical}>${target}`;
        if(!edgeSeen.has(key)){edgeSeen.add(key);edges.push({source:canonical,target})}
        const p=new URL(target).pathname;
        if(!discovered.has(p)&&discovered.size<MAX_PAGES){discovered.add(p);queue.push(p)}
      }
    }
  }

  const known=new Set(pages.map(p=>p.url));
  const internalEdges=edges.filter(e=>known.has(e.source)&&known.has(e.target));
  return {
    site:SITE,
    generatedAt:new Date().toISOString(),
    pages:pages.sort((a,b)=>a.url.localeCompare(b.url)),
    edges:internalEdges.sort((a,b)=>a.source.localeCompare(b.source)||a.target.localeCompare(b.target)),
    source:'live-crawl',
    coverage:{
      discoveredPaths:discovered.size,
      sitemapSeeds:sitemap.length,
      crawledPages:pages.length,
      maxPages:MAX_PAGES
    }
  };
}

async function archivePaths(path){
  const out=new Set();
  try{
    const res=await fetch(new URL(path,SITE),{headers:{'user-agent':'OceanLinerCurator-LinkMap/3.0','accept':'text/html'}});
    if(!res.ok)return [];
    const html=await res.text();
    for(const raw of extractLinks(html,new URL(path,SITE).href)){
      const n=normalize(raw);if(n)out.add(new URL(n).pathname);
    }
  }catch{}
  return [...out];
}

async function scriptSeedPaths(){
  const out=new Set();
  const scripts=new Set([
    '/random-ship.js','/related-liners.js','/related-ships.js',
    '/js/random-ship.js','/js/related-liners.js','/js/related-ships.js',
    '/assets/random-ship.js','/assets/related-liners.js','/assets/related-ships.js',
    '/scripts/random-ship.js','/scripts/related-liners.js','/scripts/related-ships.js'
  ]);

  // Discover additional script src values from the main index/archive pages.
  for(const seed of SEED_PATHS){
    try{
      const res=await fetch(new URL(seed,SITE),{headers:{'user-agent':'OceanLinerCurator-LinkMap/3.0','accept':'text/html'}});
      if(!res.ok)continue;
      const html=await res.text();
      for(const src of extractScriptSources(html,new URL(seed,SITE).href)){
        const u=new URL(src,SITE);
        if(['oceanliners.net','www.oceanliners.net'].includes(u.hostname)&&/\.js(?:$|\?)/i.test(u.pathname))scripts.add(u.pathname);
      }
    }catch{}
  }

  for(const path of scripts){
    try{
      const res=await fetch(new URL(path,SITE),{headers:{'user-agent':'OceanLinerCurator-LinkMap/3.0','accept':'text/javascript,application/javascript,text/plain'}});
      if(!res.ok)continue;
      const text=await res.text();
      for(const candidate of extractPathLikeStrings(text)){
        const n=normalize(candidate);if(n)out.add(new URL(n).pathname);
      }
    }catch{}
  }
  return [...out];
}

async function sitemapPaths(){
  const out=new Set();
  const seenXml=new Set();
  const queue=['/sitemap.xml','/sitemap_index.xml'];
  while(queue.length){
    const candidate=queue.shift();
    const abs=new URL(candidate,SITE).href;
    if(seenXml.has(abs))continue;
    seenXml.add(abs);
    try{
      const res=await fetch(abs,{headers:{'user-agent':'OceanLinerCurator-LinkMap/3.0','accept':'application/xml,text/xml,text/plain'}});
      if(!res.ok)continue;
      const xml=await res.text();
      for(const m of xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)){
        const loc=decode(m[1].trim());
        if(/\.xml(?:$|\?)/i.test(loc)){
          try{const u=new URL(loc,SITE);if(['oceanliners.net','www.oceanliners.net'].includes(u.hostname))queue.push(u.href)}catch{}
        }else{
          const n=normalize(loc);if(n)out.add(new URL(n).pathname);
        }
      }
    }catch{}
  }
  return [...out].slice(0,MAX_PAGES);
}

function extractLinks(html,base){
  const out=new Set();
  const re=/<a\b[^>]*?href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  for(const m of html.matchAll(re)){
    const raw=(m[1]??m[2]??m[3]??'').trim();
    if(!raw||raw.startsWith('#')||/^(mailto:|tel:|javascript:|data:)/i.test(raw))continue;
    try{out.add(new URL(decode(raw),base).href)}catch{}
  }
  return [...out];
}

function extractScriptSources(html,base){
  const out=new Set();
  const re=/<script\b[^>]*?src\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  for(const m of html.matchAll(re)){
    const raw=(m[1]??m[2]??m[3]??'').trim();
    if(!raw)continue;
    try{out.add(new URL(decode(raw),base).href)}catch{}
  }
  return [...out];
}

function extractPathLikeStrings(text){
  const out=new Set();
  const patterns=[
    /["'`]((?:https?:\/\/(?:www\.)?oceanliners\.net)?\/[A-Za-z0-9_~.!$&'()*+,;=:@%\/-]+)["'`]/g,
    /["'`]((?:\.\.\/|\.\/)+[A-Za-z0-9_~.!$&'()*+,;=:@%\/-]+)["'`]/g
  ];
  for(const re of patterns){
    for(const m of text.matchAll(re)){
      const raw=m[1];
      if(!raw||/\.(?:js|css|json|xml|jpg|jpeg|png|gif|webp|svg|pdf|zip|ico|txt|mp4|webm|mp3|woff2?|ttf)$/i.test(raw))continue;
      try{out.add(new URL(raw,SITE).href)}catch{}
    }
  }
  return [...out];
}

function extractTitle(html){const m=html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);return m?decode(m[1]).replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim():''}
function extractCanonical(html){for(const tag of html.match(/<link\b[^>]*>/gi)||[]){if(!/\bcanonical\b/i.test(tag))continue;const m=tag.match(/href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);if(m)return decode((m[1]??m[2]??m[3]??'').trim())}return''}
function normalize(value){try{const u=new URL(value,SITE);if(!['oceanliners.net','www.oceanliners.net'].includes(u.hostname))return null;u.protocol='https:';u.hostname='oceanliners.net';u.hash='';u.search='';let p=u.pathname.replace(/\/index\.html?$/i,'/').replace(/\/{2,}/g,'/');if(p.length>1)p=p.replace(/\/$/,'');if(/\.(?:jpg|jpeg|png|gif|webp|svg|pdf|zip|xml|json|js|css|ico|txt|mp4|webm|mp3|woff2?|ttf)$/i.test(p))return null;u.pathname=p||'/';return u.href}catch{return null}}
function friendlyTitle(url){const p=new URL(url).pathname.split('/').filter(Boolean).pop()||'Ocean Liner Curator';return p.replace(/[-_]+/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}
function decode(s){return s.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>')}
function json(value,status){return new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}})}
