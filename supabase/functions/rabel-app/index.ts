// Passwordless shared APK capability. Anyone possessing the APK can extract it.
// The service-role key remains in Supabase and this proxy only exposes menu APIs.
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, prefer, x-upsert, x-rabel-app-key',
  'Cache-Control': 'no-store',
};
const tables = new Set(['rabel_dishes', 'rabel_categories', 'rabel_hours', 'rabel_info']);
const functions = new Set(['rabel_move_and_delete_category', 'rabel_replace_hours', 'rabel_reorder_categories']);
function error(message: string, status: number) { return Response.json({message}, {status, headers:cors}); }
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, {status:204, headers:cors});
  const candidate = req.headers.get('x-rabel-app-key') || '';
  const expected = Deno.env.get('RABEL_APP_TOKEN_HASH') || '';
  if (!/^[a-f0-9]{64}$/.test(candidate) || !/^[a-f0-9]{64}$/.test(expected)) return error('Non autorizzato', 401);
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(candidate)))).map(n=>n.toString(16).padStart(2,'0')).join('');
  let difference = 0; for (let i=0; i<64; i++) difference |= digest.charCodeAt(i) ^ expected.charCodeAt(i);
  if (difference !== 0) return error('Non autorizzato', 401);
  const base = Deno.env.get('SUPABASE_URL'), service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!base || !service) return error('Servizio non configurato', 503);
  const url = new URL(req.url), prefix = '/rabel-app/';
  const at = url.pathname.indexOf(prefix);
  if (at < 0) return error('Percorso non valido', 404);
  const path = url.pathname.slice(at + prefix.length);
  let allowed = false;
  const table = path.match(/^rest\/v1\/([a-z_]+)$/);
  const rpc = path.match(/^rest\/v1\/rpc\/([a-z_]+)$/);
  if (table && tables.has(table[1])) allowed = ['GET','POST','PATCH','DELETE'].includes(req.method);
  if (rpc && functions.has(rpc[1])) allowed = req.method === 'POST';
  if (/^storage\/v1\/object\/rabel-photos\/dishes\/[0-9]+\/[a-f0-9-]+\.(jpg|png|webp)$/.test(path)) allowed = req.method === 'POST';
  if (!allowed || path.includes('..')) return error('Operazione non consentita', 403);
  const contentType = req.headers.get('content-type') || '';
  if (req.method !== 'GET' && !contentType.startsWith('application/json') && !/^image\/(jpeg|png|webp)$/.test(contentType) && req.method !== 'DELETE') return error('Formato non valido', 415);
  const body = ['POST','PATCH'].includes(req.method) ? await req.arrayBuffer() : undefined;
  if (body && body.byteLength > 5*1024*1024) return error('Richiesta troppo grande', 413);
  const headers = new Headers({apikey:service, Authorization:'Bearer '+service});
  if (contentType) headers.set('Content-Type', contentType);
  const prefer = req.headers.get('prefer'); if (prefer) headers.set('Prefer',prefer);
  if (path.startsWith('storage/')) headers.set('x-upsert','false');
  try {
    const upstream = await fetch(base+'/'+path+url.search,{method:req.method,headers,body,redirect:'error'});
    const outputHeaders = new Headers(cors);
    const type = upstream.headers.get('content-type'); if (type) outputHeaders.set('content-type', type);
    return new Response(upstream.body,{status:upstream.status,headers:outputHeaders});
  } catch (_) { return error('Servizio non raggiungibile', 502); }
});
