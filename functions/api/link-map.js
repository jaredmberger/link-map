const SITE='https://oceanliners.net';
const USER_AGENT='OceanLinerCurator-LinkMap/5.0 (+https://oceanliners.net/)';

export async function onRequestGet(context){
  try{
    const url=new URL(context.request.url);
    const target=url.searchParams.get('url');
    if(!target)return json({error:'Missing url parameter.'},400);
    return await inspectPage(target);
  }catch(error){
    return json({error:error instanceof Error?error.message:String(error)},500);
  }
}

async function inspectPage(rawUrl){
  const requested=new URL(rawUrl,SITE);
  const normalizedRequested=normalizeInternalPageUrl(requested);
  if(!normalizedRequested)return json({error:'Only OceanLiners.net HTML pages may be inspected.'},400);

  let response;
  try{
    response=await fetchWithTimeout(normalizedRequested,{
      headers:{'user-agent':USER_AGENT,accept:'text/html,application/xhtml+xml'},
      redirect:'follow'
    },20000);
  }catch(error){
    return json({
      requestedUrl:normalizedRequested,
      finalUrl:normalizedRequested,
      status:null,
      title:pathToTitle(new URL(normalizedRequested).pathname),
      internalLinks:[],
      error:error instanceof Error?error.message:String(error)
    },200);
  }

  const contentType=response.headers.get('content-type')||'';
  const finalUrl=normalizeInternalPageUrl(new URL(response.url||normalizedRequested))||normalizedRequested;
  const result={
    requestedUrl:normalizedRequested,
    finalUrl,
    status:response.status,
    title:pathToTitle(new URL(finalUrl).pathname),
    internalLinks:[],
    error:null
  };

  if(!response.ok||!contentType.toLowerCase().includes('text/html'))return json(result,200);

  const html=await response.text();
  result.title=extractTitle(html)||result.title;
  const internal=new Set();
  for(const anchor of extractAnchors(html,finalUrl)){
    let parsed;
    try{parsed=new URL(anchor.href)}catch{continue}
    const normalized=normalizeInternalPageUrl(parsed);
    if(normalized&&normalized!==finalUrl)internal.add(normalized);
  }
  result.internalLinks=[...internal].sort();
  return json(result,200);
}

function extractAnchors(html,baseUrl){
  const results=[];
  const regex=/<a\b[^>]*href\s*=\s*(?:\"([^\"]*)\"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi;
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
function decodeEntities(value){return String(value||'').replace(/&amp;/gi,'&').replace(/&quot;/gi,'\"').replace(/&#39;|&apos;/gi,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&nbsp;/gi,' ').replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n))).replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCharCode(parseInt(n,16)))}
function fetchWithTimeout(url,options,timeoutMs){const controller=new AbortController();const timer=setTimeout(()=>controller.abort('timeout'),timeoutMs);return fetch(url,{...options,signal:controller.signal}).finally(()=>clearTimeout(timer))}
function json(value,status=200){return new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}})}
