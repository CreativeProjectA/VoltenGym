// ═══════════════════════════════════════════════════════════════════
//  VOLTEN GYM — Reenviar credenciales de un cliente que ya tiene cuenta
//  Supabase NO guarda la contraseña original en texto (solo un hash),
//  así que no se puede "recuperar" la de antes — se genera una NUEVA
//  contraseña y se le manda de nuevo. Sirve para "no le llegó el
//  WhatsApp" o "perdió su contraseña".
//
//  DESPLIEGUE (igual que las anteriores — Supabase → Edge Functions →
//  Deploy a new function, nómbrala EXACTO "reset-member-password"):
//   Usa los mismos secrets ya configurados: SB_URL, SB_SERVICE_KEY,
//   y opcional RESEND_API_KEY/CORTE_FROM para también mandar correo.
// ═══════════════════════════════════════════════════════════════════

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function randomPassword() {
  const n = Math.floor(1000 + Math.random() * 9000);
  return 'VoltenPower' + n;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const SB_URL = Deno.env.get('SB_URL');
    const SERVICE_KEY = Deno.env.get('SB_SERVICE_KEY');
    if (!SB_URL || !SERVICE_KEY) {
      return new Response(JSON.stringify({ error: 'Faltan secrets SB_URL/SB_SERVICE_KEY.' }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    // Verifica que quien llama es personal del gym
    const authHeader = req.headers.get('Authorization') || '';
    const callerToken = authHeader.replace(/^Bearer\s+/i, '');
    if (!callerToken) return new Response(JSON.stringify({ error: 'Sin sesión.' }), { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } });
    const callerRes = await fetch(SB_URL + '/auth/v1/user', { headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + callerToken } });
    const caller = await callerRes.json();
    if (!caller || !caller.id) return new Response(JSON.stringify({ error: 'Sesión inválida.' }), { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } });
    const profRes = await fetch(SB_URL + '/rest/v1/profiles?id=eq.' + caller.id + '&select=role', { headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY } });
    const profRows = await profRes.json();
    if (!profRows || !['admin', 'encargado', 'cajera'].includes(profRows[0]?.role)) {
      return new Response(JSON.stringify({ error: 'Solo el personal del gym puede hacer esto.' }), { status: 403, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const { profile_id } = await req.json();
    if (!profile_id) return new Response(JSON.stringify({ error: 'Falta profile_id.' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });

    // CANDADO: si la cuenta a la que le van a resetear la contraseña es de
    // PERSONAL (admin/encargado/cajera/contador) y no de un cliente, se
    // niega. Pasó de verdad: alguien reseteó "la contraseña de un cliente"
    // sin saber que esa cuenta era compartida con el acceso de trabajo de
    // un encargado (la misma persona es cliente Y personal), y sin querer
    // le tumbó el acceso al POS sin avisarle.
    const targetRes = await fetch(SB_URL + '/rest/v1/profiles?id=eq.' + profile_id + '&select=role,full_name', { headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY } });
    const targetRows = await targetRes.json();
    const targetRole = targetRows && targetRows[0] ? targetRows[0].role : null;
    if (targetRole && targetRole !== 'member') {
      return new Response(JSON.stringify({ error: 'Esta cuenta es de PERSONAL (' + targetRole + '), no de un cliente — no se puede resetear por aquí para no tumbar su acceso al POS por accidente. Si de verdad necesita una contraseña nueva, pídele a Armando que la cambie directo.' }), { status: 403, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const password = randomPassword();
    const updRes = await fetch(SB_URL + '/auth/v1/admin/users/' + profile_id, {
      method: 'PUT',
      headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const updated = await updRes.json();
    if (!updRes.ok) return new Response(JSON.stringify({ error: updated.msg || 'No se pudo cambiar la contraseña.' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });

    const email = updated.email || '';

    // Correo opcional, mismo patrón que create-member-account
    let emailSent = false;
    const RESEND_KEY = Deno.env.get('RESEND_API_KEY');
    const FROM = Deno.env.get('CORTE_FROM') || 'Volten Gym <onboarding@resend.dev>';
    if (RESEND_KEY && email) {
      try {
        const html = '<div style="font-family:sans-serif;max-width:480px"><h2 style="color:#F97316">Tu acceso a Volten Gym</h2>'
          + '<p>Se generó una nueva contraseña para tu cuenta:</p>'
          + '<p><b>Usuario:</b> ' + email.replace(/</g, '&lt;') + '<br><b>Contraseña:</b> ' + password + '</p></div>';
        const mailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + RESEND_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: FROM, to: [email], subject: 'Tu nueva contraseña de Volten Gym', html }),
        });
        emailSent = mailRes.ok;
      } catch (_) { /* no bloquea */ }
    }

    return new Response(JSON.stringify({ ok: true, email, password, emailSent }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
});
