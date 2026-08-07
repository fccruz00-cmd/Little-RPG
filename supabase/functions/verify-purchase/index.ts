// verify-purchase: asks Google whether a Play Billing token is real, and
// when it is, brands the device a verified patron for good.
//
// Deploy: Supabase dashboard -> Edge Functions -> new function named
// verify-purchase, paste this file, and DISABLE "Enforce JWT verification"
// (the publishable key is not a JWT; every input here is validated against
// Google anyway, so an unauthenticated caller can only verify a REAL
// purchase, which is exactly the point).
//
// Secrets (dashboard -> Edge Functions -> Secrets):
//   GOOGLE_SA_JSON   the service account key file, pasted whole
//   ANDROID_PACKAGE  e.g. com.fccruz.littlerpg
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY arrive automatically.
//
// The service account comes from Play Console -> Setup -> API access, and
// needs the "View financial data, orders and cancellation survey
// responses" permission on the app. Nothing here can charge, refund or
// touch anyone's account: purchases.products.get is read-only.

const SKUS = new Set(['gems_pouch', 'gems_sack', 'gems_chest', 'gems_hoard']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
};

function b64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToDer(pem: string): Uint8Array {
  const body = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** A short-lived Google access token, signed with the service account. */
async function googleToken(email: string, privateKeyPem: string): Promise<string> {
  const enc = new TextEncoder();
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(enc.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const claims = b64url(enc.encode(JSON.stringify({
    iss: email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })));
  const key = await crypto.subtle.importKey(
    'pkcs8', pemToDer(privateKeyPem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = new Uint8Array(await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', key, enc.encode(`${header}.${claims}`),
  ));
  const jwt = `${header}.${claims}.${b64url(sig)}`;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer'
      + `&assertion=${jwt}`,
  });
  if (!res.ok) throw new Error(`oauth ${res.status}`);
  return (await res.json()).access_token;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405, headers: CORS });
  }

  let body: { device?: string; sku?: string; token?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'bad json' }, { status: 400, headers: CORS });
  }
  const { device, sku, token } = body;
  if (!device || !UUID.test(device) || !sku || !SKUS.has(sku)
      || !token || typeof token !== 'string' || token.length > 512) {
    return Response.json({ verified: false }, { status: 400, headers: CORS });
  }

  const sa = JSON.parse(Deno.env.get('GOOGLE_SA_JSON') ?? '{}');
  const pkg = Deno.env.get('ANDROID_PACKAGE');
  if (!sa.client_email || !sa.private_key || !pkg) {
    return Response.json({ error: 'not configured' }, { status: 503, headers: CORS });
  }

  // Ask Google. purchaseState 0 means purchased; anything else is not a
  // patron, including pending (1) and cancelled.
  const access = await googleToken(sa.client_email, sa.private_key);
  const check = await fetch(
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/`
    + `${encodeURIComponent(pkg)}/purchases/products/${encodeURIComponent(sku)}`
    + `/tokens/${encodeURIComponent(token)}`,
    { headers: { Authorization: `Bearer ${access}` } },
  );
  if (!check.ok) {
    return Response.json({ verified: false }, { headers: CORS });
  }
  const purchase = await check.json();
  if (purchase.purchaseState !== 0) {
    return Response.json({ verified: false }, { headers: CORS });
  }

  // Real. Brand the device, and pull its board row into the patron league
  // right away rather than waiting for its next submit.
  const url = Deno.env.get('SUPABASE_URL')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const db = (path: string, init: RequestInit) => fetch(`${url}${path}`, {
    ...init,
    headers: {
      apikey: service,
      Authorization: `Bearer ${service}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  await db('/rest/v1/verified_patrons', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ device, sku }),
  });
  await db(`/rest/v1/scores?device=eq.${device}`, {
    method: 'PATCH',
    body: JSON.stringify({ league: 'patron', verified: true }),
  });

  return Response.json({ verified: true }, { headers: CORS });
});
