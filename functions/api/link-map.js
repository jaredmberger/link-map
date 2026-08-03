const SITE='https://oceanliners.net';
const MAX_PAGES=2000;
const CACHE_TTL_SECONDS=60*60*6;
const CACHE_KEY='link-map-v4';
const START_URLS=[
  `${SITE}/`,
  `${SITE}/ships/ships`,
  `${SITE}/explore`,
  `${SITE}/collections`,
  `${SITE}/reference-objects`
];
const USER_AGENT='OceanLinerCurator-LinkMap/4.0 (+https://oceanliners.net/)';

export async function onRequestGet(context){
  try{
    const url=new URL(context.request.url);
    const force=url.searchParams.get('refresh')==='1';
    const cache=context.env.LINK_MAP_CACHE||null;
    if(!force&&cache){
      const cached=await cache.get(CACHE_KEY,'json');
      if(cached?.generatedAt&&Array.isArray(cached.pages)&&Array.isArray(cached.edges))return json(cached,200);
    }
    const result=await crawlSite();
    if(cache)await cache.put(CACHE_KEY,JSON.stringify(result),{expirationTtl:CACHE_TTL_SECONDS});
    return json(result,200);
  }catch(error){
    return json({error:error instanceof Error?error.message:String(error)},500);
  }
}

async function crawlSite(){
  const queue=[...START_URLS];
  const seen=new Set();
  const pages=[];
  const edges=[];
  const edgeSeen=new Set();

  while(queue.length&&seen.size<MAX_PAGES){
    const requested=queue.shift();
    const normalizedRequested=normalizeInternalPageUrl(new URL(requested));
    if(!normalizedRequested||seen.has(normalizedRequested))continue;
    seen.add(normalizedRequested);

    let response;
    try{
      response=await fetchWithTimeout(normalizedRequested,{
        headers:{'user-agent':USER_AGENT,accept:'text/html,application/xhtml+xml'},
        redirect:'follow'
      },20000);
    }catch{
      continue;
    }

    const contentType=response.headers.get('content-type')||'';
    if(!response.ok||!contentType.toLowerCase().includes('text/html'))continue;

    const html=await response.text();
    const finalUrl=normalizeInternalPageUrl(new URL(response.url||normalizedRequested))||normalizedRequested;
    const title=extractTitle(html)||pathToTitle(new URL(finalUrl).pathname);
    const anchors=extractAnchors(html,finalUrl);
    const internal=new Set();

    for(const anchor of anchors){
      let parsed;
      try{parsed=new URL(anchor.href)}catch{continue}
      const target=normalizeInternalPageUrl(parsed);
      if(!target||target===finalUrl)continue;
      internal.add(target);
      if(!seen.has(target)&&!queue.includes(target)&&seen.size+queue.length<MAX_PAGES)queue.push(target);
    }

    pages.push({url:finalUrl,title});
    for(const target of internal){
      const key=`${finalUrl}>${target}`;
      if(edgeSeen.has(key))continue;
      edgeSeen.add(key);
      edges.push({source:finalUrl,target});
    }
  }

  const dedupPages=new Map();
  for(const page of pages)if(!dedupPages.has(page.url))dedupPages.set(page.url,page);
  const finalPages=[...dedupPages.values()].sort((a,b)=>a.url.localeCompare(b.url));
  const known=new Set(finalPages.map(p=>p.url));
  const finalEdges=edges.filter(e=>known.has(e.source)&&known.has(e.target)).sort((a,b)=>a.source.localeCompare(b.source)||a.target.localeCompare(b.target));

  return {
    site:SITE,
    generatedAt:new Date().toISOString(),
    source:'site-health-style-recursive-crawl',
    pages:finalPages,
    edges:finalEdges,
    coverage:{queuedStarts:START_URLS.length,seenPages:seen.size,crawledPages:finalPages.length,maxPages:MAX_PAGES}
  };
}

function extractAnchors(html,baseUrl){
  const results=[];
  const regex=/<a\b[^>]*href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while((match=regex.exec(html))){
    const raw=decodeEntities(match[1]??match[2]??match[3]??'').trim();
    if(!raw||raw.startsWith('#')||/^(mailto|tel|javascript|data):/i.test(raw))continue;
    try{results.push({href:new URL(raw,baseUrl).href,text:stripTags(match[4])})}catch{}
  }
  return results;
}

function normalizeInternalPageUrl(url){
  const parsed=new URL(url.href);
  if(parsed.origin!==SITE)return null;
  if(!/^https?:$/.test(parsed.protocol))return null;
  parsed.hash='';
  parsed.search='';
  parsed.pathname=parsed.pathname.replace(/\/index\.html?$/i,'/');
  if(/\.html?$/i.test(parsed.pathname))parsed.pathname=parsed.pathname.replace(/\.html?$/i,'');
  if(isAssetPath(parsed.pathname)||isExcludedPath(parsed.pathname))return null;
  return parsed.href.replace(/\/$/,parsed.pathname==='/'?'/':'');
}

function isAssetPath(path){
  return /\.(?:avif|bmp|css|csv|docx?|eot|gif|ico|jpe?g|js|json|map|mp3|mp4|mov|pdf|png|pptx?|svg|tiff?|txt|webm|webp|woff2?|xlsx?|xml|zip)$/i.test(path);
}
function isExcludedPath(path){return /^\/(?:cdn-cgi|wp-admin|wp-login|api|feed)(?:\/|$)/i.test(path)}
function extractTitle(html){const m=html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);return m?cleanText(stripTags(m[1])):''}
function pathToTitle(path){const part=path.split('/').filter(Boolean).pop()||'Homepage';return part.replace(/[-_]+/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}
function stripTags(value){return decodeEntities(String(value||'').replace(/<script\b[\s\S]*?<\/script>/gi,' ').replace(/<style\b[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' '))}
function cleanText(value){return String(value||'').replace(/\s+/g,' ').trim()}
function decodeEntities(value){return String(value||'').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&nbsp;/gi,' ').replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n))).replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCharCode(parseInt(n,16)))}
function fetchWithTimeout(url,options,timeoutMs){const controller=new AbortController();const timer=setTimeout(()=>controller.abort('timeout'),timeoutMs);return fetch(url,{...options,signal:controller.signal}).finally(()=>clearTimeout(timer))}
function json(value,status=200){return new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}})}
