// ═══════════════════════════════════════════════════════════════════
//  VOLTEN GYM — Crea una sesión de pago con Stripe (membresía o coach)
//  La llama la app del cliente. Regresa la URL de pago de Stripe; la
//  app redirige ahí. Modo TEST mientras el dueño no active su cuenta
//  real de Stripe — el dinero es ficticio pero el flujo es real.
//
//  DESPLIEGUE (Supabase → Edge Functions → Deploy a new function,
//  nómbrala EXACTO "stripe-checkout", pega este código):
//   Secrets necesarios (Edge Functions → Secrets, si no están ya):
//     SB_URL          = https://mopyslyhjtnmvlksusjr.supabase.co
//     SB_SERVICE_KEY  = (tu service_role key)
//     STRIPE_SECRET_KEY = sk_test_... (o sk_live_... cuando el dueño
//                          active su cuenta real)
//     APP_URL         = https://voltengym.vercel.app  (o el dominio real)
// ═══════════════════════════════════════════════════════════════════

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const SB_URL = Deno.env.get('SB_URL');
    const SERVICE_KEY = Deno.env.get('SB_SERVICE_KEY');
    const STRIPE_KEY = Deno.env.get('STRIPE_SECRET_KEY');
    const APP_URL = Deno.env.get('APP_URL') || 'https://voltengym.vercel.app';
    if (!SB_URL || !SERVICE_KEY || !STRIPE_KEY) {
      return new Response(JSON.stringify({ error: 'Faltan secrets: SB_URL, SB_SERVICE_KEY o STRIPE_SECRET_KEY.' }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    // Verifica sesión del cliente (cualquier usuario logueado puede comprar su propia membresía)
    const authHeader = req.headers.get('Authorization') || '';
    const callerToken = authHeader.replace(/^Bearer\s+/i, '');
    if (!callerToken) return new Response(JSON.stringify({ error: 'Sin sesión.' }), { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } });
    const callerRes = await fetch(SB_URL + '/auth/v1/user', { headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + callerToken } });
    const caller = await callerRes.json();
    if (!caller || !caller.id) return new Response(JSON.stringify({ error: 'Sesión inválida.' }), { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } });

    const { kind, plan_id, coach_id, coach_days, branch_id } = await req.json();
    if (!branch_id) return new Response(JSON.stringify({ error: 'Falta tu sucursal.' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });

    let amountMxn = 0, productName = '';
    if (kind === 'plan') {
      const planRes = await fetch(SB_URL + '/rest/v1/plans?id=eq.' + plan_id + '&select=name,price', { headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY } });
      const planRows = await planRes.json();
      if (!planRows || !planRows[0]) return new Response(JSON.stringify({ error: 'Plan no encontrado.' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
      amountMxn = Number(planRows[0].price); productName = 'Membresía ' + planRows[0].name;
    } else if (kind === 'coach') {
      const cpRes = await fetch(SB_URL + '/rest/v1/coach_profiles?profile_id=eq.' + coach_id + '&select=monthly_price', { headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY } });
      const cpRows = await cpRes.json();
      const monthly = cpRows && cpRows[0] && Number(cpRows[0].monthly_price) || 0;
      if (!monthly) return new Response(JSON.stringify({ error: 'Este coach no tiene precio definido.' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
      amountMxn = coach_days === 7 ? Math.round(monthly / 4) : monthly;
      productName = 'Coach — ' + (coach_days === 7 ? '1 semana' : '1 mes');
    } else {
      return new Response(JSON.stringify({ error: 'kind debe ser "plan" o "coach".' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const body = new URLSearchParams({
      'mode': 'payment',
      'success_url': APP_URL + '/app.html?stripe=success',
      'cancel_url': APP_URL + '/app.html?stripe=cancel',
      'line_items[0][price_data][currency]': 'mxn',
      'line_items[0][price_data][product_data][name]': productName,
      'line_items[0][price_data][unit_amount]': String(Math.round(amountMxn * 100)),
      'line_items[0][quantity]': '1',
      'metadata[kind]': kind,
      'metadata[member_id]': caller.id,
      'metadata[branch_id]': branch_id,
      'metadata[plan_id]': plan_id || '',
      'metadata[coach_id]': coach_id || '',
      'metadata[coach_days]': String(coach_days || ''),
      'customer_email': caller.email || '',
    });
    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + STRIPE_KEY, 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const session = await stripeRes.json();
    if (!stripeRes.ok) return new Response(JSON.stringify({ error: session.error?.message || 'Error de Stripe.' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });

    return new Response(JSON.stringify({ ok: true, url: session.url }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
});
