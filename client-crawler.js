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
  return {
    site:'https://oceanliners.net',
    generatedAt:new Date().toISOString(),
    source:'site-health-style-browser-queue',
    pages:finalPages,
    edges:finalEdges,
    coverage:{seenPages:seen.size,crawledPages:finalPages.length,maxPages:LINK_MAP_MAX_PAGES}
  };
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

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',addTreeBrowserLink);
else addTreeBrowserLink();
