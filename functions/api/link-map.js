const SITE='https://oceanliners.net';
const MAX_PAGES=1200;
const CACHE_TTL_SECONDS=60*60*6;
const CACHE_KEY='link-map-v1';

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
  const discovered=new Set(['/']);
  for(const p of await sitemapPaths())discovered.add(p);
  const queue=[...discovered];
  const pages=[];
  const pageSeen=new Set();
  const edges=[];
  const edgeSeen=new Set();
  let cursor=0;
  const workers=Array.from({length:8},()=>worker());
  await Promise.all(workers);

  async function worker(){
    while(true){
      const i=cursor++;
      if(i>=queue.length||pageSeen.size>=MAX_PAGES)return;
      const path=queue[i];
      const url=new URL(path,SITE).href;
      let res;
      try{res=await fetch(url,{headers:{'user-agent':'OceanLinerCurator-LinkMap/1.0','accept':'text/html,application/xhtml+xml'}})}catch{continue}
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
        const u=new URL(target);const p=u.pathname+u.search;
        if(!discovered.has(p)&&discovered.size<MAX_PAGES){discovered.add(p);queue.push(p)}
      }
    }
  }

  const known=new Set(pages.map(p=>p.url));
  return {site:SITE,generatedAt:new Date().toISOString(),pages:pages.sort((a,b)=>a.url.localeCompare(b.url)),edges:edges.filter(e=>known.has(e.source)&&known.has(e.target)).sort((a,b)=>a.source.localeCompare(b.source)||a.target.localeCompare(b.target)),source:'live-crawl'};
}

async function sitemapPaths(){
  const out=new Set();
  for(const candidate of ['/sitemap.xml','/sitemap_index.xml']){
    try{
      const res=await fetch(new URL(candidate,SITE),{headers:{'user-agent':'OceanLinerCurator-LinkMap/1.0'}});if(!res.ok)continue;
      const xml=await res.text();
      const locs=[...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map(m=>decode(m[1].trim()));
      for(const loc of locs){
        if(loc.endsWith('.xml')){
          try{const child=await fetch(loc,{headers:{'user-agent':'OceanLinerCurator-LinkMap/1.0'}});if(!child.ok)continue;const childXml=await child.text();for(const m of childXml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)){const n=normalize(decode(m[1].trim()));if(n)out.add(new URL(n).pathname)}}catch{}
        }else{const n=normalize(loc);if(n)out.add(new URL(n).pathname)}
      }
      if(out.size)break;
    }catch{}
  }
  return [...out].slice(0,MAX_PAGES);
}

function extractLinks(html,base){const out=new Set();const re=/<a\b[^>]*?href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;for(const m of html.matchAll(re)){const raw=(m[1]??m[2]??m[3]??'').trim();if(!raw||raw.startsWith('#')||/^(mailto:|tel:|javascript:|data:)/i.test(raw))continue;try{out.add(new URL(decode(raw),base).href)}catch{}}return [...out]}
function extractTitle(html){const m=html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);return m?decode(m[1]).replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim():''}
function extractCanonical(html){for(const tag of html.match(/<link\b[^>]*>/gi)||[]){if(!/\bcanonical\b/i.test(tag))continue;const m=tag.match(/href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);if(m)return decode((m[1]??m[2]??m[3]??'').trim())}return''}
function normalize(value){try{const u=new URL(value,SITE);if(!['oceanliners.net','www.oceanliners.net'].includes(u.hostname))return null;u.protocol='https:';u.hostname='oceanliners.net';u.hash='';u.search='';let p=u.pathname.replace(/\/index\.html?$/i,'/').replace(/\/{2,}/g,'/');if(p.length>1)p=p.replace(/\/$/,'');if(/\.(?:jpg|jpeg|png|gif|webp|svg|pdf|zip|xml|json|js|css|ico|txt|mp4|webm|mp3|woff2?|ttf)$/i.test(p))return null;u.pathname=p||'/';return u.href}catch{return null}}
function friendlyTitle(url){const p=new URL(url).pathname.split('/').filter(Boolean).pop()||'Ocean Liner Curator';return p.replace(/[-_]+/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}
function decode(s){return s.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>')}
function json(value,status){return new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}})}
