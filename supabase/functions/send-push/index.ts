// ═══════════════════════════════════════════════════════════════════
//  VOLTEN GYM — Manda una notificación push real (llega aunque el
//  celular esté bloqueado o la app cerrada; en iPhone solo si la app
//  se instaló en la pantalla de inicio, limitación de Apple).
//
//  DESPLIEGUE (igual que las anteriores — Supabase → Edge Functions →
//  Deploy a new function, nómbrala EXACTO "send-push"):
//   Secrets nuevos que hay que agregar (Settings → Edge Functions):
//     VAPID_PUBLIC_KEY  = BBPQ3aA1pqzk5eRwiukOD0yOk9uLzWfZjNYrNTht4DPamvt9Dug40kfR2gxv-28piSjv5Vf_03ozD63JFqzA5gQ
//     VAPID_PRIVATE_KEY = L9qq4wBF-CJLJBqbCPj0eu5gMsB1VHifwXoiv56Yk8M
//   (más los SB_URL y SB_SERVICE_KEY que ya tienes en las otras funciones)
//
//  Quién puede llamarla: solo personal del gym (coach/admin/encargado/
//  cajera) o el propio dueño de la cuenta -- se verifica con el token
//  de sesión de quien llama, igual que reset-member-password.
// ═══════════════════════════════════════════════════════════════════

import webpush from 'npm:web-push@3.6.7';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const SB_URL = Deno.env.get('SB_URL');
    const SERVICE_KEY = Deno.env.get('SB_SERVICE_KEY');
    const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY');
    const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY');
    if (!SB_URL || !SERVICE_KEY || !VAPID_PUBLIC || !VAPID_PRIVATE) {
      return new Response(JSON.stringify({ error: 'Faltan secrets SB_URL/SB_SERVICE_KEY/VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY.' }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }
    const authHeader = req.headers.get('Authorization') || '';
    const callerToken = authHeader.replace(/^Bearer\s+/i, '');
    if (!callerToken) return new Response(JSON.stringify({ error: 'Sin sesión.' }), { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } });
    const callerRes = await fetch(SB_URL + '/auth/v1/user', { headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + callerToken } });
    const caller = await callerRes.json();
    if (!caller || !caller.id) return new Response(JSON.stringify({ error: 'Sesión inválida.' }), { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } });

    const { profile_id, title, body, url } = await req.json();
    if (!profile_id || !title) return new Response(JSON.stringify({ error: 'Falta profile_id o title.' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });

    // Solo puede mandar push: el personal del gym (a cualquier cliente),
    // o el propio usuario mandándose algo a sí mismo (no aplica hoy pero
    // no está de más dejarlo seguro).
    if (caller.id !== profile_id) {
      const profRes = await fetch(SB_URL + '/rest/v1/profiles?id=eq.' + caller.id + '&select=role', { headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY } });
      const profRows = await profRes.json();
      if (!profRows || !['admin', 'encargado', 'cajera', 'coach'].includes(profRows[0]?.role)) {
        return new Response(JSON.stringify({ error: 'Solo el personal del gym puede mandar avisos.' }), { status: 403, headers: { ...CORS, 'Content-Type': 'application/json' } });
      }
    }

    webpush.setVapidDetails('mailto:soporte@voltengym.app', VAPID_PUBLIC, VAPID_PRIVATE);

    const subsRes = await fetch(SB_URL + '/rest/v1/push_subscriptions?profile_id=eq.' + profile_id, { headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY } });
    const subs = await subsRes.json();
    if (!subs || !subs.length) return new Response(JSON.stringify({ ok: true, sent: 0, note: 'Ese usuario no tiene notificaciones activadas en ningún dispositivo.' }), { headers: { ...CORS, 'Content-Type': 'application/json' } });

    const payload = JSON.stringify({ title, body: body || '', url: url || './app.html' });
    let sent = 0;
    for (const s of subs) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
        sent++;
      } catch (e) {
        // Suscripción vencida/inválida (410/404) -> se borra para no reintentar en vano.
        if (e && (e.statusCode === 410 || e.statusCode === 404)) {
          await fetch(SB_URL + '/rest/v1/push_subscriptions?id=eq.' + s.id, { method: 'DELETE', headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY } });
        }
      }
    }
    return new Response(JSON.stringify({ ok: true, sent, total: subs.length }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
});
