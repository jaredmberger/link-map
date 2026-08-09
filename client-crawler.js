const LINK_MAP_START_URL='https://oceanliners.net/';
const LINK_MAP_MAX_PAGES=2000;

async function buildLinkMapClient({onProgress}={}){
  const queue=[LINK_MAP_START_URL];
  const seen=new Set();
  const pages=[];
  const edges=[];
  const edgeSeen=new Set();

  while(queue.length&&seen.size<LINK_MAP_MAX_PAGES){
    const pageUrl=queue.shift();
    if(seen.has(pageUrl))continue;
    seen.add(pageUrl);
    onProgress?.({phase:'crawl',seen:seen.size,queued:queue.length,url:pageUrl});

    const apiUrl=new URL('/api/link-map',location.origin);
    apiUrl.searchParams.set('url',pageUrl);
    const res=await fetch(apiUrl,{cache:'no-store'});
    const page=await res.json();
    if(!res.ok)throw new Error(page.error||`Link-map API returned ${res.status}`);

    const finalUrl=page.finalUrl||pageUrl;
    pages.push({url:finalUrl,title:page.title||finalUrl});

    for(const target of page.internalLinks||[]){
      const key=`${finalUrl}>${target}`;
      if(!edgeSeen.has(key)){
        edgeSeen.add(key);
        edges.push({source:finalUrl,target});
      }
      if(!seen.has(target)&&!queue.includes(target)&&seen.size+queue.length<LINK_MAP_MAX_PAGES){
        queue.push(target);
      }
    }
  }

  const dedupPages=new Map();
  for(const page of pages)if(!dedupPages.has(page.url))dedupPages.set(page.url,page);
  const finalPages=[...dedupPages.values()];
  const known=new Set(finalPages.map(p=>p.url));
  const finalEdges=edges.filter(e=>known.has(e.source)&&known.has(e.target));
  const snapshot={
    site:'https://oceanliners.net',
    generatedAt:new Date().toISOString(),
    source:'site-health-style-browser-queue',
    pages:finalPages,
    edges:finalEdges,
    coverage:{seenPages:seen.size,crawledPages:finalPages.length,maxPages:LINK_MAP_MAX_PAGES}
  };

  publishSearchIntelligenceSnapshot(snapshot).catch(error=>console.warn('Search Intelligence snapshot was not published:',error));
  return snapshot;
}

async function publishSearchIntelligenceSnapshot(snapshot){
  const res=await fetch('/api/search-intelligence',{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify(snapshot),
    cache:'no-store'
  });
  if(!res.ok){
    const data=await res.json().catch(()=>({}));
    throw new Error(data.error||`Snapshot endpoint returned ${res.status}`);
  }
  return res.json();
}

window.buildLinkMapClient=buildLinkMapClient;

function addTreeBrowserLink(){
  const actions=document.querySelector('.topbar .actions');
  if(!actions||actions.querySelector('[data-tree-browser-link]'))return;
  const link=document.createElement('a');
  link.href='/tree.html';
  link.className='btn';
  link.textContent='Text tree';
  link.setAttribute('data-tree-browser-link','');
  link.style.textDecoration='none';
  actions.insertBefore(link,actions.firstChild);
}

function normalizeHandoffPage(value){
  if(!value)return'';
  try{
    const url=new URL(value,'https://oceanliners.net');
    if(!['oceanliners.net','www.oceanliners.net'].includes(url.hostname.toLowerCase()))return'';
    url.protocol='https:';
    url.hostname='oceanliners.net';
    url.hash='';
    url.search='';
    let path=url.pathname.replace(/\/index\.html?$/i,'/').replace(/\.html?$/i,'');
    if(path.length>1)path=path.replace(/\/$/,'');
    url.pathname=path||'/';
    return url.href.replace(/\/$/,url.pathname==='/'?'/':'');
  }catch{return'';}
}

function applyHandoffFocus(){
  const params=new URLSearchParams(location.search);
  const target=normalizeHandoffPage(params.get('page')||params.get('url')||'');
  if(!target)return;
  let attempts=0;
  const timer=setInterval(()=>{
    attempts+=1;
    try{
      if(typeof selectNode==='function'){
        selectNode(target);
        const search=document.querySelector('#search');
        if(search)search.value=new URL(target).pathname;
        clearInterval(timer);
      }
    }catch{}
    if(attempts>=120)clearInterval(timer);
  },500);
}

function loadCuratorErrorReporter(){
  if(window.__CURATOR_CLIENT_ERROR_CAPTURE__||document.querySelector('script[data-curator-error-reporter]'))return;
  const script=document.createElement('script');
  script.src='https://errors.oceanliners.net/client-reporter.js?v=20260809-1';
  script.async=true;
  script.dataset.curatorErrorReporter='';
  document.head.appendChild(script);
}

loadCuratorErrorReporter();
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{addTreeBrowserLink();applyHandoffFocus();});
else{addTreeBrowserLink();applyHandoffFocus();}
