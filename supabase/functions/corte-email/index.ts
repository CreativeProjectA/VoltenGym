// ═══════════════════════════════════════════════════════════════════
//  VOLTEN GYM — Correo automático del corte de caja
//  Edge Function de Supabase. El POS la llama al cerrar turno y le manda
//  el resumen; ésta lo envía por correo al dueño / contadores.
//
//  DESPLIEGUE (una sola vez, lo hace Armando):
//   1. Crea cuenta gratis en https://resend.com y saca un API key.
//   2. En Supabase → Edge Functions → Secrets, agrega:
//        RESEND_API_KEY = (tu key de Resend)
//        CORTE_TO       = correo-del-dueño@ejemplo.com,contador@ejemplo.com
//        CORTE_FROM     = Volten Gym <onboarding@resend.dev>   (o tu dominio)
//   3. Despliega:  supabase functions deploy corte-email --no-verify-jwt
//   4. En pos.html (doCloseShift), tras cerrar el turno, llama:
//        await sb.functions.invoke('corte-email', { body: { resumen: this._corte } })
// ═══════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { resumen } = await req.json();
    const key = Deno.env.get('RESEND_API_KEY');
    const to = (Deno.env.get('CORTE_TO') || '').split(',').map((x) => x.trim()).filter(Boolean);
    const from = Deno.env.get('CORTE_FROM') || 'Volten Gym <onboarding@resend.dev>';
    if (!key || !to.length) {
      return new Response(JSON.stringify({ error: 'Falta configurar RESEND_API_KEY o CORTE_TO' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const html = '<div style="font-family:sans-serif;max-width:480px">'
      + '<h2 style="color:#F97316">Corte de caja — Volten Gym</h2>'
      + '<pre style="background:#F5F5F5;border-radius:12px;padding:16px;font-size:14px;white-space:pre-wrap">'
      + String(resumen || '').replace(/</g, '&lt;')
      + '</pre></div>';

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject: 'Corte de caja — ' + new Date().toLocaleDateString('es-MX'), html }),
    });
    const data = await r.json();
    return new Response(JSON.stringify({ ok: r.ok, data }), { status: r.ok ? 200 : 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
