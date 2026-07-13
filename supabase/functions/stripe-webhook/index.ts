// ═══════════════════════════════════════════════════════════════════
//  VOLTEN GYM — Webhook de Stripe: cuando el pago se confirma, activa
//  la membresía o el coach del cliente (acumulando días si ya tenía
//  vigencia, igual que hace el POS).
//
//  DOS SUCURSALES = DOS CUENTAS DE STRIPE, así que este webhook recibe
//  avisos de las 2 cuentas. Como cada cuenta firma sus eventos con un
//  secreto distinto, se prueban los 2 secretos hasta encontrar el que
//  coincide — así se sabe de qué cuenta viene, sin fiarse de nada del
//  contenido del mensaje hasta comprobar la firma primero.
//
//  DESPLIEGUE (Supabase → Edge Functions → Deploy a new function,
//  nómbrala EXACTO "stripe-webhook", pega este código, con
//  --no-verify-jwt si usas CLI; desde el navegador no hace falta
//  marcar nada especial):
//
//  1. Después de desplegarla, copia su URL (algo como
//     https://mopyslyhjtnmvlksusjr.supabase.co/functions/v1/stripe-webhook)
//  2. En CADA cuenta de Stripe (Gómez Morín Y Tres Cantos, por separado):
//     dashboard.stripe.com → Developers → Webhooks → Add endpoint,
//     pega la MISMA URL, y selecciona el evento "checkout.session.completed".
//  3. Cada cuenta te da su propio "Signing secret" (empieza whsec_...).
//     Agrégalos como 2 secrets separados aquí:
//       STRIPE_WEBHOOK_SECRET_GM = whsec_... (el de Gómez Morín)
//       STRIPE_WEBHOOK_SECRET_TC = whsec_... (el de Tres Cantos)
//  4. Los secrets SB_URL / SB_SERVICE_KEY ya deberían estar de las
//     funciones anteriores (se comparten en todo el proyecto).
// ═══════════════════════════════════════════════════════════════════

async function verifyStripeSignature(payload: string, sigHeader: string, secret: string): Promise<boolean> {
  const parts = Object.fromEntries(sigHeader.split(',').map((p) => p.split('=')));
  const timestamp = parts['t'];
  const sig = parts['v1'];
  if (!timestamp || !sig) return false;
  const signedPayload = timestamp + '.' + payload;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
  const expected = Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return expected === sig;
}

function dISO(d: Date) { return d.toISOString().slice(0, 10); }

Deno.serve(async (req) => {
  try {
    const SB_URL = Deno.env.get('SB_URL');
    const SERVICE_KEY = Deno.env.get('SB_SERVICE_KEY');
    // Hasta 3 secretos posibles: uno por sucursal, más el genérico viejo
    // por si alguna cuenta todavía no tiene el suyo específico configurado.
    // .trim() por si el copy/paste dejó un espacio o salto de línea invisible.
    const candidateSecrets = [
      Deno.env.get('STRIPE_WEBHOOK_SECRET_GM'),
      Deno.env.get('STRIPE_WEBHOOK_SECRET_TC'),
      Deno.env.get('STRIPE_WEBHOOK_SECRET'),
    ].map((s) => (s || '').trim()).filter((s): s is string => !!s);
    if (!SB_URL || !SERVICE_KEY || !candidateSecrets.length) {
      return new Response('Faltan secrets', { status: 500 });
    }
    const payload = await req.text();
    const sig = req.headers.get('stripe-signature') || '';
    let valid = false;
    for (const secret of candidateSecrets) {
      if (await verifyStripeSignature(payload, sig, secret)) { valid = true; break; }
    }
    if (!valid) return new Response('Firma inválida', { status: 400 });

    const event = JSON.parse(payload);
    if (event.type !== 'checkout.session.completed') return new Response('ok', { status: 200 });

    const session = event.data.object;
    const meta = session.metadata || {};
    const memberId = meta.member_id;
    const branchId = meta.branch_id;
    if (!memberId || !branchId) return new Response('ok (sin metadata)', { status: 200 });

    const H = { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY, 'Content-Type': 'application/json' };
    const amount = (session.amount_total || 0) / 100;

    if (meta.kind === 'plan' && meta.plan_id) {
      const planRes = await fetch(SB_URL + '/rest/v1/plans?id=eq.' + meta.plan_id + '&select=duration_days', { headers: H });
      const planRows = await planRes.json();
      const durationDays = planRows && planRows[0] ? Number(planRows[0].duration_days) : 30;

      // Acumulación: si ya tiene vigencia en ESTA sucursal, la nueva compra se suma al final.
      const subRes = await fetch(SB_URL + '/rest/v1/subscriptions?member_id=eq.' + memberId + '&branch_id=eq.' + branchId + '&status=neq.canceled&select=end_date&order=end_date.desc&limit=1', { headers: H });
      const subRows = await subRes.json();
      let base = new Date();
      if (subRows && subRows[0] && new Date(subRows[0].end_date + 'T12:00:00') > base) base = new Date(subRows[0].end_date + 'T12:00:00');
      const end = new Date(base.getTime() + durationDays * 86400000);

      await fetch(SB_URL + '/rest/v1/subscriptions', {
        method: 'POST', headers: { ...H, Prefer: 'return=minimal' },
        body: JSON.stringify({
          member_id: memberId, plan_id: meta.plan_id, branch_id: branchId,
          status: 'active', start_date: dISO(new Date()), end_date: dISO(end),
          price_paid: amount, payment_method: 'stripe',
        }),
      });
    } else if (meta.kind === 'coach' && meta.coach_id) {
      const days = Number(meta.coach_days) || 30;
      const until = dISO(new Date(Date.now() + days * 86400000));
      await fetch(SB_URL + '/rest/v1/member_profiles', {
        method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ profile_id: memberId, coach_id: meta.coach_id, coach_until: until, branch_id: branchId, coach_cancelled: false }),
      });
      // También en su ficha del POS si ya tiene una (para que la cajera lo vea en Clientes)
      await fetch(SB_URL + '/rest/v1/customers?profile_id=eq.' + memberId, {
        method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
        body: JSON.stringify({ coach_id: meta.coach_id, coach_until: until, coach_cancelled: false }),
      });
    }

    return new Response('ok', { status: 200 });
  } catch (e) {
    return new Response('Error: ' + String(e), { status: 500 });
  }
});
