// ═══════════════════════════════════════════════════════════════════
//  VOLTEN GYM — Cuenta de la app automática al pagar la membresía
//  Edge Function de Supabase. La llama el POS justo después de cobrar
//  una membresía a un cliente que todavía no tiene cuenta vinculada.
//  Crea el usuario (auth.users) con una contraseña temporal y regresa
//  las credenciales para que la cajera se las dé al cliente (WhatsApp
//  o pantalla) — el cliente puede cambiar su contraseña luego en Perfil.
//
//  Usa la SERVICE_ROLE_KEY, que SOLO vive aquí (nunca en el navegador).
//
//  DESPLIEGUE (una sola vez, lo hace Armando — igual que corte-email):
//   1. En Supabase → Edge Functions → Secrets, agrega (si no están ya):
//        SB_URL          = https://mopyslyhjtnmvlksusjr.supabase.co
//        SB_SERVICE_KEY  = (tu service_role key, Settings → API)
//   2. Despliega:  supabase functions deploy create-member-account --no-verify-jwt
//      (--no-verify-jwt porque la verificación de que quien llama es
//       personal del gym la hacemos aquí adentro, contra la tabla profiles)
// ═══════════════════════════════════════════════════════════════════

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function randomPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const SB_URL = Deno.env.get('SB_URL');
    const SERVICE_KEY = Deno.env.get('SB_SERVICE_KEY');
    if (!SB_URL || !SERVICE_KEY) {
      return new Response(JSON.stringify({ error: 'Falta configurar SB_URL o SB_SERVICE_KEY en los secrets de la función.' }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    // 1) Verifica que quien llama es personal del gym (con su propio token, no el service key)
    const authHeader = req.headers.get('Authorization') || '';
    const callerToken = authHeader.replace(/^Bearer\s+/i, '');
    if (!callerToken) return new Response(JSON.stringify({ error: 'Sin sesión.' }), { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } });
    const callerRes = await fetch(SB_URL + '/auth/v1/user', { headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + callerToken } });
    const caller = await callerRes.json();
    if (!caller || !caller.id) return new Response(JSON.stringify({ error: 'Sesión inválida.' }), { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } });
    const profRes = await fetch(SB_URL + '/rest/v1/profiles?id=eq.' + caller.id + '&select=role', { headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY } });
    const profRows = await profRes.json();
    const callerRole = profRows && profRows[0] && profRows[0].role;
    if (!['admin', 'encargado', 'cajera'].includes(callerRole)) {
      return new Response(JSON.stringify({ error: 'Solo el personal del gym puede crear cuentas.' }), { status: 403, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    // 2) Datos del cliente
    const { customer_id, full_name, email, branch_id, coach_id, coach_until } = await req.json();
    if (!customer_id || !email) {
      return new Response(JSON.stringify({ error: 'Falta el correo del cliente — no se puede crear su cuenta sin correo.' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const password = randomPassword();

    // 3) Crea la cuenta (auth.users) confirmada, sin necesidad de que el cliente confirme correo
    const createRes = await fetch(SB_URL + '/auth/v1/admin/users', {
      method: 'POST',
      headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email, password, email_confirm: true,
        user_metadata: { full_name: full_name || '', role: 'member' },
      }),
    });
    const created = await createRes.json();
    if (!createRes.ok || !created.id) {
      // Correo ya registrado u otro error — lo regresamos tal cual para que el POS avise a la cajera.
      return new Response(JSON.stringify({ error: created.msg || created.error_description || 'No se pudo crear la cuenta (¿el correo ya está en uso?).' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }
    const profileId = created.id;

    // 4) profiles.role ya lo crea el trigger de Supabase normalmente, pero por si acaso lo forzamos
    await fetch(SB_URL + '/rest/v1/profiles?id=eq.' + profileId, {
      method: 'PATCH',
      headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ role: 'member', full_name: full_name || null }),
    });

    // 5) member_profiles con su sucursal y coach ya listos (mismo dato que quedó en la ficha del POS)
    const mp: Record<string, unknown> = { profile_id: profileId };
    if (branch_id) mp.branch_id = branch_id;
    if (coach_id) mp.coach_id = coach_id;
    if (coach_until) mp.coach_until = coach_until;
    await fetch(SB_URL + '/rest/v1/member_profiles', {
      method: 'POST',
      headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(mp),
    });

    // 6) liga la ficha del POS con la cuenta nueva
    await fetch(SB_URL + '/rest/v1/customers?id=eq.' + customer_id, {
      method: 'PATCH',
      headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ profile_id: profileId }),
    });

    // 7) pasa sus membresías de la ficha a la cuenta nueva (para que ya las vea en su teléfono)
    await fetch(SB_URL + '/rest/v1/subscriptions?customer_id=eq.' + customer_id + '&member_id=is.null', {
      method: 'PATCH',
      headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ member_id: profileId }),
    });

    return new Response(JSON.stringify({ ok: true, profile_id: profileId, email, password }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
});
