export async function onRequestGet(context){
  const {request,env}=context;
  if(!env.RECOVERY_EXPORT_TOKEN)return json({ok:false,error:'Recovery export is disabled because RECOVERY_EXPORT_TOKEN is not configured.'},503);
  if(request.headers.get('x-curator-recovery-key')!==env.RECOVERY_EXPORT_TOKEN)return json({ok:false,error:'Unauthorized recovery export request.'},401);
  if(!env.LINK_MAP_CACHE)return json({ok:false,error:'LINK_MAP_CACHE is not configured.'},500);

  try{
    const entries=[];let cursor;
    do{
      const page=await env.LINK_MAP_CACHE.list({limit:1000,...(cursor?{cursor}:{})});
      for(const item of page.keys){
        const raw=await env.LINK_MAP_CACHE.get(item.name,'text');
        if(raw===null)throw new Error(`Listed KV key disappeared during export: ${item.name}`);
        entries.push({key:item.name,value:raw});
      }
      cursor=page.list_complete?undefined:page.cursor;
    }while(cursor);

    entries.sort((a,b)=>a.key.localeCompare(b.key));
    const data={entries};
    const exportedAt=new Date().toISOString();
    const dataSha256=await sha256(JSON.stringify(data));
    const payload={
      format:'link-map-kv-recovery',
      schemaVersion:1,
      exportedAt,
      source:{service:'Ocean Liner Curator Link Map',binding:'LINK_MAP_CACHE',namespaceId:'9d3f33cd6d0940cfaf548649af119dfe'},
      integrity:{algorithm:'SHA-256',dataSha256},
      summary:{keyCount:entries.length},
      data
    };
    const stamp=exportedAt.replace(/[:.]/g,'-');
    return new Response(JSON.stringify(payload,null,2),{status:200,headers:{
      'content-type':'application/json; charset=utf-8',
      'content-disposition':`attachment; filename="link-map-recovery-${stamp}.json"`,
      'cache-control':'no-store',
      'x-content-type-options':'nosniff',
      'x-robots-tag':'noindex, nofollow, noarchive'
    }});
  }catch(error){
    return json({ok:false,error:'Recovery export failed.',detail:error?.message||String(error)},500);
  }
}
async function sha256(value){
  const bytes=new TextEncoder().encode(value);
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}
function json(value,status=200){
  return new Response(JSON.stringify(value,null,2),{status,headers:{
    'content-type':'application/json; charset=utf-8',
    'cache-control':'no-store',
    'x-content-type-options':'nosniff',
    'x-robots-tag':'noindex, nofollow, noarchive'
  }});
}
