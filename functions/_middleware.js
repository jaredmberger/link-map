const INCIDENT_PREFIX='incident:',EVENT_PREFIX='event:';

export async function onRequest(context) {
  const path = new URL(context.request.url).pathname;
  const component = `request:${path}`;
  try {
    const response = await context.next();
    if (response.status < 500) context.waitUntil?.(recover(context.env, component));
    return response;
  } catch (error) {
    context.waitUntil?.(report(context.env, component, error));
    throw error;
  }
}

async function report(env, component, error) {
  if (!env.CURATOR_ERROR_RECORDS) return;
  const source='Link Map',type='pages-function-error',message=error instanceof Error?error.message:String(error||'Unknown error'),now=new Date().toISOString(),fingerprint=await fp(source,component,type,message),key=INCIDENT_PREFIX+fingerprint,previous=await env.CURATOR_ERROR_RECORDS.get(key,'json');
  const incident={id:previous?.id||`incident_${fingerprint.slice(0,20)}`,fingerprint,source,component,severity:'p1',type,message,context:{},firstSeenAt:previous?.firstSeenAt||now,lastSeenAt:now,occurrences:Number(previous?.occurrences||0)+1,status:'active',recoveredAt:null,recoveryMessage:null};
  await env.CURATOR_ERROR_RECORDS.put(key,JSON.stringify(incident));
  await event(env,'incident',incident);
}

async function recover(env, component) {
  if (!env.CURATOR_ERROR_RECORDS) return;
  const listed=await env.CURATOR_ERROR_RECORDS.list({prefix:INCIDENT_PREFIX,limit:1000}),now=new Date().toISOString();
  for(const key of listed.keys){const i=await env.CURATOR_ERROR_RECORDS.get(key.name,'json');if(!i||i.status!=='active'||i.source!=='Link Map'||i.component!==component)continue;const r={...i,status:'recovered',recoveredAt:now,lastSuccessfulAt:now,recoveryMessage:'Route completed successfully.'};await env.CURATOR_ERROR_RECORDS.put(key.name,JSON.stringify(r),{expirationTtl:15552000});await event(env,'recovery',r);}
}
async function event(env,kind,i){const at=new Date().toISOString();await env.CURATOR_ERROR_RECORDS.put(`${EVENT_PREFIX}${at}:${Math.random().toString(36).slice(2,8)}`,JSON.stringify({kind,at,incidentId:i.id,fingerprint:i.fingerprint,source:i.source,component:i.component,severity:i.severity,status:i.status,message:i.message}),{expirationTtl:15552000});}
async function fp(s,c,t,m){const n=`${s}|${c}|${t}|${m}`.toLowerCase().replace(/\d{4}-\d\d-\d\d[t ][\d:.z+-]+/g,'<timestamp>').replace(/\b\d{6,}\b/g,'<number>'),h=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(n));return[...new Uint8Array(h)].map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,40)}
